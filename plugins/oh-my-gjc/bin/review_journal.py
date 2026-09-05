"""Private local receipts for one review request; never a server exactly-once promise.

A receipt cannot prove delivery when the browser disappears at the send boundary.
Unknown delivery is deliberately terminal for sending. Recovery requires a recorded
conversation and user turn, and never guesses a turn from the newest answer.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import stat
import uuid

HEX = re.compile(r"[0-9a-f]{64}")
TAG = re.compile(r"[0-9]{8}_[0-9]{6}_[0-9]+_[0-9a-f]{6}")
ANCHOR = re.compile(r"[A-Za-z0-9_-]{1,128}")
CONVERSATION = re.compile(r"https://chatgpt\.com(?:/g/[A-Za-z0-9._-]+)?/c/[0-9a-f-]{8,}")
MAX_JOURNAL = 4 * 1024 * 1024


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def text_hash(text: str) -> str:
    return digest(" ".join(text.split()).encode("utf-8"))


def canonical(path: Path) -> Path:
    path = Path(os.path.abspath(path.expanduser()))
    for part in (path, *path.parents):
        if part.is_symlink():
            raise ValueError(f"symlinked review path: {part}")
    return path


def _owned(info, mode: int, directory: bool = False) -> None:
    valid_type = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    if (not valid_type or (hasattr(os, "getuid") and info.st_uid != os.getuid())
            or (os.name != "nt" and stat.S_IMODE(info.st_mode) != mode)
            or (not directory and info.st_nlink != 1)):
        raise ValueError("review state must be an owned private directory/file without hardlinks")


def private_read(path: Path) -> bytes:
    path = canonical(path)
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        _owned(info, 0o600)
        current = path.lstat()
        if (info.st_dev, info.st_ino) != (current.st_dev, current.st_ino):
            raise ValueError("review file replaced while opening")
        raw = stream.read(MAX_JOURNAL + 1)
    if len(raw) > MAX_JOURNAL:
        raise ValueError("oversized review state")
    return raw


def file_hash(path: Path, private: bool = False, *, content_out=None) -> str:
    path = canonical(path)
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        if private:
            _owned(before, 0o600)
        if not stat.S_ISREG(before.st_mode):
            raise ValueError("source/pack is not a regular file")
        h = hashlib.sha256()
        chunks = [] if content_out is not None else None
        while chunk := stream.read(1024 * 1024):
            h.update(chunk)
            if chunks is not None:
                chunks.append(chunk)
        after = os.fstat(stream.fileno())
        current = path.lstat()
        fields = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
        if fields(before) != fields(after) or fields(after) != fields(current):
            raise ValueError("source/pack changed while hashing")
    if content_out is not None:
        content_out.append(b"".join(chunks))
    return h.hexdigest()


def packed_file_inventory(body: str, style: str, expected_count: int | None) -> list[str]:
    """Read the file-entry headers audited against repomix's own file count.

    Pinned repomix 1.15.0 outputStyles/{markdown,xml,plain}Style.ts. Content
    resembling a header makes the count ambiguous and is rejected, not guessed.
    """
    if style == "markdown":
        paths = re.findall(r"(?m)^## File: ([^\r\n]+)$", body)
    elif style == "xml":
        paths = re.findall(r'(?m)^<file path="([^"\r\n]+)">$' , body)
    elif style == "plain":
        paths = re.findall(r"(?m)^={16}\nFile: ([^\r\n]+)\n={16}$", body)
    else:
        raise ValueError("unsupported pack inventory style")
    if not paths or expected_count is None or len(paths) != expected_count:
        raise ValueError("pack inventory does not match repomix's audited file count")
    if len(paths) != len(set(paths)):
        raise ValueError("duplicate packed file paths")
    for path in paths:
        _relative_source_path(path)
    return paths


def _relative_source_path(path: str) -> Path:
    if (not isinstance(path, str) or not path or len(path) > 4096
            or any(ord(c) < 32 for c in path) or "\\" in path):
        raise ValueError("invalid packed source path")
    relative = Path(path)
    if relative.is_absolute() or ".." in relative.parts or relative.as_posix() != path:
        raise ValueError("packed source path escapes its root")
    return relative


# JavaScript String.trim(), used by pinned repomix's lightweight transforms.
_JS_SPACE = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"


def verify_packed_source(body: str, style: str, name: str, raw: bytes, line_numbers: bool):
    """Compare the actual full source to its rendered pack entry, not timestamps.

    Repomix trims file boundaries and optionally numbers lines. Unknown encodings
    or transforms fail closed rather than binding a current file to an older pack.
    """
    expected = raw.decode("utf-8-sig").strip(_JS_SPACE)
    if line_numbers:
        lines = expected.split("\n")
        width = len(str(len(lines)))
        expected = "\n".join(f"{i:{width}}: {line}" for i, line in enumerate(lines, 1))
    expected = expected.replace("\r\n", "\n").replace("\r", "\n")
    if style == "markdown":
        match = re.search(r"(?m)^## File: " + re.escape(name) + r"\n(`{3,})[^\n]*\n", body)
        if not match:
            raise ValueError("missing packed source block")
        close = body.find("\n" + match.group(1) + "\n", match.end())
        actual = body[match.end():close] if close >= 0 else None
    elif style == "xml":
        marker = f'<file path="{name}">\n'
        start = body.index(marker) + len(marker)
        close = body.find("\n</file>", start)
        actual = body[start:close] if close >= 0 else None
    elif style == "plain":
        marker = "=" * 16 + f"\nFile: {name}\n" + "=" * 16 + "\n"
        start = body.index(marker) + len(marker)
        boundary = re.search(r"(?m)^={16}\nFile: |^={64}\n", body[start:])
        actual = body[start:start + boundary.start()] if boundary else body[start:]
        actual = actual.rstrip(_JS_SPACE)
        expected = expected.rstrip(_JS_SPACE)
    else:
        raise ValueError("unsupported packed source format")
    if actual != expected:
        raise ValueError(f"included source differs from its full packed content: {name}")


def source_identity(root: Path, inventory: list[str], *, packed=None) -> dict:
    """Fingerprint only audited packed files; unrelated runtime state is not read.

    Initial capture also compares each source to its actual pack entry. Recovery
    rechecks those same byte hashes without repacking or reading unrelated files.
    """
    root = canonical(root)
    if not root.is_dir() or not inventory or len(inventory) != len(set(inventory)):
        raise ValueError("invalid packed source inventory")
    entries = []
    for name in sorted(inventory):
        path = canonical(root / _relative_source_path(name))
        content = [] if packed is not None else None
        sha = file_hash(path, content_out=content)
        if packed is not None:
            body, style, line_numbers = packed
            verify_packed_source(body, style, name, content[0], line_numbers)
        entries.append({"path": name, "sha256": sha, "mode": stat.S_IMODE(path.lstat().st_mode)})
    return {"root": str(root), "sha256": digest(json.dumps(entries, sort_keys=True).encode()), "files": entries}


def _string(value, limit=4096):
    return isinstance(value, str) and 0 < len(value) <= limit and not any(ord(c) < 32 for c in value)


def validate(data: dict) -> None:
    keys = {"schema", "run_tag", "label", "mode", "out_dir", "source", "pack", "identity_sha256",
            "prompt", "request_sha256", "verified_model", "send_state", "conversation",
            "baseline", "user_turn", "assistant_turn", "response_sha256"}
    if not isinstance(data, dict) or set(data) != keys or type(data["schema"]) is not int or data["schema"] != 1:
        raise ValueError("invalid review journal schema")
    if not isinstance(data["run_tag"], str) or not TAG.fullmatch(data["run_tag"]):
        raise ValueError("invalid run tag")
    if not isinstance(data["label"], str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,200}", data["label"]):
        raise ValueError("invalid review label")
    if data["mode"] not in ("review", "prompt", "followup") or data["send_state"] not in ("prepared", "unknown", "observed", "complete"):
        raise ValueError("invalid review state")
    if not _string(data["out_dir"]) or str(canonical(Path(data["out_dir"]))) != data["out_dir"]:
        raise ValueError("invalid output directory")
    if not isinstance(data["prompt"], str) or not data["prompt"] or len(data["prompt"]) > 1000000:
        raise ValueError("invalid prompt")
    for key in ("request_sha256", "response_sha256"):
        if data[key] is not None and (not isinstance(data[key], str) or not HEX.fullmatch(data[key])):
            raise ValueError("invalid content hash")
    if data["verified_model"] is not None and not _string(data["verified_model"], 300):
        raise ValueError("invalid model evidence")
    for key in ("user_turn", "assistant_turn"):
        if data[key] is not None and (not isinstance(data[key], str) or not ANCHOR.fullmatch(data[key])):
            raise ValueError("invalid turn anchor")
    if data["conversation"] is not None and (not isinstance(data["conversation"], str) or not CONVERSATION.fullmatch(data["conversation"])):
        raise ValueError("invalid conversation")
    baseline = data["baseline"]
    if not isinstance(baseline, list) or len(baseline) > 10000:
        raise ValueError("invalid baseline")
    ids = []
    for row in baseline:
        if (not isinstance(row, dict) or set(row) != {"id", "role"}
                or not isinstance(row["id"], str) or not ANCHOR.fullmatch(row["id"])
                or row["role"] not in ("user", "assistant")):
            raise ValueError("invalid baseline turn")
        ids.append(row["id"])
    anchors = ids + [data[k] for k in ("user_turn", "assistant_turn") if data[k] is not None]
    if len(anchors) != len(set(anchors)):
        raise ValueError("duplicate turn anchors")
    for key, expected in (("source", {"root", "sha256", "files"}), ("pack", {"path", "sha256"})):
        item = data[key]
        if item is None:
            continue
        if not isinstance(item, dict) or set(item) != expected or not isinstance(item["sha256"], str) or not HEX.fullmatch(item["sha256"]):
            raise ValueError("invalid source/pack identity")
        path = item["root" if key == "source" else "path"]
        if not _string(path) or str(canonical(Path(path))) != path:
            raise ValueError("invalid source/pack path")
        if key == "source":
            entries = item["files"]
            if not isinstance(entries, list) or not entries or len(entries) > 100000:
                raise ValueError("invalid source file inventory")
            names = []
            for entry in entries:
                if (not isinstance(entry, dict) or set(entry) != {"path", "sha256", "mode"}
                        or not isinstance(entry["sha256"], str) or not HEX.fullmatch(entry["sha256"])
                        or type(entry["mode"]) is not int or not 0 <= entry["mode"] <= 0o7777):
                    raise ValueError("invalid source inventory entry")
                _relative_source_path(entry["path"])
                names.append(entry["path"])
            if names != sorted(set(names)) or item["sha256"] != digest(json.dumps(entries, sort_keys=True).encode()):
                raise ValueError("source inventory checksum mismatch")
    if ((data["source"] is None) != (data["pack"] is None)
            or (data["mode"] == "review" and data["source"] is None)
            or (data["mode"] == "prompt" and data["source"] is not None)):
        raise ValueError("review is missing its immutable code identity")
    identity = digest(json.dumps([data["source"], data["pack"]], sort_keys=True).encode())
    if data["identity_sha256"] != identity:
        raise ValueError("source/pack identity checksum mismatch")
    if data["send_state"] != "prepared" and data["request_sha256"] is None:
        raise ValueError("send boundary without a request hash")
    if data["assistant_turn"] and not data["user_turn"]:
        raise ValueError("assistant without request anchor")
    if data["user_turn"] and not data["conversation"]:
        raise ValueError("request without bound conversation")
    if data["send_state"] in ("observed", "complete") and not data["user_turn"]:
        raise ValueError("observed state without request")
    if data["send_state"] == "complete" and (not data["assistant_turn"] or not data["response_sha256"]):
        raise ValueError("complete state without response evidence")


class RunJournal:
    def __init__(self, path: Path, data: dict):
        self.path, self.data = canonical(path), data
        self.attempted = data["send_state"] != "prepared"
        self._saved = json.loads(json.dumps(data))

    @classmethod
    def create(cls, out_dir: Path, run_tag: str, label: str, prompt: str,
               source=None, pack_path=None, followup=False):
        out_dir = canonical(out_dir)
        directory = out_dir / "runs"
        canonical(directory).mkdir(mode=0o700, exist_ok=True)
        _owned(directory.lstat(), 0o700, True)
        pack = {"path": str(canonical(pack_path)), "sha256": file_hash(pack_path, private=True)} if pack_path else None
        data = dict(schema=1, run_tag=run_tag, label=label,
                    mode="followup" if followup else "review" if source else "prompt",
                    out_dir=str(out_dir), source=source, pack=pack,
                    identity_sha256=digest(json.dumps([source, pack], sort_keys=True).encode()),
                    prompt=prompt, request_sha256=None, verified_model=None,
                    send_state="prepared", conversation=None, baseline=[], user_turn=None,
                    assistant_turn=None, response_sha256=None)
        journal = cls(directory / f"run_{run_tag}.json", data)
        journal.save(create=True)
        return journal

    @classmethod
    def read(cls, path: Path):
        path = canonical(path)
        _owned(path.parent.lstat(), 0o700, True)
        def unique(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError("duplicate journal key")
                result[key] = value
            return result
        data = json.loads(private_read(path), object_pairs_hook=unique)
        validate(data)
        if path != Path(data["out_dir"]) / "runs" / f"run_{data['run_tag']}.json":
            raise ValueError("journal location does not match run identity")
        return cls(path, data)

    def save(self, create=False):
        validate(self.data)
        directory = canonical(self.path.parent)
        _owned(directory.lstat(), 0o700, True)
        if not create:
            previous = RunJournal.read(self.path)
            # Detect replacement/content tampering between journal updates.
            if hasattr(self, "_saved") and previous.data != self._saved:
                raise ValueError("journal changed outside this run")
        elif self.path.exists() or self.path.is_symlink():
            raise FileExistsError(self.path)
        raw = json.dumps(self.data, ensure_ascii=False, sort_keys=True, indent=2).encode() + b"\n"
        if len(raw) > MAX_JOURNAL:
            raise ValueError("oversized journal")
        temp = directory / f".run-{uuid.uuid4().hex}.tmp"
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
        try:
            with os.fdopen(fd, "wb") as stream:
                if hasattr(os, "fchmod"):
                    os.fchmod(stream.fileno(), 0o600)
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
            canonical(self.path)
            if create:
                os.link(temp, self.path)  # exclusive publication, no overwrite
                temp.unlink()
            else:
                os.replace(temp, self.path)
            if os.name != "nt":
                dfd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
                try:
                    os.fsync(dfd)
                finally:
                    os.close(dfd)
        finally:
            if temp.exists():
                temp.unlink()
        self._saved = json.loads(raw)

    def update(self, **changes):
        self.data.update(changes)
        self.save()

    def begin_send(self):
        if self.attempted or self.data["send_state"] != "prepared":
            raise ValueError("send already attempted; only harvest is permitted")
        self.attempted = True  # latch even if journal I/O fails or the click raises
        self.update(send_state="unknown")  # fsync before irreversible input

    def verify_identity(self):
        if self.data["source"] is not None:
            now = source_identity(Path(self.data["source"]["root"]),
                                  [entry["path"] for entry in self.data["source"]["files"]])
            if now != self.data["source"]:
                raise ValueError("source changed; this review cannot represent current code")
        if self.data["pack"] is not None:
            if file_hash(Path(self.data["pack"]["path"]), private=True) != self.data["pack"]["sha256"]:
                raise ValueError("review pack changed")

    def require_recovery(self):
        validate(self.data)
        if (not self.attempted or not self.data["conversation"]
                or not self.data["verified_model"]):
            raise ValueError("insufficient verified conversation/request/model evidence for harvest; never resend automatically")
        # A bound conversation plus the persisted full request hash, unique run
        # marker and baseline can identify a request after a post-send DOM error.
        # observe_bound_turn must verify them before binding any missing turn ID.
        self.verify_identity()
