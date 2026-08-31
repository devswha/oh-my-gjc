#!/usr/bin/env python3
"""Create one ChatGPT Images PNG through a logged-in local Chromium CDP session."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import signal
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

BIN_DIR = Path(__file__).resolve().parent
if str(BIN_DIR) not in sys.path:
    sys.path.insert(0, str(BIN_DIR))
from cdp_lock import CdpLease

IMAGES_URL = "https://chatgpt.com/images/"
KOREAN_PLACEHOLDER = "새 이미지를 설명하세요"
ENGLISH_PLACEHOLDER = "Describe your image"
PROMPT_SELECTOR = "#prompt-textarea"
PLACEHOLDER_SELECTOR = (
    'textarea[placeholder="새 이미지를 설명하세요"], '
    'textarea[placeholder="Describe your image"]'
)
SEND_SELECTOR = '[data-testid="send-button"]'
STOP_SELECTOR = '[data-testid="stop-button"]'
ASSISTANT_SELECTOR = '[data-turn="assistant"]'
USER_SELECTOR = '[data-turn="user"]'
IMAGE_SELECTOR = '[id^="image-"]'
SHARE_SELECTOR = '[aria-label="이 이미지 공유"], [aria-label="Share this image"]'
SAVE_SELECTOR = '[aria-label="저장"], [aria-label="Save"]'
DOWNLOAD_SELECTOR = 'button:has-text("다운로드"), button:has-text("Download")'
MAX_SIZE = 50 * 1024 * 1024


def die(message: str) -> None:
    raise RuntimeError(message)


def cdp_info(port: int) -> dict:
    # The host is deliberately literal: this tool must never attach remotely.
    url = f"http://127.0.0.1:{port}/json/version"
    try:
        with urllib.request.urlopen(url, timeout=4) as response:
            info = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        die(f"CDP endpoint 127.0.0.1:{port} is unavailable or invalid: {exc}")
    browser, ws = str(info.get("Browser", "")), str(info.get("webSocketDebuggerUrl", ""))
    parsed = urllib.parse.urlparse(ws)
    if not any(name in browser for name in ("Chrome", "Chromium", "HeadlessChrome", "Edg", "Comet")):
        die("CDP endpoint is not Chrome/Chromium.")
    if parsed.hostname not in {"127.0.0.1", "localhost"} or parsed.port != port or not parsed.path.startswith("/devtools/browser/"):
        die("CDP endpoint is not a local browser endpoint.")
    return info


def dedicated_profile_ok(port: int, info: dict) -> bool:
    """Delegates to pack_and_ask's shared dedicated-profile binding proof.

    Same contract as the review engine: the CDP endpoint must be bound to the
    dedicated insane-review browser profile via the legacy DevToolsActivePort
    receipt (older Chromium) or the listener-process --user-data-dir argv
    (Chrome 136+, which no longer writes the receipt).
    """
    try:
        from pack_and_ask import cdp_binds_dedicated_profile
        return cdp_binds_dedicated_profile(port, info)
    except Exception:
        return False


def safe_output_dir(value: str) -> Path:
    project = Path.cwd().resolve()
    requested = Path(value).expanduser()
    candidate = project / requested if not requested.is_absolute() else requested
    output = candidate.resolve(strict=False)
    try:
        relative = output.relative_to(project)
    except ValueError:
        die("--output-dir must be inside the current project.")
    if not relative.parts:
        die("--output-dir must not be the project root.")

    current = project
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            die("Output directory must not contain symlink components.")
        if current.exists():
            if not current.is_dir():
                die("Output path component is not a directory.")
        else:
            current.mkdir(mode=0o700)
    if output.is_symlink() or not output.is_dir():
        die("Output directory must be a non-symlink directory.")
    if os.name != "nt":
        details = output.lstat()
        if details.st_uid != os.getuid():
            die("Output directory is not owned by the current user.")
        os.chmod(output, 0o700)
    return output


def png_details(path: Path) -> tuple[int, int, int, str]:
    size = path.stat().st_size
    if not 0 < size <= MAX_SIZE: die("Downloaded image size is empty or exceeds 50 MiB.")
    with path.open("rb") as f: header = f.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR": die("ChatGPT Save did not produce a PNG.")
    width, height = int.from_bytes(header[16:20], "big"), int.from_bytes(header[20:24], "big")
    if not width or not height: die("PNG dimensions are invalid.")
    return width, height, size, hashlib.sha256(path.read_bytes()).hexdigest()


def exclusive_copy(source: Path, target: Path, data: bytes | None = None) -> None:
    tmp = target.parent / f".{target.name}.{uuid.uuid4().hex}.tmp"
    try:
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as f:
            if data is None:
                with source.open("rb") as src:
                    while chunk := src.read(1024 * 1024): f.write(chunk)
            else: f.write(data)
            f.flush(); os.fsync(f.fileno())
        os.link(tmp, target)  # atomic and exclusive: never overwrite a prior result
        if os.name != "nt":
            try:
                os.chmod(target, 0o600)
            except OSError:
                target.unlink()
                raise
    finally:
        try: tmp.unlink()
        except OSError: pass


def wait_until(fn, deadline: float, message: str):
    while time.monotonic() < deadline:
        result = fn()
        if result:
            return result
        time.sleep(0.25)
    die(message)


def capped_deadline(deadline: float, seconds: int) -> float:
    return min(deadline, time.monotonic() + seconds)


def remaining_ms(deadline: float) -> int:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        die("GPT Image end-to-end deadline expired.")
    return max(1, int(remaining * 1000))


def save_download_before_deadline(download, target: Path, deadline: float) -> None:
    if os.name == "nt" or not hasattr(signal, "setitimer"):
        die("Deadline-bounded original download currently requires POSIX.")
    prior = signal.getsignal(signal.SIGALRM)

    def expired(_signum, _frame):
        raise TimeoutError("Original image download exceeded the end-to-end deadline.")

    signal.signal(signal.SIGALRM, expired)
    signal.setitimer(signal.ITIMER_REAL, max(0.001, deadline - time.monotonic()))
    try:
        download.save_as(target)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, prior)


def asset_sources(turn) -> set[str]:
    return set(turn.locator(IMAGE_SELECTOR).evaluate_all("els => els.flatMap(e => [...e.querySelectorAll('img')]).map(i => i.currentSrc || i.src).filter(Boolean)"))


def conversation_hrefs(page) -> set[str]:
    hrefs = page.locator('a[href*="/c/"]').evaluate_all("els => els.map(e => e.href)")
    result = set()
    for href in hrefs:
        parsed = urllib.parse.urlparse(href)
        if parsed.scheme == "https" and parsed.hostname == "chatgpt.com" and parsed.path.startswith("/c/"):
            result.add(urllib.parse.urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", "", "")))
    return result


def run(prompt: str, output_dir: Path, port: int, timeout: int) -> Path:
    from playwright.sync_api import sync_playwright
    info = cdp_info(port)
    if not dedicated_profile_ok(port, info):
        die(f"CDP {port} does not match the dedicated insane-review browser profile receipt.")
    download_dir = Path(tempfile.mkdtemp(prefix="oh-my-gjc-gpt-image-"))
    created: list[Path] = []
    page = None
    try:
        with CdpLease(port), sync_playwright() as pw:
            deadline = time.monotonic() + timeout
            browser = pw.chromium.connect_over_cdp(
                f"http://127.0.0.1:{port}",
                timeout=remaining_ms(deadline),
            )
            context = browser.contexts[0] if browser.contexts else die("CDP browser has no context.")
            context.set_default_timeout(500)
            context.set_default_navigation_timeout(500)
            page = context.new_page()
            page.goto(
                IMAGES_URL,
                wait_until="domcontentloaded",
                timeout=remaining_ms(deadline),
            )
            composer = page.locator(PROMPT_SELECTOR)
            wait_until(
                lambda: composer.count() == 1
                and page.locator(PLACEHOLDER_SELECTOR).count() == 1
                and page.locator(SEND_SELECTOR).count() == 1,
                deadline,
                "Logged-in ChatGPT Images composer was not found.",
            )
            baseline_url = page.url
            baseline_conversations = conversation_hrefs(page)
            baseline_users = page.locator(USER_SELECTOR).count()
            baseline_turns = page.locator(ASSISTANT_SELECTOR).count()
            baseline_assets = set(page.locator(IMAGE_SELECTOR).evaluate_all("els => els.map(e => e.id)"))
            composer.click(timeout=remaining_ms(deadline))
            page.keyboard.insert_text(prompt)
            if composer.inner_text().strip() != prompt:
                die("Images composer did not preserve the exact prompt.")
            wait_until(
                lambda: page.locator(SEND_SELECTOR).is_enabled(),
                capped_deadline(deadline, 15),
                "Images send button did not become enabled.",
            )
            page.locator(SEND_SELECTOR).click(timeout=remaining_ms(deadline))
            wait_until(
                lambda: page.locator(USER_SELECTOR).count() == baseline_users + 1
                and page.locator(USER_SELECTOR).last.inner_text().strip() == prompt,
                deadline,
                "ChatGPT did not render exactly one new user turn with the exact prompt.",
            )
            wait_until(
                lambda: page.locator(STOP_SELECTOR).count() > 0,
                capped_deadline(deadline, 60),
                "Image generation did not start.",
            )
            wait_until(
                lambda: page.locator(STOP_SELECTOR).count() == 0,
                deadline,
                "Image generation did not complete.",
            )
            def new_asset():
                turns = page.locator(ASSISTANT_SELECTOR)
                if turns.count() != baseline_turns + 1:
                    return None
                sources = asset_sources(turns.nth(turns.count() - 1))
                ids = set(page.locator(IMAGE_SELECTOR).evaluate_all("els => els.map(e => e.id)")) - baseline_assets
                return (sources, ids) if len(sources) == 1 and len(ids) == 1 else None
            sources, ids = wait_until(
                new_asset,
                deadline,
                "Expected exactly one unique generated image asset in the new assistant turn.",
            )
            def new_conversation_url():
                parsed = urllib.parse.urlparse(page.url)
                if (
                    page.url != baseline_url
                    and parsed.scheme == "https"
                    and parsed.hostname == "chatgpt.com"
                    and parsed.path.startswith("/c/")
                ):
                    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", "", ""))
                new_links = conversation_hrefs(page) - baseline_conversations
                return next(iter(new_links)) if len(new_links) == 1 else None
            conversation_url = wait_until(
                new_conversation_url,
                capped_deadline(deadline, 30),
                "ChatGPT did not expose exactly one new Images conversation URL.",
            )
            current = urllib.parse.urlparse(page.url)
            current_url = urllib.parse.urlunparse(
                (current.scheme, current.netloc, current.path, "", "", "")
            )
            if current_url != conversation_url:
                page.goto(
                    conversation_url,
                    wait_until="domcontentloaded",
                    timeout=remaining_ms(deadline),
                )
            wait_until(
                lambda: page.locator(USER_SELECTOR).count() >= 1
                and page.locator(USER_SELECTOR).last.inner_text().strip() == prompt
                and page.locator(ASSISTANT_SELECTOR).count() >= 1
                and page.locator(ASSISTANT_SELECTOR).last.locator(
                    f'[id="{next(iter(ids))}"]'
                ).count() >= 1
                and asset_sources(page.locator(ASSISTANT_SELECTOR).last) == sources,
                deadline,
                "Conversation URL did not preserve the exact prompt, assistant turn, and generated asset.",
            )
            latest_turn = page.locator(ASSISTANT_SELECTOR).last
            image_candidates = latest_turn.locator(f'[id="{next(iter(ids))}"]')
            visible_images = [
                image_candidates.nth(index)
                for index in range(image_candidates.count())
                if image_candidates.nth(index).is_visible()
            ]
            if len(visible_images) != 1:
                die("Expected exactly one visible generated image container.")
            image = visible_images[0]
            image.evaluate("(element) => element.click()", timeout=remaining_ms(deadline))
            share_candidates = page.locator(SHARE_SELECTOR)
            visible_share = [
                share_candidates.nth(index)
                for index in range(share_candidates.count())
                if share_candidates.nth(index).is_visible()
            ]
            if len(visible_share) != 1:
                die("Expected exactly one visible generated image fullscreen action.")
            share = visible_share[0]
            wait_until(
                lambda: share.is_visible(),
                capped_deadline(deadline, 30),
                "Generated image fullscreen action was not available.",
            )
            share.evaluate("(element) => element.click()", timeout=remaining_ms(deadline))
            save_candidates = page.locator(SAVE_SELECTOR)
            visible_save = [
                save_candidates.nth(index)
                for index in range(save_candidates.count())
                if save_candidates.nth(index).is_visible()
            ]
            if len(visible_save) == 1:
                save = visible_save[0]
            else:
                download_candidates = page.locator(DOWNLOAD_SELECTOR)
                visible_download = [
                    download_candidates.nth(index)
                    for index in range(download_candidates.count())
                    if download_candidates.nth(index).is_visible()
                ]
                if len(visible_download) != 1:
                    die("Expected exactly one visible original image Save/Download action.")
                save = visible_download[0]
            wait_until(
                lambda: save.is_visible(),
                capped_deadline(deadline, 30),
                "Fullscreen Save action was not available.",
            )
            with page.expect_download(timeout=remaining_ms(deadline)) as download_info:
                save.evaluate("(element) => element.click()", timeout=remaining_ms(deadline))
            download = download_info.value
            downloaded = download_dir / "chatgpt-original.png"
            save_download_before_deadline(download, downloaded, deadline)
            width, height, size, digest = png_details(downloaded)
            stem = f"gpt-image-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex}"
            image_out, provenance = output_dir / f"{stem}.png", output_dir / f"{stem}.json"
            exclusive_copy(downloaded, image_out); created.append(image_out)
            record = {"prompt": prompt, "conversation_url": conversation_url, "sha256": digest, "size": size, "dimensions": {"width": width, "height": height}, "timestamp": datetime.now(timezone.utc).isoformat(), "engine_route": IMAGES_URL}
            exclusive_copy(Path(), provenance, json.dumps(record, ensure_ascii=False, indent=2).encode() + b"\n"); created.append(provenance)
            return image_out
    except Exception:
        for path in created:
            try: path.unlink()
            except OSError: pass
        raise
    finally:
        if page is not None:
            try: page.close()
            except Exception: pass
        for path in download_dir.glob("*"):
            try: path.unlink()
            except OSError: pass
        try: download_dir.rmdir()
        except OSError: pass


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("prompt", nargs="?", help="Exact image prompt")
    parser.add_argument("--output-dir", default=".gpt-image")
    parser.add_argument("--cdp-port", type=int, default=int(os.environ.get("GPT_IMAGE_CDP_PORT", "9222")))
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument("--check-env", action="store_true", help="Read-only prerequisite check")
    args = parser.parse_args()
    if not 30 <= args.timeout <= 1800: parser.error("--timeout must be between 30 and 1800 seconds")
    if not 1 <= args.cdp_port <= 65535: parser.error("--cdp-port must be a TCP port")
    try:
        if os.name == "nt" or not hasattr(signal, "setitimer"):
            die("gpt-image currently requires POSIX deadline enforcement.")
        info = cdp_info(args.cdp_port)
        if not dedicated_profile_ok(args.cdp_port, info):
            die(f"CDP {args.cdp_port} does not match the dedicated insane-review browser profile binding proof.")
        if args.check_env:
            if importlib.util.find_spec("playwright") is None: die("Python Playwright is required; this tool never installs it.")
            print("STATUS playwright=ok cdp=ok profile=ok")
            return 0
        if not args.prompt or not args.prompt.strip(): parser.error("prompt is required")
        if importlib.util.find_spec("playwright") is None: die("Python Playwright is required; this tool never installs it.")
        print(run(args.prompt, safe_output_dir(args.output_dir), args.cdp_port, args.timeout))
        return 0
    except RuntimeError as exc:
        print(f"gpt-image: {exc}", file=sys.stderr); return 1

if __name__ == "__main__":
    raise SystemExit(main())
