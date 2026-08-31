#!/usr/bin/env python3
"""Hardened OMG launcher for the vendored insane-search engine."""
from __future__ import annotations

import importlib
import json
import os
from pathlib import Path
import shutil
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


def check_env() -> int:
    status = module_status()
    core_ok = all(bool(status[name]["ok"]) for name in CORE_MODULES)
    print(json.dumps({"ok": core_ok, "dependencies": status}, ensure_ascii=False, indent=2))
    return 0 if core_ok else 1


def safe_engine_args(argv: list[str]) -> list[str]:
    if argv == ["--help"] or argv == ["-h"]:
        return argv
    value_options = {"--selector", "-s", "--device", "--timeout"}
    flag_options = {
        "--no-retry",
        "--no-extract",
        "--no-markdown",
        "--maincontent",
        "--no-phase0",
        "--json",
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
    if len(urls) != 1:
        raise ValueError("exactly one public URL is required")
    parsed = urlsplit(urls[0])
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("only an absolute public http/https URL is allowed")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("URLs containing credentials are not allowed")
    return output


def main() -> int:
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

    from engine.__main__ import main as engine_main

    try:
        args = safe_engine_args(list(sys.argv[1:]))
    except ValueError as exc:
        print(f"insane-search: {exc}", file=sys.stderr)
        return 2
    if args not in (["--help"], ["-h"]):
        args.append("--no-playwright")
    return engine_main(args)


if __name__ == "__main__":
    raise SystemExit(main())
