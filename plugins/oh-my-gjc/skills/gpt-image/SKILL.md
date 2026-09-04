---
name: gpt-image
description: "`/omg:gpt-image` explicit-only ChatGPT Images generation. Activate only when that command loads this skill; never activate from ordinary image, drawing, or design requests."
---

# GPT Image (ChatGPT Images web)

This is an **explicit command-only** capability: `/omg:gpt-image <prompt>`. It uses the user's logged-in ChatGPT subscription through a local Chromium CDP session and only `https://chatgpt.com/images/`. It has no API, backend, generic-chat plus-menu, browser launch, auto-login, or dependency-install fallback.

The prompt is sent to the external ChatGPT service. Treat it as an upload/privacy boundary: do not submit secrets, private source, credentials, or material the user may not send to OpenAI. A user must manually maintain a dedicated logged-in browser profile. Do not run `/omg:insane-review` or any other CDP automation concurrently.

## Resolve the engine

Resolve the exact non-symlink engine from the current suite-root binding. Do not select a plugin
cache glob or an old-identity binding for this new capability.

```bash
GI="$(python3 - <<'PY'
from pathlib import Path
import os
import stat
import sys

asset = Path("bin/gpt_image_web.py")
bindings = [
    Path.cwd() / ".gjc/runtimes/oh-my-gjc/root",
    Path.home() / ".gjc/agent/runtimes/oh-my-gjc/root",
]


def reject_links(path):
    for component in (path, *path.parents):
        if component.is_symlink():
            raise ValueError("symlinked path")


def resolve_asset(root, relative):
    reject_links(root)
    if not root.is_absolute() or str(root.resolve(strict=True)) != str(root):
        raise ValueError("non-canonical suite root")
    asset = root / relative
    reject_links(asset)
    if not asset.is_file():
        raise ValueError("missing suite asset")
    return asset


try:
    for binding in bindings:
        reject_links(binding)
        try:
            fd = os.open(binding, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
        except FileNotFoundError:
            continue
        with os.fdopen(fd, "rb") as stream:
            info = os.fstat(stream.fileno())
            if (not stat.S_ISREG(info.st_mode)
                    or (hasattr(os, "getuid") and info.st_uid != os.getuid())
                    or (os.name != "nt" and stat.S_IMODE(info.st_mode) & 0o077)):
                raise ValueError("binding must be a private owned regular file")
            value = stream.read(4097).decode("utf-8")
        if (len(value.encode("utf-8")) > 4096 or not value.endswith("\n")
                or value.count("\n") != 1
                or any(ord(ch) < 32 or ord(ch) == 127 for ch in value[:-1])):
            raise ValueError("malformed suite binding")
        root = Path(value[:-1])
        if str(root) != value[:-1]:
            raise ValueError("non-canonical suite binding")
        print(resolve_asset(root, asset))
        raise SystemExit(0)
    print(resolve_asset(Path.cwd() / "plugins/oh-my-gjc", asset))
except (OSError, ValueError, UnicodeError) as error:
    print(f"Invalid OMG runtime binding: {error}; rerun the hardened installer", file=sys.stderr)
    raise SystemExit(1)
PY
)" || exit 1
```

빈 값이거나 검증에 실패하면 중단한다.

## Procedure

1. Require a nonempty exact prompt. Clarify it before executing; do not silently embellish it.
2. Resolve `$GI` with the hardened binding resolver and run the read-only prerequisite check:
   ```bash
   python3 "$GI" --check-env
   ```
   It requires POSIX deadline enforcement, Python Playwright, and a real local Chrome/Chromium CDP endpoint. It also requires the endpoint to be proven bound to the dedicated profile — via the listener process's `--user-data-dir` argv (Chrome 136+, which no longer writes a receipt) or the legacy `DevToolsActivePort` receipt when present. The user must manually start/login the dedicated browser; do not install, launch, or log in for them.
3. Generate only after a successful check:
   ```bash
   python3 "$GI" --output-dir .gpt-image -- "$ARGUMENTS"
   ```
4. Report the emitted PNG path and its adjacent provenance JSON. The engine uses the Images composer, exact prompt, a fresh conversation, one completed new assistant image, and the Images fullscreen **Save** action. It rejects ambiguous assets and never downloads a thumbnail, screenshot, signed URL, or backend response.

ChatGPT currently exposes the fullscreen Save/Download control behind the selected image's
share-labeled viewer action. Opening that viewer is allowed only to reach the original download;
never click Copy link, X, LinkedIn, Reddit, or any other publication control.

Output is atomically/exclusively written to the current project's non-symlink `.gpt-image/` directory (0700); PNG and provenance files are 0600. Provenance includes prompt, conversation URL, SHA-256, size, dimensions, timestamp, and route, never cookies or signed asset URLs. Failures remove temporary downloads and partial output.
