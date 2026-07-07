#!/usr/bin/env python3
"""queue_store.py — operator decision queue: the shared store.

Generalized from horcrux's control-tower queue. The control tower catches each
watched session's "done / needs-a-human-decision" event and enqueues an item for
the operator to resolve. The `tower queue` CLI and any status panel share this one
contract. No dependencies (Python 3 stdlib).

Storage location (first that applies):
  1. $TOWER_QUEUE_FILE                         (explicit override / tests)
  2. $TOWER_HOME/queue.json                    (if $TOWER_HOME is set)
  3. ~/.gjc/tower/queue.json                    (default, user-global control tower)

Format (queue.json):
{"next_id": 3, "items": [
  {"id": 1, "source": "repo-a", "text": "...", "ts": "...", "done": false, "done_ts": null}
]}
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path


def queue_file() -> Path:
    """Storage path. $TOWER_QUEUE_FILE > $TOWER_HOME/queue.json > ~/.gjc/tower/queue.json."""
    env = os.environ.get("TOWER_QUEUE_FILE")
    if env:
        return Path(env).expanduser()
    home = os.environ.get("TOWER_HOME")
    if home:
        return Path(home).expanduser() / "queue.json"
    return Path.home() / ".gjc" / "tower" / "queue.json"


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


# ── I/O ──────────────────────────────────────────────────────────
def load(path: Path | None = None) -> dict:
    p = path or queue_file()
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"next_id": 1, "items": []}
    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
        return {"next_id": 1, "items": []}
    data.setdefault("next_id", 1)
    return data


def save(data: dict, path: Path | None = None) -> None:
    p = path or queue_file()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(p)


# ── view ─────────────────────────────────────────────────────────
def view(data: dict, *, include_done: bool = False) -> list[dict]:
    """Display view: pending items (insertion order). If include_done, done items
    (most-recent first) are appended."""
    items = [i for i in data.get("items", []) if isinstance(i, dict)]
    pending = [i for i in items if not i.get("done")]
    if not include_done:
        return pending
    done = sorted((i for i in items if i.get("done")), key=lambda i: i.get("done_ts") or "", reverse=True)
    return pending + done


def counts(data: dict) -> tuple[int, int]:
    """(pending, total)."""
    items = [i for i in data.get("items", []) if isinstance(i, dict)]
    return sum(1 for i in items if not i.get("done")), len(items)


# ── mutations (mutate `data` in place; saving is the caller's job) ──
def add_item(data: dict, source: str, text: str, *, now: str | None = None) -> dict | None:
    """Add a decision item. Empty text → None (no-op). Idempotent: an identical
    pending source+text is not duplicated."""
    text = (text or "").strip()
    source = (source or "").strip() or "?"
    if not text:
        return None
    for i in data.get("items", []):
        if not i.get("done") and i.get("source") == source and i.get("text") == text:
            return i  # already pending — dedupe
    item = {
        "id": int(data.get("next_id", 1)),
        "source": source,
        "text": text,
        "ts": now or _now_iso(),
        "done": False,
        "done_ts": None,
    }
    data["next_id"] = item["id"] + 1
    data.setdefault("items", []).append(item)
    return item


def _find(data: dict, item_id: int) -> dict | None:
    for i in data.get("items", []):
        if isinstance(i, dict) and i.get("id") == item_id:
            return i
    return None


def set_done(data: dict, item_id: int, done: bool, *, now: str | None = None) -> bool:
    item = _find(data, item_id)
    if item is None:
        return False
    item["done"] = bool(done)
    item["done_ts"] = (now or _now_iso()) if done else None
    return True


def remove_item(data: dict, item_id: int) -> bool:
    items = data.get("items", [])
    for k, i in enumerate(items):
        if isinstance(i, dict) and i.get("id") == item_id:
            del items[k]
            return True
    return False
