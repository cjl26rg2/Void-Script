# SPDX-License-Identifier: GPL-3.0-or-later
"""Process and port lookups through the Windows API (ctypes, no extra packages).

The bridge used to shell out to tasklist, taskkill, netstat and PowerShell in
hidden windows. That works, but a script quietly spawning those tools to list
and end processes is exactly what antivirus heuristics look for. Asking Windows
directly does the same job with no child processes at all.

Every function returns an empty result instead of raising when something can't
be read, so callers can keep their "unknown -> do nothing" rule.
"""
import ctypes
import socket
import struct
import sys
from ctypes import wintypes

if sys.platform == "win32":
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    iphlp = ctypes.WinDLL("iphlpapi")

    TH32CS_SNAPPROCESS = 0x2
    PROCESS_TERMINATE = 0x1
    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    INVALID_HANDLE = ctypes.c_void_p(-1).value

    class PROCESSENTRY32W(ctypes.Structure):
        _fields_ = [
            ("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD),
            ("th32ProcessID", wintypes.DWORD), ("th32DefaultHeapID", ctypes.c_size_t),
            ("th32ModuleID", wintypes.DWORD), ("cntThreads", wintypes.DWORD),
            ("th32ParentProcessID", wintypes.DWORD), ("pcPriClassBase", ctypes.c_long),
            ("dwFlags", wintypes.DWORD), ("szExeFile", wintypes.WCHAR * 260),
        ]

    k32.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    k32.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    k32.Process32FirstW.argtypes = [wintypes.HANDLE, ctypes.POINTER(PROCESSENTRY32W)]
    k32.Process32NextW.argtypes = [wintypes.HANDLE, ctypes.POINTER(PROCESSENTRY32W)]
    k32.OpenProcess.restype = wintypes.HANDLE
    k32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    k32.TerminateProcess.argtypes = [wintypes.HANDLE, wintypes.UINT]
    k32.CloseHandle.argtypes = [wintypes.HANDLE]
    k32.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD,
                                               wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]


def processes():
    """[(pid, parent_pid, exe_name)] for every running process, or []."""
    if sys.platform != "win32":
        return []
    snap = k32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if not snap or snap == INVALID_HANDLE:
        return []
    out = []
    try:
        e = PROCESSENTRY32W()
        e.dwSize = ctypes.sizeof(e)
        ok = k32.Process32FirstW(snap, ctypes.byref(e))
        while ok:
            out.append((e.th32ProcessID, e.th32ParentProcessID, e.szExeFile))
            ok = k32.Process32NextW(snap, ctypes.byref(e))
    finally:
        k32.CloseHandle(snap)
    return out


def pids_named(exe):
    """PIDs whose image name is `exe` (case-insensitive, e.g. "StudioMCP.exe")."""
    exe = exe.lower()
    return [p for p, _, n in processes() if n.lower() == exe]


def running(exe):
    """True/False whether a process named `exe` exists; None if unknown."""
    if sys.platform != "win32":
        return None
    procs = processes()
    if not procs:
        return None
    exe = exe.lower()
    return any(n.lower() == exe for _, _, n in procs)


def name_of(pid):
    for p, _, n in processes():
        if p == int(pid):
            return n
    return ""


def path_of(pid):
    """Full path of a process's exe, or "" if Windows won't say."""
    if sys.platform != "win32":
        return ""
    h = k32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, int(pid))
    if not h:
        return ""
    try:
        buf = ctypes.create_unicode_buffer(1024)
        size = wintypes.DWORD(len(buf))
        if k32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(size)):
            return buf.value
        return ""
    finally:
        k32.CloseHandle(h)


def descendants(root):
    """root + every descendant PID, or None if the process list can't be read."""
    procs = processes()
    if not procs:
        return None
    kids = {}
    for p, pp, _ in procs:
        kids.setdefault(pp, []).append(p)
    seen, stack = {int(root)}, [int(root)]
    while stack:
        for c in kids.get(stack.pop(), []):
            if c not in seen and c != 0:
                seen.add(c)
                stack.append(c)
    return seen


def kill(pid):
    """End one process. True if Windows accepted it."""
    if sys.platform != "win32":
        return False
    h = k32.OpenProcess(PROCESS_TERMINATE, False, int(pid))
    if not h:
        return False
    try:
        return bool(k32.TerminateProcess(h, 1))
    finally:
        k32.CloseHandle(h)


def kill_tree(pid):
    """End a process and everything it started, children first."""
    tree = descendants(pid) or {int(pid)}
    for p in sorted(tree - {int(pid)}, reverse=True):
        kill(p)
    return kill(pid)


def port_owner(port):
    """PID LISTENING on a local TCP port (IPv4 or IPv6), or None."""
    if sys.platform != "win32":
        return None
    for family, row in ((socket.AF_INET, 24), (socket.AF_INET6, 56)):
        size = wintypes.DWORD(0)
        # TCP_TABLE_OWNER_PID_LISTENER = 3
        iphlp.GetExtendedTcpTable(None, ctypes.byref(size), False, family, 3, 0)
        if not size.value:
            continue
        buf = ctypes.create_string_buffer(size.value)
        if iphlp.GetExtendedTcpTable(buf, ctypes.byref(size), False, family, 3, 0) != 0:
            continue
        count = struct.unpack_from("<I", buf, 0)[0]
        for i in range(count):
            off = 4 + i * row
            if family == socket.AF_INET:
                # state, local addr, local port, remote addr, remote port, pid
                lport = struct.unpack_from(">H", buf, off + 8)[0]
                pid = struct.unpack_from("<I", buf, off + 20)[0]
            else:
                # local addr(16), scope(4), local port(4), remote addr(16), scope(4), remote port(4), state(4), pid(4)
                lport = struct.unpack_from(">H", buf, off + 20)[0]
                pid = struct.unpack_from("<I", buf, off + 52)[0]
            if lport == port and pid:
                return pid
    return None
