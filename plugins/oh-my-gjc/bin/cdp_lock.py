#!/usr/bin/env python3
"""Cross-process single-flight lease for OMG ChatGPT CDP automation."""
from __future__ import annotations

import os
from pathlib import Path
import stat
import tempfile
import time


class _LeaseRaced(Exception):
    """The lease file changed identity while we were acquiring it."""


class CdpLease:
    def __init__(self, port: int):
        uid = os.getuid() if hasattr(os, "getuid") else 0
        self.path = Path(tempfile.gettempdir()) / f"oh-my-gjc-chatgpt-cdp-{uid}-{port}.lock"
        self.fd: int | None = None

    def acquire(self) -> "CdpLease":
        # flock binds to an inode, not a path: if the lease file is replaced between
        # our open() and our lock, we can end up holding an orphaned inode while a
        # second process locks the live one — both then drive the same CDP browser.
        # Retry a bounded number of times; each attempt re-validates the binding.
        last: Exception | None = None
        for _ in range(5):
            try:
                return self._acquire_once()
            except _LeaseRaced as exc:
                last = exc
                time.sleep(0.05)
        raise RuntimeError(
            f"CDP lease kept being replaced during acquisition: {last}")

    def _acquire_once(self) -> "CdpLease":
        flags = os.O_RDWR | os.O_CREAT
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        fd = os.open(self.path, flags, 0o600)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode):
                raise RuntimeError(f"CDP lease is not a regular file: {self.path}")
            if hasattr(os, "getuid") and info.st_uid != os.getuid():
                raise RuntimeError(f"CDP lease is not owned by the current user: {self.path}")
            if os.name != "nt":
                os.fchmod(fd, 0o600)
                import fcntl
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError as exc:
                    raise RuntimeError("another OMG ChatGPT CDP automation is running") from exc
            else:
                import msvcrt
                os.lseek(fd, 0, os.SEEK_SET)
                if os.fstat(fd).st_size == 0:
                    os.write(fd, b"\0")
                os.lseek(fd, 0, os.SEEK_SET)
                try:
                    msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
                except OSError as exc:
                    raise RuntimeError("another OMG ChatGPT CDP automation is running") from exc
            # flock binds to the inode, not the path. If the lease file was replaced
            # between our open() and our lock (tmp reaper, a stray rm, another run
            # recreating it), we are now holding a lock on an orphaned inode while a
            # second process locks the live one — both would drive the same CDP
            # browser. Confirm the path still resolves to the inode we locked.
            if os.name != "nt":
                try:
                    on_disk = os.stat(self.path)
                except FileNotFoundError:
                    # our inode is now unlinked: the lock we hold guards nothing
                    raise _LeaseRaced("lease file vanished during acquisition") from None
                if (on_disk.st_dev, on_disk.st_ino) != (info.st_dev, info.st_ino):
                    raise _LeaseRaced("lease file was replaced during acquisition")
            os.ftruncate(fd, 0)
            os.write(fd, str(os.getpid()).encode("ascii"))
            os.fsync(fd)
            self.fd = fd
            return self
        except BaseException:
            # BaseException, not Exception: a KeyboardInterrupt between os.open and
            # `self.fd = fd` would otherwise leak the descriptor AND the lock we may
            # already hold — and since __enter__ raised, __exit__ never runs to
            # release it. The next run would then block on a lease nobody owns.
            try:
                if os.name != "nt":
                    import fcntl
                    fcntl.flock(fd, fcntl.LOCK_UN)
                else:
                    import msvcrt
                    os.lseek(fd, 0, os.SEEK_SET)
                    msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
            except OSError:
                pass  # lock was never acquired; closing the fd is enough
            finally:
                os.close(fd)
            raise

    def still_binding(self) -> bool:
        """Does the lease path still resolve to the inode we locked?

        If a tmp reaper or a stray rm unlinked our file, our flock now guards an
        orphan: another run will create a fresh file, lock that, and drive the same
        CDP browser concurrently. Callers that hold the lease across a long
        automation re-check this before acting on the browser."""
        if self.fd is None or os.name == "nt":
            return self.fd is not None
        try:
            held = os.fstat(self.fd)
            on_disk = os.stat(self.path)
        except OSError:
            return False
        return (held.st_dev, held.st_ino) == (on_disk.st_dev, on_disk.st_ino)

    def release(self) -> None:
        if self.fd is None:
            return
        fd, self.fd = self.fd, None
        try:
            if os.name != "nt":
                import fcntl
                fcntl.flock(fd, fcntl.LOCK_UN)
            else:
                import msvcrt
                os.lseek(fd, 0, os.SEEK_SET)
                msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
        finally:
            os.close(fd)

    def __enter__(self) -> "CdpLease":
        return self.acquire()

    def __exit__(self, *_args) -> None:
        self.release()
