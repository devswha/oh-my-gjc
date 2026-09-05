"""Explicit caption modes, WebVTT parsing, and transport/auth boundaries."""
import json
from pathlib import Path
import socket
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from engine import captions as cap, fetch_chain as fc, safety
from engine.transport import SessionPool

VIDEO = "https://www.youtube.com/watch?v=fixture0001"
TRACK = "https://captions.public.test/en.vtt"
VTT = (Path(__file__).parent / "fixtures/public-captions.vtt").read_text()


def info(**kwargs):
    return {"id": "fixture0001", "webpage_url": VIDEO, "extractor_key": "Youtube", **kwargs}


class CaptionTests(unittest.TestCase):
    def fetch(self, data, source="manual", language="en"):
        with patch.object(cap, "_extract_info", return_value=data), patch.object(safety, "classify_url", return_value=(True, "public")):
            return cap.fetch_captions(VIDEO, language=language, source=source)

    def test_webvtt_preserves_overlap_repeats_timing_and_multiline_text(self):
        cues = cap.parse_webvtt("\ufeff" + VTT.replace("\n", "\r\n"))
        self.assertEqual(len(cues), 4)
        self.assertEqual(cues[0], {"start_ms": 0, "end_ms": 2000, "text": "Hello & welcome."})
        self.assertEqual(cues[1], cues[2])
        self.assertEqual(cues[1]["start_ms"], 1500)
        self.assertEqual(cues[1]["text"], "Overlapping words.\nSecond line.")
        self.assertEqual(cues[3]["text"], "Word timing")
        self.assertEqual(cap._milliseconds("01:01:01.001"), 3_661_001)

    def test_invalid_or_segmented_vtt_is_typed(self):
        for data, state in [("<html>login</html>", "unsupported"),
                            ("WEBVTT\n\n00:60.000 --> 01:01.000\na", "error"),
                            ("WEBVTT\n\n00:01.000 --> 00:00.000\na", "error"),
                            ("WEBVTT\n\nmalformed", "error"),
                            ("WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00.000,MPEGTS:9000\n\n", "unsupported")]:
            with self.subTest(data=data), self.assertRaises(cap.CaptionError) as error:
                cap.parse_webvtt(data)
            self.assertEqual(error.exception.state, state)
        with patch.object(cap, "_CAPTION_MAX_BYTES", 10), self.assertRaises(cap.CaptionError) as error:
            cap.parse_webvtt(VTT)
        self.assertEqual(error.exception.reason, "caption_byte_limit")
        with patch.object(cap, "_MAX_CUES", 2), self.assertRaises(cap.CaptionError) as error:
            cap.parse_webvtt(VTT)
        self.assertEqual(error.exception.reason, "caption_cue_limit")

    def test_inline_subtitle_data_and_provenance(self):
        with patch.object(cap, "_public_request") as network:
            result = self.fetch(info(subtitles={"en": [{"ext": "vtt", "data": VTT}]}))
        self.assertTrue(result.ok)
        network.assert_not_called()
        self.assertEqual(result.extraction_meta["caption_source"], "manual")
        self.assertEqual(result.extraction_meta["subtitle_transport"], "extractor_data")
        payload = json.loads(result.content)
        self.assertEqual(payload["video"]["id"], "fixture0001")
        self.assertEqual(payload["language"], "en")
        self.assertEqual(len(payload["cues"]), 4)
        self.assertIn(result.untrusted_content_boundary["begin"], result.to_untrusted_text())
        self.assertNotIn("Hello", json.dumps(result.to_dict()))

    def test_exact_language_and_source_never_silently_fallback(self):
        automatic = info(subtitles={}, automatic_captions={"en": [{"ext": "vtt", "data": VTT}]})
        self.assertEqual(self.fetch(automatic).extraction_meta["caption_status"], "no_captions")
        result = self.fetch(automatic, source="auto")
        self.assertTrue(result.ok)
        self.assertEqual(json.loads(result.content)["source"], "auto")
        self.assertEqual(self.fetch(automatic, source="auto", language="ko").verdict, "no_captions")
        variants = info(subtitles={"en-US": [{"ext": "vtt", "data": VTT}]})
        self.assertEqual(self.fetch(variants, language="en").verdict, "no_captions")

    def test_absent_non_vtt_auth_live_and_parser_errors_are_distinct(self):
        samples = [
            (info(subtitles={}), "no_captions"),
            (info(subtitles={"en": [{"ext": "ttml", "data": "xml"}]}), "unsupported"),
            (info(availability="needs_auth"), "auth_required"),
            (info(is_live=True), "unsupported"),
            (info(subtitles={"en": [{"ext": "vtt", "data": "WEBVTT\n\nbad"}]}), "error"),
            (info(subtitles={"en": [{"ext": "vtt", "data": "WEBVTT\n\n"}]}), "no_captions"),
        ]
        for data, state in samples:
            with self.subTest(state=state):
                result = self.fetch(data)
                self.assertEqual(result.extraction_meta["caption_status"], state)
                self.assertFalse(result.ok)
                self.assertEqual(result.content, "")
        with patch.object(cap, "_extract_info", side_effect=cap.CaptionError("unsupported", "yt_dlp_missing_or_incompatible")), patch.object(safety, "classify_url", return_value=(True, "public")):
            result = cap.fetch_captions(VIDEO, language="en")
        self.assertEqual(result.verdict, "unsupported")
        self.assertEqual(result.extraction_meta["error"], "yt_dlp_missing_or_incompatible")

    def test_public_subtitle_url_uses_transport_and_records_final_url(self):
        response = SimpleNamespace(status_code=200, content=VTT.encode(), url=TRACK + "?public=1")
        with patch.object(cap, "_public_request", return_value=response) as network:
            result = self.fetch(info(subtitles={"en": [{"ext": "vtt", "url": TRACK}]}))
        self.assertTrue(result.ok)
        network.assert_called_once_with(TRACK, timeout=25)
        self.assertEqual(result.extraction_meta["subtitle_url_requested"], TRACK)
        self.assertEqual(result.extraction_meta["subtitle_url_final"], response.url)
        for status, state in [(401, "auth_required"), (403, "error"), (429, "error")]:
            response.status_code = status
            with patch.object(cap, "_public_request", return_value=response):
                result = self.fetch(info(subtitles={"en": [{"ext": "vtt", "url": TRACK}]}))
            self.assertEqual(result.verdict, state)

    def test_caption_failure_is_terminal_never_generic_grid(self):
        with patch.object(cap, "fetch_captions", return_value=fc.FetchResult(False, verdict="no_captions")) as captions, patch.object(fc, "_fetch_core") as grid:
            result = fc.fetch(VIDEO, caption_language="en", caption_source="manual")
        self.assertFalse(result.ok)
        captions.assert_called_once()
        grid.assert_not_called()

    def test_batch_preflight_keeps_typed_caption_failures(self):
        results = fc.fetch_many(["http://127.0.0.1/"], caption_language="en")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].extraction_meta["caption_status"], "error")
        self.assertEqual(results[0].extraction_meta["error"], "ssrf_blocked")

    def test_private_and_unsupported_video_never_load_extractor(self):
        with patch.object(cap, "_extract_info") as extractor:
            result = cap.fetch_captions("http://127.0.0.1/", language="en")
            self.assertEqual(result.extraction_meta["error"], "ssrf_blocked")
            with patch.object(safety, "classify_url", return_value=(True, "public")):
                result = cap.fetch_captions("https://other.test/video", language="en")
            self.assertEqual(result.verdict, "unsupported")
            extractor.assert_not_called()

    def test_transport_strips_cookie_auth_and_uses_existing_pinned_get(self):
        response = SimpleNamespace(status_code=200)
        with patch.object(safety, "classify_url", return_value=(True, "public")), patch.object(cap.POOL, "request", return_value=(response, None)) as request:
            cap._public_request(TRACK, timeout=5, headers={"Cookie": "secret", "Authorization": "secret", "Accept": "text/vtt"})
        self.assertEqual(request.call_args.kwargs["extra_headers"], {"Accept": "text/vtt"})
        self.assertFalse(request.call_args.kwargs["allow_private"])
        with patch.object(cap.POOL, "request") as request:
            with self.assertRaises(cap.CaptionError):
                cap._public_request("http://127.0.0.1/", timeout=5)
            request.assert_not_called()

    def test_metadata_post_is_dns_pinned_drops_credentials_and_rejects_redirect(self):
        requests = SimpleNamespace(post=Mock(return_value=SimpleNamespace(status_code=302)))
        curl = SimpleNamespace(CurlOpt=SimpleNamespace(RESOLVE=10203), requests=requests)
        with patch.dict(sys.modules, {"curl_cffi": curl}), patch.object(safety, "classify_url", return_value=(True, "public")), patch.object(safety, "curl_resolve_entries", return_value=(["public.test:443:93.184.216.34"], "public")):
            with self.assertRaises(cap.CaptionError) as error:
                cap._public_request("https://public.test/api", timeout=5, method="POST", data=b"{}", headers={"Authorization": "secret", "Content-Type": "application/json"})
        self.assertEqual(error.exception.reason, "metadata_post_redirect")
        args = requests.post.call_args.kwargs
        self.assertEqual(args["curl_options"], {10203: ["public.test:443:93.184.216.34"]})
        self.assertEqual(args["headers"], {"Content-Type": "application/json"})
        self.assertFalse(args["allow_redirects"])
        self.assertTrue(args["discard_cookies"])
        self.assertEqual(args["proxy"], "")

    def test_subtitle_redirect_to_private_host_is_never_fetched(self):
        redirect = SimpleNamespace(status_code=302, headers={"Location": "http://127.0.0.1/private"})
        resolver = lambda host, port, proto=0: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port))]
        with patch.object(safety.socket, "getaddrinfo", side_effect=resolver), patch.object(SessionPool, "_pinned_get", return_value=redirect) as get:
            with self.assertRaises(cap.CaptionError):
                cap._public_request(TRACK, timeout=5)
        self.assertEqual(get.call_count, 1)

    def test_ytdlp_adapter_disables_runtime_side_effects_and_processes_no_download(self):
        dirs, loaded = SimpleNamespace(value=["original"]), SimpleNamespace(value=False)
        observed = {}
        class FakeDL:
            def __init__(self, params, auto_init):
                observed.update(params=params, auto_init=auto_init, dirs=dirs.value, loaded=loaded.value)
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def add_info_extractor(self, extractor):
                pass
            def extract_info(self, url, **kwargs):
                observed["extract"] = kwargs
                request = SimpleNamespace(url=TRACK, method="GET", data=None, headers={"Cookie": "secret"})
                self.urlopen(request)
                return info(subtitles={})
        response_type = lambda *args, **kwargs: None
        modules = {"yt_dlp": SimpleNamespace(YoutubeDL=FakeDL),
                   "yt_dlp.globals": SimpleNamespace(plugin_dirs=dirs, all_plugins_loaded=loaded),
                   "yt_dlp.networking.common": SimpleNamespace(Response=response_type),
                   "yt_dlp.networking.exceptions": SimpleNamespace(HTTPError=RuntimeError),
                   "yt_dlp.extractor.youtube": SimpleNamespace(YoutubeIE=lambda: SimpleNamespace(suitable=lambda _: True))}
        response = SimpleNamespace(content=b"{}", url=TRACK, status_code=200, headers={})
        with patch.dict(sys.modules, modules), patch.object(cap, "_public_request", return_value=response) as request:
            self.assertEqual(cap._extract_info(VIDEO, 5)["id"], "fixture0001")
        self.assertEqual(observed["extract"], {"download": False, "process": False})
        self.assertFalse(observed["auto_init"])
        self.assertEqual(observed["dirs"], [])
        self.assertTrue(observed["loaded"])
        self.assertEqual(dirs.value, ["original"])
        self.assertFalse(loaded.value)
        params = observed["params"]
        self.assertIs(params["cachedir"], False)
        self.assertEqual(params["js_runtimes"], {})
        self.assertEqual(params["remote_components"], [])
        self.assertIsNone(params["cookiefile"])
        self.assertIsNone(params["cookiesfrombrowser"])
        self.assertFalse(params["usenetrc"])
        request.assert_called_once()


if __name__ == "__main__":
    unittest.main()
