"""Explicit caption modes, WebVTT parsing, and transport/auth boundaries."""
from contextlib import ExitStack
import json
from pathlib import Path
import socket
import subprocess
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit

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

    def test_webvtt_allows_arbitrary_blank_lines_between_blocks(self):
        expected = cap.parse_webvtt(VTT)
        for blanks in (1, 2, 3, 4, 7, 32):
            for whitespace in ("", " ", "\t", " \t"):
                for newline in ("\n", "\r\n", "\r"):
                    with self.subTest(blanks=blanks, whitespace=whitespace, newline=newline):
                        separator = "\n" + (whitespace + "\n") * blanks
                        spaced = VTT.replace("\n\n", separator).replace("\n", newline)
                        self.assertEqual(cap.parse_webvtt(spaced), expected)

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
        class FakeIE:
            @classmethod
            def ie_key(cls):
                return "Youtube"
            def suitable(self, url):
                return True
        modules = {"yt_dlp": SimpleNamespace(YoutubeDL=FakeDL),
                   "yt_dlp.globals": SimpleNamespace(plugin_dirs=dirs, all_plugins_loaded=loaded),
                   "yt_dlp.networking.common": SimpleNamespace(Response=response_type),
                   "yt_dlp.networking.exceptions": SimpleNamespace(HTTPError=RuntimeError),
                   "yt_dlp.extractor.youtube": SimpleNamespace(YoutubeIE=FakeIE)}
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


