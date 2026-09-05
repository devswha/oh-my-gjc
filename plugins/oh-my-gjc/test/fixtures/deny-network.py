"""Linux test harness: deny IPv4/IPv6 socket creation in this process and children."""

import ctypes
import ctypes.util
import errno
import os
import socket
import sys


class ArgCmp(ctypes.Structure):
    _fields_ = [("arg", ctypes.c_uint), ("op", ctypes.c_int),
                ("datum_a", ctypes.c_uint64), ("datum_b", ctypes.c_uint64)]


lib = ctypes.CDLL(ctypes.util.find_library("seccomp") or "libseccomp.so.2")
lib.seccomp_init.argtypes = [ctypes.c_uint32]
lib.seccomp_init.restype = ctypes.c_void_p
lib.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
lib.seccomp_rule_add_array.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int,
                                      ctypes.c_uint, ctypes.POINTER(ArgCmp)]
lib.seccomp_load.argtypes = [ctypes.c_void_p]
lib.seccomp_release.argtypes = [ctypes.c_void_p]
ctx = lib.seccomp_init(0x7FFF0000)  # SCMP_ACT_ALLOW
assert ctx
try:
    for family in (socket.AF_INET, socket.AF_INET6):
        rule = ArgCmp(0, 4, family, 0)  # SCMP_CMP_EQ on socket(domain)
        assert lib.seccomp_rule_add_array(
            ctx, 0x00050000 | errno.EPERM, lib.seccomp_syscall_resolve_name(b"socket"),
            1, ctypes.byref(rule)) == 0
    assert lib.seccomp_load(ctx) == 0
finally:
    lib.seccomp_release(ctx)

# Fail the test harness itself if the filter does not actually block networking.
for family in (socket.AF_INET, socket.AF_INET6):
    try:
        socket.socket(family, socket.SOCK_STREAM)
    except OSError as exc:
        assert exc.errno == errno.EPERM
    else:
        raise AssertionError("network filter ineffective")
os.execvp(sys.argv[1], sys.argv[1:])
