#!/usr/bin/env python3
"""Cross-process single-flight lease for OMG ChatGPT CDP automation."""
from __future__ import annotations

import os
from pathlib import Path
import stat
import tempfile


class CdpLease:
    def __init__(self, port: int):
        uid = os.getuid() if hasattr(os, "getuid") else 0
        self.path = Path(tempfile.gettempdir()) / f"oh-my-gjc-chatgpt-cdp-{uid}-{port}.lock"
        self.fd: int | None = None

    def acquire(self) -> "CdpLease":
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