class YoutubeDLIntegrationTests(unittest.TestCase):
    """Real YoutubeDL/YoutubeIE with in-memory HTTP fixtures, verified on 2026.8.19.

    No mocking of player parsing, access checks, fallback loops, or subtitle
    extraction. Dependency-free runs skip this class; never install anything.
    """

    @classmethod
    def setUpClass(cls):
        try:
            from yt_dlp.extractor.youtube import YoutubeIE
            from yt_dlp.version import __version__
            from curl_cffi import Curl
        except ImportError:
            raise unittest.SkipTest("actual yt-dlp + curl_cffi not installed")
        cls.youtube_ie = YoutubeIE
        cls.curl = Curl
        cls.ytdlp_version = __version__

    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.calls = []
        self.blocked_io = []
        for target, name in ((socket, "getaddrinfo"), (socket.socket, "connect"),
                             (socket.socket, "connect_ex"), (socket.socket, "sendto"),
                             (subprocess, "Popen"), (self.curl, "perform")):
            blocked = self.stack.enter_context(patch.object(
                target, name, side_effect=AssertionError(f"offline fixture forbids {name}")))
            self.blocked_io.append(blocked)
        self.stack.enter_context(patch.object(safety, "classify_url", return_value=(True, "fixture")))

    def tearDown(self):
        # Fail even if an extractor catches a blocked operation's exception.
        for blocked in self.blocked_io:
            blocked.assert_not_called()

    @staticmethod
    def public_player(source="manual"):
        track = {"baseUrl": "https://www.youtube.com/api/timedtext?v=fixture0001&lang=en",
                 "languageCode": "en", "vssId": ".en", "name": {"simpleText": "English"}}
        if source == "auto":
            track.update(kind="asr", vssId="a.en")
        return {
            "videoDetails": {"videoId": "fixture0001", "title": "Sign in tutorial: private video settings",
                             "shortDescription": "A public guide to authentication.", "lengthSeconds": "4"},
            "playabilityStatus": {"status": "OK"},
            # These must stay skipped through the subclass's Youtube key.
            "streamingData": {"hlsManifestUrl": "https://media.public.test/live.m3u8",
                              "dashManifestUrl": "https://media.public.test/video.mpd"},
            "captions": {"playerCaptionsTracklistRenderer": {"captionTracks": [track]}},
        }

    def fetch_player(self, player, *, initial_player=True, source="manual"):
        self.calls.clear()
        config = {"INNERTUBE_CONTEXT": {"client": {"clientName": "WEB", "clientVersion": "2.20260819.01.00"}},
                  "PLAYER_JS_URL": "/s/player/abcd1234/player_ias.vflset/en_US/base.js", "STS": 12345}
        initial = {"contents": {"twoColumnWatchNextResults": {"results": {"results": {"contents": []}}}}}

        def webpage(cfg, include_player=True):
            text = "<html><script>ytcfg.set(" + json.dumps(cfg) + ");var ytInitialData = " + json.dumps(initial) + ";"
            if include_player:
                text += "var ytInitialPlayerResponse = " + json.dumps(player) + ";"
            return (text + "</script></html>").encode()

        def respond(url, *, timeout, method="GET", data=None, headers=None):
            body = json.loads(data) if data else None
            self.calls.append((url, method, body))
            path = urlsplit(url).path
            ctype = "text/html; charset=utf-8"
            if path == "/watch":
                raw = webpage(config, initial_player)
            elif path.startswith("/embed/"):
                # Deliberately answer an unintended fallback so tests cannot
                # pass merely because the fixture lacks that response.
                embedded = {**config, "INNERTUBE_CONTEXT": {
                    "client": {"clientName": "WEB_EMBEDDED_PLAYER", "clientVersion": "1.20260819.01.00"}}}
                raw = webpage(embedded)
            elif path == "/youtubei/v1/player":
                raw, ctype = json.dumps(player).encode(), "application/json"
            elif path == "/youtubei/v1/next":
                raw, ctype = json.dumps(initial).encode(), "application/json"
            elif path == "/api/timedtext":
                self.assertEqual(parse_qs(urlsplit(url).query)["fmt"], ["vtt"])
                raw, ctype = VTT.encode(), "text/vtt"
            elif path.endswith("/base.js"):
                raw = b"var signatureTimestamp=12345;"
            else:
                raise AssertionError(f"unexpected fixture request: {url}")
            return SimpleNamespace(url=url, content=raw, headers={"content-type": ctype}, status_code=200)

        with patch.object(cap, "_public_request", side_effect=respond):
            return cap.fetch_captions(VIDEO, language="en", source=source, timeout=5)

    def test_auth_and_age_responses_stop_before_implicit_fallback(self):
        statuses = [
            {"status": "LOGIN_REQUIRED", "reason": "This is a private video. Please sign in to verify that you may see it."},
            {"status": "LOGIN_REQUIRED", "reason": "Sign in to confirm your age"},
            {"status": "AGE_CHECK_REQUIRED", "reason": "연령 확인 필요"},
            {"status": "AGE_VERIFICATION_REQUIRED"},
            {"status": "UNPLAYABLE", "desktopLegacyAgeGateReason": 1},
            {"status": "UNPLAYABLE", "errorScreen": {"playerErrorMessageRenderer": {
                "reason": {"simpleText": "Members-only content"}}}},
        ]
        for status in statuses:
            for initial_player in (True, False):
                with self.subTest(status=status, initial_player=initial_player, yt_dlp=self.ytdlp_version):
                    # Real private/login responses may omit videoDetails.
                    player = {"playabilityStatus": status, "streamingData": {}}
                    result = self.fetch_player(player, initial_player=initial_player)
                    self.assertEqual(result.verdict, "auth_required", result.extraction_meta)
                    self.assertEqual(result.extraction_meta["error"], "player_requires_authentication")
                    self.assertEqual(result.content, "")
                    paths = [urlsplit(url).path for url, _, _ in self.calls]
                    self.assertEqual(paths, ["/watch"] if initial_player else ["/watch", "/youtubei/v1/player"])
                    for _, _, body in self.calls:
                        if body:
                            self.assertEqual(body["context"]["client"]["clientName"], "WEB")

    def test_public_caption_tracks_work_without_media_formats(self):
        for source in ("manual", "auto"):
            for initial_player in (True, False):
                for status in ({"status": "OK"}, {},
                               {"status": "UNPLAYABLE", "reason": "No video formats found"},
                               {"status": "UNPLAYABLE", "reason": "Error signing media URLs"}):
                    with self.subTest(source=source, initial_player=initial_player, status=status):
                        player = self.public_player(source)
                        player["playabilityStatus"] = status
                        result = self.fetch_player(player, initial_player=initial_player, source=source)
                        self.assertTrue(result.ok, result.extraction_meta)
                        payload = json.loads(result.content)
                        self.assertEqual(payload["source"], source)
                        self.assertEqual(payload["video"]["extractor"], "Youtube")
                        self.assertEqual(payload["cues"], cap.parse_webvtt(VTT))
                        self.assertEqual(result.extraction_meta["cue_count"], 4)
                        self.assertIn(result.untrusted_content_boundary["begin"], result.to_untrusted_text())
                        self.assertEqual([urlsplit(url).path for url, _, _ in self.calls],
                                         ["/watch", "/api/timedtext"] if initial_player
                                         else ["/watch", "/youtubei/v1/player", "/api/timedtext"])

    def test_public_metadata_without_tracks_is_still_no_captions(self):
        player = self.public_player()
        del player["captions"]
        del player["streamingData"]
        result = self.fetch_player(player)
        self.assertEqual(result.verdict, "no_captions", result.extraction_meta)
        self.assertEqual([urlsplit(url).path for url, _, _ in self.calls], ["/watch"])

    def test_unrequested_clients_cannot_reach_config_or_player_transport(self):
        configuration_arg = self.youtube_ie._configuration_arg
        for client in ("web_embedded", "android_vr"):
            for skip_config in (False, True):
                def config_arg(extractor, key, *args, **kwargs):
                    if key == "player_skip" and skip_config:
                        return ["configs"]
                    return configuration_arg(extractor, key, *args, **kwargs)
                with self.subTest(client=client, skip_config=skip_config), \
                        patch.object(self.youtube_ie, "_get_requested_clients", return_value=["web", client]), \
                        patch.object(self.youtube_ie, "_configuration_arg", config_arg):
                    # Exercise the real upstream dispatch if it adds a client
                    # for a new reason, independently of current age detection.
                    result = self.fetch_player(self.public_player())
                    self.assertEqual(result.verdict, "unsupported", result.extraction_meta)
                    self.assertEqual(result.extraction_meta["error"], "alternate_player_client_forbidden")
                    self.assertEqual([urlsplit(url).path for url, _, _ in self.calls], ["/watch"])


if __name__ == "__main__":
    unittest.main()
