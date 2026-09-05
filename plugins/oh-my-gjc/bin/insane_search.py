#!/usr/bin/env python3
"""Hardened OMG launcher for the vendored insane-search engine."""
from __future__ import annotations

import importlib
import json
import os
from pathlib import Path
import shutil
import stat
import sys
from urllib.parse import urlsplit

SKILL_ROOT = Path(__file__).resolve().parent.parent / "skills" / "insane-search"
sys.path.insert(0, str(SKILL_ROOT))

CORE_MODULES = {
    "curl_cffi": "curl_cffi>=0.15.0",
    "bs4": "beautifulsoup4",
    "yaml": "pyyaml",
    "markdownify": "markdownify",
}
OPTIONAL_MODULES = {
    "yt_dlp": "yt-dlp",
    "pypdf": "pypdf",
    "pdfplumber": "pdfplumber",
    "resiliparse": "resiliparse",
}


def managed_venv() -> Path:
    base = Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local/share")))
    if not base.is_absolute() or ".." in base.parts:
        raise ValueError("XDG_DATA_HOME must be absolute without parent traversal")
    return base / "oh-my-gjc/insane-search/venv"


def validate_managed_path(path: Path) -> None:
    """Reject redirected paths and insecure suite-owned runtime directories."""
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current /= part
        try:
            info = current.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
            raise ValueError(f"managed environment path is not a plain directory: {current}")
        if current in (path, path.parent):
            if ((hasattr(os, "getuid") and info.st_uid != os.getuid())
                    or (os.name != "nt" and info.st_mode & 0o077)):
                raise ValueError(f"managed environment directory must be privately owned (0700): {current}")


def managed_python() -> Path | None:
    path = managed_venv()
    validate_managed_path(path)
    if not path.exists():
        return None
    python = path / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if python.parent.resolve(strict=True) != python.parent:
        raise ValueError("managed Python directory is symlinked")
    info = python.lstat()
    if (not stat.S_ISREG(info.st_mode) or not os.access(python, os.X_OK)
            or (hasattr(os, "getuid") and info.st_uid != os.getuid())
            or (os.name != "nt" and info.st_mode & 0o022)):
        raise ValueError("managed Python is missing, symlinked, or writable by others; rerun setup")
    return python


def module_status() -> dict[str, dict[str, str | bool]]:
    status: dict[str, dict[str, str | bool]] = {}
    for name, package in {**CORE_MODULES, **OPTIONAL_MODULES}.items():
        try:
            module = importlib.import_module(name)
            version = str(getattr(module, "__version__", ""))
            ok = True
            if name == "curl_cffi":
                parts = [int(part) for part in version.split(".")[:2]]
                ok = tuple(parts) >= (0, 15)
            status[name] = {"ok": ok, "package": package, "version": version}
        except Exception:
            status[name] = {"ok": False, "package": package, "version": ""}
    status["node"] = {
        "ok": shutil.which("node") is not None,
        "package": "node",
        "version": "",
    }
    return status


def environment_report() -> dict:
    status = module_status()
    core_ok = all(bool(status[name]["ok"]) for name in CORE_MODULES)
    return {
        "ok": core_ok, "python": sys.executable, "dependencies": status,
        "missing": [status[name]["package"] for name in CORE_MODULES if not status[name]["ok"]],
        "authentication": "not_required", "browser": "not_used", "model": "not_used",
        "setup": [sys.executable, str(Path(__file__).with_name("setup_insane_search.py")), "--install"],
    }


def check_env() -> int:
    report = environment_report()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


