"""Explicit, anonymous public caption extraction; no generic-fetch fallback.

The existing YouTube Phase-0 surface is the supported video scope. yt-dlp is
optional and used as an in-memory extractor, with its HTTP calls replaced by
public DNS-pinned transport. No cookies, browser, JS runtime, plugin loading,
cache, subtitle files, media download, or runtime dependency installation.
"""
from __future__ import annotations

import html
import io
import json
import re
import time

from . import safety
from .transport import POOL

_CAPTION_MAX_BYTES = 2_000_000
_METADATA_MAX_BYTES = 8_000_000
_MAX_CUES = 50_000
_TIMESTAMP = r"(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})"
_TIMING = re.compile(rf"^({_TIMESTAMP})[ \t]+-->[ \t]+({_TIMESTAMP})(?:[ \t]+.*)?$")


class CaptionError(Exception):
    def __init__(self, state: str, reason: str):
        self.state = state
        self.reason = reason
        super().__init__(reason)


def _milliseconds(value: str) -> int:
    match = re.fullmatch(_TIMESTAMP, value)
    if not match:
        raise CaptionError("error", "invalid_webvtt_timestamp")
    hours, minutes, seconds, millis = match.groups()
    if int(minutes) >= 60 or int(seconds) >= 60:
        raise CaptionError("error", "invalid_webvtt_timestamp")
    return ((int(hours or 0) * 60 + int(minutes)) * 60 + int(seconds)) * 1000 + int(millis)


def parse_webvtt(data: str) -> list[dict]:
    """Parse complete VTT cues in source order, preserving overlap and repeats.

    Reject malformed cues, segmented timestamp maps, and limits explicitly;
    never turn an incomplete parse into a successful transcript.
    """
    if len(data.encode("utf-8")) > _CAPTION_MAX_BYTES:
        raise CaptionError("error", "caption_byte_limit")
    text = data.removeprefix("\ufeff").replace("\r\n", "\n").replace("\r", "\n")
    blocks = re.split(r"\n(?:[ \t]*\n)+", text.strip())
    header = blocks.pop(0).splitlines() if blocks else []
    if not header or not re.fullmatch(r"WEBVTT(?:[ \t].*)?", header[0]):
        raise CaptionError("unsupported", "not_webvtt")
    if any("-->" in line for line in header):
        raise CaptionError("error", "invalid_webvtt_header")
    if any(line.startswith("X-TIMESTAMP-MAP") for line in header):
        raise CaptionError("unsupported", "segmented_webvtt")
    cues = []
    for block in blocks:
        lines = block.splitlines()
        if not lines:
            continue
        if re.match(r"^NOTE(?:[ \t]|$)", lines[0]) or lines[0] in {"STYLE", "REGION"}:
            continue
        timing_index = 0 if "-->" in lines[0] else 1
        if len(lines) <= timing_index:
            raise CaptionError("error", "invalid_webvtt_cue")
        match = _TIMING.fullmatch(lines[timing_index])
        if not match:
            raise CaptionError("error", "invalid_webvtt_cue")
        start = _milliseconds(match.group(1))
        end = _milliseconds(match.group(6))
        if end <= start:
            raise CaptionError("error", "invalid_webvtt_interval")
        payload = "\n".join(lines[timing_index + 1:])
        # Cue markup and inline word timestamps are presentation, not text.
        payload = html.unescape(re.sub(r"<[^>]*>", "", payload)).strip()
        cues.append({"start_ms": start, "end_ms": end, "text": payload})
        if len(cues) > _MAX_CUES:
            raise CaptionError("error", "caption_cue_limit")
    return cues


