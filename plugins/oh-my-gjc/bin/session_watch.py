#!/usr/bin/env python3
"""session_watch.py — control-tower session completion (busy→idle) watcher.

Generalized from horcrux's control-tower monitor. Feeds a control-tower session's
event stream: periodically reads each watched tmux session's pane, classifies
busy (working) ↔ idle (waiting for input), and emits ONE line event to stdout
**only when a busy → idle transition is confirmed**. Exception: each session's
**first confirmed state** is announced once as an `INIT` event — so a session that
already went idle *before* the watcher booted is not missed.

Classification heuristics are TUI-specific and configurable (defaults target gjc):
  - busy: the pane tail contains ``--busy-mark`` (a spinner/interrupt hint)
  - idle: the pane tail contains ``--idle-mark`` (the input prompt) and no busy mark
  - unknown: neither — state is held (e.g. a non-TUI screen)

Anti-flap: a classification must repeat ``--confirm`` times (default 2) in a row
before the state is committed.

Event format:
  ``INIT <session> <state>[ | <summary>]``   (first confirmed state)
  ``IDLE <session> | <last non-empty line>`` (busy → idle transition)

No dependencies (stdlib only). The control-tower session itself is not watched
(pass it via ``--exclude``). Which sessions to watch is decided by
``--window-prefix`` (a tmux window-name prefix; default ``GJC-``).

Config file (``--config path.json``) may supply any of: window_prefix, busy_mark,
idle_mark, exclude (list), interval, confirm. Explicit CLI flags win over config.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time

DEFAULT_WINDOW_PREFIX = "GJC-"
DEFAULT_BUSY_MARK = "\u27e6esc\u27e7"  # ⟦esc⟧ — gjc running spinner / interrupt hint
DEFAULT_IDLE_MARK = "Type your message"  # gjc idle input prompt


def classify(pane_text: str, busy_mark: str, idle_mark: str) -> str:
    """pane capture text → 'busy' | 'idle' | 'unknown'."""
    tail = pane_text[-4000:]  # only the bottom drives the verdict
    if busy_mark and busy_mark in tail:
        return "busy"
    if idle_mark and idle_mark in tail:
        return "idle"
    return "unknown"


def summarize(pane_text: str, idle_mark: str, limit: int = 160) -> str:
    """The last meaningful line to attach to an event (skips prompt/decoration)."""
    skip = ("╭", "╰", "│ >", "⬢", idle_mark)
    for line in reversed(pane_text.splitlines()):
        s = line.strip()
        if not s or any(m and m in s for m in skip):
            continue
        return s[:limit]
    return ""


def step(
    state: dict[str, str],
    streak: dict[str, tuple[str, int]],
    session: str,
    cls: str,
    confirm: int,
) -> str | None:
    """Fold one verdict into the state machine; return the event to emit.

    Returns 'init' (first confirmed state — surfaces sessions already idle before
    boot) | 'idle' (busy→idle transition) | None. 'unknown' verdicts and
    confirm-short streaks do not change state.
    """
    if cls == "unknown":
        return None
    prev_cls, n = streak.get(session, ("", 0))
    n = n + 1 if cls == prev_cls else 1
    streak[session] = (cls, n)
    if n < confirm:
        return None
    old = state.get(session)
    if old == cls:
        return None
    state[session] = cls
    if old is None:
        return "init"
    if old == "busy" and cls == "idle":
        return "idle"
    return None


def _tmux(*args: str) -> str:
    try:
        r = subprocess.run(["tmux", *args], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return ""
    return r.stdout if r.returncode == 0 else ""


def watched_sessions(prefix: str, exclude: set[str]) -> list[str]:
    out = _tmux("list-windows", "-a", "-F", "#{session_name} #{window_name}")
    names: set[str] = set()
    for line in out.splitlines():
        parts = line.split(None, 1)
        if len(parts) == 2 and parts[1].startswith(prefix) and parts[0] not in exclude:
            names.add(parts[0])
    return sorted(names)


def capture(session: str) -> str:
    return _tmux("capture-pane", "-p", "-t", session)


def _load_config(path: str | None) -> dict:
    if not path:
        return {}
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", help="JSON config file (window_prefix/busy_mark/idle_mark/exclude/interval/confirm)")
    ap.add_argument("--window-prefix", help=f"tmux window-name prefix to watch (default {DEFAULT_WINDOW_PREFIX!r})")
    ap.add_argument("--busy-mark", help="substring marking a busy pane")
    ap.add_argument("--idle-mark", help="substring marking an idle pane")
    ap.add_argument("--exclude", action="append", default=[], help="session to skip (the control tower itself); repeatable")
    ap.add_argument("--interval", type=float, help="seconds between scans (default 25)")
    ap.add_argument("--confirm", type=int, help="consecutive equal verdicts to commit a state (default 2)")
    ap.add_argument("--once", action="store_true", help="scan once then exit (testing)")
    a = ap.parse_args()

    cfg = _load_config(a.config)
    prefix = a.window_prefix or cfg.get("window_prefix") or DEFAULT_WINDOW_PREFIX
    busy_mark = a.busy_mark or cfg.get("busy_mark") or DEFAULT_BUSY_MARK
    idle_mark = a.idle_mark or cfg.get("idle_mark") or DEFAULT_IDLE_MARK
    interval = a.interval if a.interval is not None else float(cfg.get("interval", 25.0))
    confirm = a.confirm if a.confirm is not None else int(cfg.get("confirm", 2))
    exclude = set(a.exclude) | set(cfg.get("exclude", []))

    state: dict[str, str] = {}      # committed state
    streak: dict[str, tuple[str, int]] = {}  # (last verdict, run length)

    while True:
        for s in watched_sessions(prefix, exclude):
            cls = classify(capture(s), busy_mark, idle_mark)
            event = step(state, streak, s, cls, confirm)
            if event == "init":
                info = summarize(capture(s), idle_mark) if cls == "idle" else ""
                print(f"INIT {s} {cls}" + (f" | {info}" if info else ""), flush=True)
            elif event == "idle":
                info = summarize(capture(s), idle_mark)
                print(f"IDLE {s} | {info}", flush=True)
        if a.once:
            return 0
        time.sleep(interval)


if __name__ == "__main__":
    sys.exit(main())