def safe_engine_args(argv: list[str]) -> list[str]:
    if argv == ["--help"] or argv == ["-h"]:
        return argv
    value_options = {"--selector", "-s", "--device", "--timeout",
                     "--caption-language", "--caption-source"}
    flag_options = {
        "--no-retry",
        "--no-extract",
        "--no-markdown",
        "--maincontent",
        "--no-phase0",
        "--json",
        "--body-json",
        "--jsonl",
        "--captions",
        "--trace",
    }
    output: list[str] = []
    urls: list[str] = []
    index = 0
    while index < len(argv):
        token = argv[index]
        if token in value_options:
            if index + 1 >= len(argv):
                raise ValueError(f"{token} requires a value")
            value = argv[index + 1]
            if token == "--device" and value not in {"auto", "desktop", "mobile"}:
                raise ValueError("--device must be auto, desktop, or mobile")
            if token == "--timeout":
                try:
                    seconds = int(value)
                except ValueError as exc:
                    raise ValueError("--timeout must be an integer") from exc
                if not 5 <= seconds <= 60:
                    raise ValueError("--timeout must be between 5 and 60 seconds")
            output.extend((token, value))
            index += 2
            continue
        if token in flag_options:
            output.append(token)
            index += 1
            continue
        if token.startswith("-"):
            raise ValueError(f"unsupported option: {token}")
        urls.append(token)
        output.append(token)
        index += 1
    if not urls:
        raise ValueError("at least one public URL is required")
    for url in urls:
        parsed = urlsplit(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("only an absolute public http/https URL is allowed")
        if parsed.username is not None or parsed.password is not None:
            raise ValueError("URLs containing credentials are not allowed")
        try:
            parsed.port
        except ValueError as exc:
            raise ValueError("invalid URL port") from exc
    return output


def main() -> int:
    if sys.argv[1:] in (["--help"], ["-h"]):
        print("""Usage: insane_search.py PUBLIC_URL [PUBLIC_URL ...] [options]
       insane_search.py --check-env

Fetch blocked public content without a browser, login, or model setting.
Options:
  --selector CSS, -s CSS     Repeatable positive-proof selector
  --device auto|desktop|mobile
  --timeout SECONDS          Per-attempt timeout, 5..60
  --trace                    Diagnostics on stderr
  --json                     Legacy JSON metadata, excluding page body
  --body-json                Version 1 JSON envelope, wrapped body + provenance
  --jsonl                    Version 1 JSON record per input URL (one line each)
  --captions                 Explicit public video caption extraction
  --caption-language CODE    Exact caption language (required with --captions)
  --caption-source manual|auto
                             Track source (default manual; no silent fallback)
  --no-retry                 Disable transient retry
  --no-extract               Return raw response text
  --no-markdown              Disable markdown conversion
  --maincontent              Extract article text (optional resiliparse)
  --no-phase0                Skip official-platform routing

Output goes to stdout; no files, cookies, or sessions are retained.
Exit 0: every input succeeded; 1: any input failed (successful results retained);
     2: invalid arguments. Fetch success does not establish full extraction.

One-time setup (only when explicitly requested):
  python3 setup_insane_search.py --install
Ordinary fetches never install dependencies.""")
        return 0
    try:
        python = managed_python()
        if python and Path(sys.prefix).resolve() != managed_venv().resolve():
            os.execv(str(python), [str(python), str(Path(__file__).resolve()), *sys.argv[1:]])
    except (OSError, ValueError) as exc:
        print(f"insane-search: {exc}", file=sys.stderr)
        return 2
    if sys.argv[1:] == ["--check-env"]:
        return check_env()

    # No browsing-history writes, cross-request cookies, runtime package
    # installation, private-network access, or local browser subprocesses.
    os.environ["INSANE_LEARN"] = "0"
    os.environ.pop("INSANE_OBSERVATIONS_DIR", None)
    os.environ.pop("INSANE_ALLOW_PRIVATE", None)
    os.environ.pop("INSANE_AUTO_INSTALL", None)
    for name in (
        "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
        "http_proxy", "https_proxy", "all_proxy", "no_proxy",
    ):
        os.environ.pop(name, None)

    try:
        args = safe_engine_args(list(sys.argv[1:]))
    except ValueError as exc:
        print(f"insane-search: {exc}", file=sys.stderr)
        return 2
    if args not in (["--help"], ["-h"]):
        report = environment_report()
        if not report["ok"]:
            print(json.dumps(report, ensure_ascii=False, indent=2), file=sys.stderr)
            return 1
        args.append("--no-playwright")
    from engine.__main__ import main as engine_main
    return engine_main(args)


if __name__ == "__main__":
    raise SystemExit(main())
