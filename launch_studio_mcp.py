#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""
launch_studio_mcp.py — VoidScript launcher for Roblox's StudioMCP binary.

The bridge (config.json -> mcpServers.roblox) runs this. Its job is tiny: locate
Roblox's own StudioMCP executable (it ships inside each installed Studio version)
and exec it, forwarding stdio and any args untouched so the bridge speaks MCP
straight to it. Roblox's own mcp.bat hard-codes one version path and breaks on
auto-update; this finds the newest *paired* install (a version folder that has
both StudioMCP and an actual Studio exe) so it never lands on a leftover.

Override the path with the VOID_STUDIO_MCP env var if discovery ever misses.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ENV_OVERRIDE = "VOID_STUDIO_MCP"
WIN_STUDIO_EXES = ("RobloxStudioBeta.exe", "RobloxStudio.exe")
MAC_STUDIO_EXES = ("RobloxStudio", "RobloxStudioBeta", "Roblox")


def _version_roots() -> list[Path]:
    roots: list[Path] = []
    la = os.environ.get("LOCALAPPDATA")
    if la:
        roots.append(Path(la) / "Roblox" / "Versions")
    for var in ("ProgramFiles", "ProgramFiles(x86)"):
        v = os.environ.get(var)
        if v:
            roots.append(Path(v) / "Roblox" / "Versions")
    return roots


def _newest(paths: list[Path]) -> Path | None:
    try:
        return max(paths, key=lambda p: p.stat().st_mtime)
    except (ValueError, OSError):
        return None


def _find_windows() -> Path | None:
    """Newest StudioMCP.exe from a version folder that also holds a real Studio
    exe (skip leftover 'zombie' folders that would launch with no Studio)."""
    paired, orphans = [], []
    for root in _version_roots():
        if not root.is_dir():
            continue
        try:
            for ver in root.iterdir():
                mcp = ver / "StudioMCP.exe"
                if not mcp.is_file():
                    continue
                (paired if any((ver / e).is_file() for e in WIN_STUDIO_EXES) else orphans).append(mcp)
        except OSError:
            continue
    return _newest(paired) or _newest(orphans)


def _find_mac() -> Path | None:
    home = Path.home()
    apps = [
        Path("/Applications/RobloxStudio.app"), home / "Applications/RobloxStudio.app",
        Path("/Applications/Roblox.app"), home / "Applications/Roblox.app",
    ]
    for app in apps:
        macos = app / "Contents" / "MacOS"
        mcp = macos / "StudioMCP"
        if mcp.is_file() and any((macos / e).is_file() for e in MAC_STUDIO_EXES):
            return mcp
    return None


def find_studio_mcp() -> Path | None:
    override = os.environ.get(ENV_OVERRIDE)
    if override:
        p = Path(override).expanduser()
        if p.is_file():
            return p
        cand = p / ("StudioMCP" if sys.platform == "darwin" else "StudioMCP.exe")
        if cand.is_file():
            return cand
        sys.stderr.write(f"launch_studio_mcp: {ENV_OVERRIDE} set but no StudioMCP at {override}\n")
    return _find_mac() if sys.platform == "darwin" else _find_windows()


def main() -> int:
    exe = find_studio_mcp()
    if not exe:
        name = "StudioMCP" if sys.platform == "darwin" else "StudioMCP.exe"
        sys.stderr.write(
            f"launch_studio_mcp: no {name} found. Open Roblox Studio and enable "
            "'Studio as MCP server' (Assistant settings), then retry.\n"
        )
        return 1
    sys.stderr.write(f"launch_studio_mcp: using {exe}\n")
    sys.stderr.flush()
    proc = subprocess.Popen([str(exe), *sys.argv[1:]])
    try:
        return proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
        return proc.wait()


if __name__ == "__main__":
    sys.exit(main())