def _public_request(url: str, *, timeout: int, method: str = "GET", data=None, headers=None):
    """Caption-only transport adapter. GET uses the existing redirect guards.

    Metadata POST is pinned too, and redirects are rejected rather than
    forwarding an extractor's request body to a different endpoint.
    """
    allowed, _reason = safety.classify_url(url, allow_private=False)
    if not allowed:
        raise CaptionError("error", "ssrf_blocked")
    safe_headers = {key: value for key, value in (headers or {}).items()
                    if key.lower() in {"accept", "accept-language", "content-type", "user-agent"}}
    if method == "GET":
        response, error = POOL.request(
            url, impersonate="safari", timeout=timeout, extra_headers=safe_headers,
            allow_private=False, max_retries=0)
        if response is None or error:
            reason = "ssrf_blocked" if "ssrf_blocked" in (error or "") else "public_transport_failed"
            raise CaptionError("error", reason)
    elif method == "POST" and isinstance(data, bytes) and len(data) <= _METADATA_MAX_BYTES:
        from curl_cffi import CurlOpt, requests
        entries, _reason = safety.curl_resolve_entries(url, allow_private=False)
        if not entries:
            raise CaptionError("error", "ssrf_blocked")
        response = requests.post(
            url, data=data, headers=safe_headers, timeout=timeout, impersonate="safari",
            allow_redirects=False, proxy="", discard_cookies=True,
            curl_options={CurlOpt.RESOLVE: entries})
        if safety.is_redirect(response):
            raise CaptionError("error", "metadata_post_redirect")
    else:
        raise CaptionError("unsupported", "extractor_http_method")
    return response


def _check_player_access(player) -> None:
    """Keep access failures before yt-dlp's fallback and no-formats handling.

    Inspect the player status, not the video's title/description. Missing media
    formats alone say nothing about access to an otherwise public caption track.
    """
    if not isinstance(player, dict):
        return
    status = player.get("playabilityStatus") or {}
    details = player.get("videoDetails") or {}
    if not isinstance(status, dict) or not isinstance(details, dict):
        raise CaptionError("error", "invalid_player_metadata")
    code = status.get("status")
    auth_status = code in {"LOGIN_REQUIRED", "AGE_CHECK_REQUIRED", "AGE_VERIFICATION_REQUIRED"}
    # Error renderers can carry the reason in simpleText/runs rather than in
    # the top-level reason. Never include their remote text in diagnostics.
    auth_reason = code != "OK" and re.search(
        r"\b(?:sign[ -]?in|log[ -]?in|authentication|private video|video is private|"
        r"members[ -]only|confirm your age|age[ -]restricted|age[ -]verification)\b",
        json.dumps(status, ensure_ascii=True).lower())
    if (auth_status or auth_reason or status.get("desktopLegacyAgeGateReason")
            or details.get("isPrivate") is True):
        raise CaptionError("auth_required", "player_requires_authentication")


