#!/usr/bin/env python3
"""Explicit, one-time dependency setup. Never called by installers or fetches."""
from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys

from insane_search import CORE_MODULES, managed_python, managed_venv, validate_managed_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare the private insane-search environment (Python 3 + pip>=22.3; no browser/login)")
    parser.add_argument("--install", action="store_true", help="explicitly create the venv and install core dependencies")
    args = parser.parse_args()
    if not args.install:
        parser.print_help()
        return 0
    try:
        target = managed_venv()
        validate_managed_path(target)
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        validate_managed_path(target)
        if not target.exists():
            target.mkdir(mode=0o700)
            # Debian may ship venv without ensurepip. Use the invoking pip to
            # bootstrap the target instead of requiring an OS package/sudo.
            subprocess.run([sys.executable, "-m", "venv", "--without-pip", "--copies", str(target)], check=True)
        python = managed_python()
        if python is None:
            raise ValueError("virtual environment creation failed")
        # Ignore pip's user/global config; the managed env never uses system-site-packages.
        subprocess.run([sys.executable, "-m", "pip", "--isolated", "--python", str(python), "install",
                        "--disable-pip-version-check", "--index-url", "https://pypi.org/simple",
                        "pip>=22.3", *CORE_MODULES.values()], check=True)
        return subprocess.run([str(python), str(Path(__file__).with_name("insane_search.py")), "--check-env"]).returncode
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"insane-search setup failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