def _extract_info(url: str, timeout: int) -> dict:
    try:
        from yt_dlp import YoutubeDL
        from yt_dlp.globals import all_plugins_loaded, plugin_dirs
        from yt_dlp.networking.common import Response
        from yt_dlp.networking.exceptions import HTTPError
        from yt_dlp.extractor.youtube import YoutubeIE
    except ImportError as exc:
        raise CaptionError("unsupported", "yt_dlp_missing_or_incompatible") from exc

    deadline = time.monotonic() + max(timeout, 60)

    class QuietLogger:
        def debug(self, message):
            pass
        info = warning = error = debug

    class PublicYoutubeIE(YoutubeIE):
        @classmethod
        def ie_key(cls):
            # Extractor arguments are keyed by this name; the subclass name
            # must not silently select yt-dlp's default clients instead.
            return YoutubeIE.ie_key()

        def _invalid_player_response(self, player_response, video_id):
            # In yt-dlp 2026.8.19 this hook sees both the watch-page response
            # and player API responses before implicit age-gate fallbacks.
            _check_player_access(player_response)
            return super()._invalid_player_response(player_response, video_id)

        def _download_ytcfg(self, client, *args, **kwargs):
            # player_client=[web] does not disable upstream fallback clients.
            # Reject their config/embed requests before any transport call.
            if client != "web":
                raise CaptionError("unsupported", "alternate_player_client_forbidden")
            return super()._download_ytcfg(client, *args, **kwargs)

        def _extract_player_response(self, client, *args, **kwargs):
            # Also covers clients which do not download a config first.
            if client != "web":
                raise CaptionError("unsupported", "alternate_player_client_forbidden")
            return super()._extract_player_response(client, *args, **kwargs)

    class PublicYoutubeDL(YoutubeDL):
        requests_made = 0

        def urlopen(self, request):
            self.requests_made += 1
            remaining = deadline - time.monotonic()
            if remaining <= 0 or self.requests_made > 16:
                raise CaptionError("error", "metadata_request_limit")
            requested_url = request if isinstance(request, str) else request.url
            method = getattr(request, "method", "GET")
            response = _public_request(
                requested_url, timeout=max(1, min(timeout, int(remaining))),
                method=method, data=getattr(request, "data", None),
                headers=getattr(request, "headers", {}))
            content = response.content
            if len(content) > _METADATA_MAX_BYTES:
                raise CaptionError("error", "metadata_byte_limit")
            if response.status_code in (401, 403):
                # A 403 alone may be a public endpoint block, not proof of login.
                raise CaptionError("auth_required" if response.status_code == 401 else "error",
                                   "metadata_http_401" if response.status_code == 401 else "metadata_http_403")
            adapted = Response(io.BytesIO(content), str(response.url), dict(response.headers),
                               status=response.status_code)
            if response.status_code >= 400:
                raise HTTPError(adapted)
            return adapted

    # YoutubeDL's API does not read CLI config, but its constructor can discover
    # installed plugins. Suppress that before construction and restore globals.
    saved_dirs, saved_loaded = plugin_dirs.value, all_plugins_loaded.value
    plugin_dirs.value, all_plugins_loaded.value = [], True
    try:
        params = {
            "quiet": True, "no_warnings": True, "logger": QuietLogger(),
            "skip_download": True, "simulate": True, "noplaylist": True,
            "ignore_no_formats_error": True,
            "cachedir": False, "cookiefile": None, "cookiesfrombrowser": None,
            "usenetrc": False, "proxy": "", "socket_timeout": timeout,
            "retries": 0, "extractor_retries": 0, "fragment_retries": 0,
            "js_runtimes": {}, "remote_components": [], "getcomments": False,
            "writesubtitles": False, "writeautomaticsub": False,
            "writeinfojson": False, "writethumbnail": False,
            "extractor_args": {"youtube": {"player_client": ["web"],
                                           "skip": ["dash", "hls", "translated_subs"]}},
        }
        with PublicYoutubeDL(params, auto_init=False) as ydl:
            extractor = PublicYoutubeIE()
            if not extractor.suitable(url):
                raise CaptionError("unsupported", "single_video_url_required")
            ydl.add_info_extractor(extractor)
            info = ydl.extract_info(url, download=False, process=False)
            if not isinstance(info, dict) or info.get("_type", "video") != "video":
                raise CaptionError("unsupported", "single_video_url_required")
            return info
    except CaptionError:
        raise
    except Exception as exc:
        # Report categories only. Extractor messages can contain URLs/tokens or
        # suggest cookies/browser workarounds that this port must never follow.
        message = str(exc).lower()
        if any(word in message for word in ("sign in", "login", "log in", "private video", "members-only", "authentication")):
            raise CaptionError("auth_required", "extractor_requires_authentication") from exc
        raise CaptionError("error", f"extractor_error:{type(exc).__name__}") from exc
    finally:
        plugin_dirs.value, all_plugins_loaded.value = saved_dirs, saved_loaded


def fetch_captions(url: str, *, language: str, source: str = "manual", timeout: int = 25):
    from .fetch_chain import Attempt, FetchResult
    from .phase0 import _detect

    route = "yt-dlp:public-captions"
    meta = {"source": "captions", "route": route, "caption_status": "error",
            "language_requested": language, "source_requested": source,
            "coverage_uncertain": True, "extraction_complete": False,
            "truncated": False, "truncation_reasons": []}
    content = ""
    final_url = url
    try:
        if source not in {"manual", "auto"} or not re.fullmatch(r"[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*", language):
            raise CaptionError("error", "invalid_caption_selection")
        allowed, _reason = safety.classify_url(url, allow_private=False)
        if not allowed:
            raise CaptionError("error", "ssrf_blocked")
        if _detect(url) != "youtube":
            raise CaptionError("unsupported", "video_platform_unsupported")
        info = _extract_info(url, timeout)
        if info.get("availability") in {"private", "premium_only", "subscriber_only", "needs_auth"}:
            raise CaptionError("auth_required", "video_requires_authentication")
        if info.get("is_live") or info.get("live_status") in {"is_live", "is_upcoming", "post_live"}:
            raise CaptionError("unsupported", "live_captions_unsupported")
        final_url = info.get("webpage_url") or url
        allowed, _reason = safety.classify_url(final_url, allow_private=False)
        if not allowed:
            raise CaptionError("error", "unsafe_video_provenance")
        video = {"id": str(info.get("id") or ""), "url": final_url,
                 "extractor": str(info.get("extractor_key") or info.get("extractor") or "Youtube")}
        meta["video"] = video
        tracks = info.get("subtitles" if source == "manual" else "automatic_captions") or {}
        if not isinstance(tracks, dict):
            raise CaptionError("error", "invalid_subtitle_metadata")
        meta["available_languages"] = sorted(str(key) for key in tracks)
        entries = tracks.get(language) or []
        if not entries:
            raise CaptionError("no_captions", "requested_track_unavailable")
        if not isinstance(entries, list):
            raise CaptionError("error", "invalid_subtitle_metadata")
        # Choose exactly one WebVTT entry; never fetch media/manifests or change
        # format, language, or manual/automatic choice after a failed download.
        entry = next((track for track in entries if isinstance(track, dict)
                      and track.get("ext") == "vtt"
                      and (isinstance(track.get("data"), str) or isinstance(track.get("url"), str))), None)
        if entry is None:
            raise CaptionError("unsupported", "webvtt_track_unavailable")
        if str(entry.get("protocol", "")).startswith(("m3u8", "http_dash")):
            raise CaptionError("unsupported", "segmented_webvtt")
        track_url = entry.get("url") or ""
        meta.update(language=language, caption_source=source,
                    subtitle_url_requested=track_url, subtitle_url_final=track_url)
        if isinstance(entry.get("data"), str):
            raw = entry["data"]
            meta["subtitle_transport"] = "extractor_data"
        else:
            response = _public_request(track_url, timeout=timeout)
            meta["subtitle_url_final"] = str(response.url)
            meta["subtitle_transport"] = "dns_pinned_public_get"
            if response.status_code == 401:
                raise CaptionError("auth_required", "caption_http_401")
            if response.status_code != 200:
                raise CaptionError("error", f"caption_http_{response.status_code}")
            if len(response.content) > _CAPTION_MAX_BYTES:
                raise CaptionError("error", "caption_byte_limit")
            raw = response.content.decode("utf-8-sig", errors="strict")
        cues = parse_webvtt(raw)
        if not any(cue["text"] for cue in cues):
            raise CaptionError("no_captions", "empty_webvtt")
        content = json.dumps({"video": video, "language": language, "source": source, "cues": cues}, ensure_ascii=False)
        meta.update(caption_status="ok", error="", cue_count=len(cues), extraction_complete=None,
                    coverage_note="selected_public_track_only; accuracy_and_video_coverage_unverified")
    except CaptionError as exc:
        meta.update(caption_status=exc.state, error=exc.reason)
        if exc.reason.endswith("_limit"):
            meta.update(truncated=True, truncation_reasons=[exc.reason])
    except Exception as exc:
        meta.update(caption_status="error", error=f"caption_error:{type(exc).__name__}")
    ok = meta["caption_status"] == "ok"
    state = "strong_ok" if ok else meta["caption_status"]
    return FetchResult(
        ok=ok, content=content, final_url=final_url, verdict=state,
        extraction_source="captions", extraction_meta=meta,
        stop_reason="success" if ok else meta["caption_status"],
        summary=f"{route}: {meta['caption_status']} ({meta.get('error') or 'selected public track'})",
        trace=[Attempt(phase="phase0", executor=route, url=url, url_transform="original",
                       impersonate=None, referer="", verdict=state,
                       body_size=len(content), reasons=[meta.get("error", "")])])
