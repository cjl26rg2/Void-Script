# SPDX-License-Identifier: GPL-3.0-or-later
# launch_studio_mcp.py
# ──────────────────────────────────────────────────────────────────────────
#  Robust launcher for Roblox's StudioMCP.exe (the Studio MCP studio server).
#
#  Roblox ships a %LOCALAPPDATA%\Roblox\mcp.bat, but it hard-codes ONE Studio
#  version path. When Studio auto-updates, that folder is eventually removed and
#  the .bat's fallback branch is broken batch syntax (`else` on its own line),
#  so StudioMCP.exe never launches -> the bridge sees 0 tools -> the extension
#  reports "Bridge or Studio offline".
#
#  This launcher sidesteps that entirely: it finds the NEWEST StudioMCP.exe
#  across all installed Studio versions and launches it, transparently forwarding
#  stdio and any CLI args. It also supports an explicit override path via
#  `VS_STUDIO_MCP_PATH` when discovery is not enough.
# ──────────────────────────────────────────────────────────────────────────
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Iterable, Optional

ENV_OVERRIDE = "VS_STUDIO_MCP_PATH"
WINDOWS_STUDIO_EXECUTABLES = ("RobloxStudioBeta.exe", "RobloxStudio.exe")
MAC_STUDIO_EXECUTABLES = ("RobloxStudio", "RobloxStudioBeta", "Roblox")


def _candidate_roots() -> list[Path]:
    """Directories that may contain Roblox Studio version folders (Windows)."""
    roots: list[Path] = []
    local_appdata = os.environ.get("LOCALAPPDATA")
    if local_appdata:
        roots.append(Path(local_appdata) / "Roblox" / "Versions")
    for env in ("ProgramFiles", "ProgramFiles(x86)"):
        value = os.environ.get(env)
        if value:
            roots.append(Path(value) / "Roblox" / "Versions")
    return roots


def _resolve_override_path(path_value: str) -> Optional[Path]:
    path = Path(path_value).expanduser()
    if path.is_file():
        return path
    if path.is_dir():
        if sys.platform == "darwin":
            candidate = path / "Contents" / "MacOS" / "StudioMCP"
        else:
            candidate = path / "StudioMCP.exe"
        if candidate.is_file():
            return candidate
    return None


def _newest_path(paths: Iterable[Path]) -> Optional[Path]:
    try:
        return max(paths, key=lambda p: p.stat().st_mtime)
    except (ValueError, OSError):
        return None


def _find_studio_mcp_windows() -> Optional[Path]:
    """Return the path to the StudioMCP.exe of the live Studio install, or None.

    Roblox leaves "zombie" version folders behind after an update: they still
    contain a StudioMCP.exe but no RobloxStudioBeta.exe / RobloxStudio.exe
    (the actual Studio is gone). Picking the newest StudioMCP.exe by mtime can
    land on such a zombie, which launches fine but has no Studio to attach to ->
    the bridge sees 0 tools.

    We only consider version folders that ALSO contain a current Studio
    executable, and prefer the newest of those. We keep zombie StudioMCP.exe
    paths only as a last-resort fallback if no paired install exists.
    """
    paired: list[Path] = []
    orphans: list[Path] = []
    for root in _candidate_roots():
        if not root.is_dir():
            continue
        try:
            for version_dir in root.iterdir():
                if not version_dir.is_dir():
                    continue
                studio_mcp = version_dir / "StudioMCP.exe"
                if not studio_mcp.is_file():
                    continue
                if any((version_dir / exe_name).is_file() for exe_name in WINDOWS_STUDIO_EXECUTABLES):
                    paired.append(studio_mcp)
                else:
                    orphans.append(studio_mcp)
        except OSError:
            continue
    return _newest_path(paired) or _newest_path(orphans)


def _mac_app_candidates() -> list[Path]:
    """Locations where Roblox Studio may be installed on macOS."""
    home = Path.home()
    return [
        Path("/Applications/RobloxStudio.app"),
        home / "Applications" / "RobloxStudio.app",
        Path("/Applications/Roblox.app"),
        home / "Applications" / "Roblox.app",
        Path("/Applications/RobloxStudioBeta.app"),
        home / "Applications" / "RobloxStudioBeta.app",
    ]


def _find_studio_mcp_mac() -> Optional[Path]:
    """Return the path to StudioMCP inside a Roblox Studio app bundle, or None."""
    for app in _mac_app_candidates():
        macos_dir = app / "Contents" / "MacOS"
        studio_mcp = macos_dir / "StudioMCP"
        if not studio_mcp.is_file():
            continue
        if any((macos_dir / exe_name).is_file() for exe_name in MAC_STUDIO_EXECUTABLES):
            return studio_mcp
    return None


# ── Linux: Roblox Studio runs under Wine, usually through Vinegar ────────────
# StudioMCP.exe is a Windows program, so it runs through Wine too. It reaches
# Studio over localhost, so any Wine works - but Vinegar's own (Flatpak) Wine is
# preferred when Studio was installed by the Vinegar Flatpak.
VINEGAR_FLATPAK = "org.vinegarhq.Vinegar"
ENV_CMD = "VS_STUDIO_MCP_CMD"   # full command for unusual setups, e.g. "wine /path/StudioMCP.exe"
ENV_WINE = "VS_WINE"            # which wine binary to use (default: wine on PATH)


def _linux_version_dirs() -> list[Path]:
    home = Path.home()
    flat = home / ".var" / "app" / VINEGAR_FLATPAK / "data" / "vinegar"
    native = home / ".local" / "share" / "vinegar"
    pats = [
        (flat, "versions/*"), (native, "versions/*"),                                   # Vinegar
        (flat, "prefixes/*/drive_c/users/*/AppData/Local/Roblox/Versions/*"),
        (native, "prefixes/*/drive_c/users/*/AppData/Local/Roblox/Versions/*"),
        (home / ".local" / "share" / "grapejuice", "prefixes/*/drive_c/users/*/AppData/Local/Roblox/Versions/*"),
        (home / ".wine", "drive_c/users/*/AppData/Local/Roblox/Versions/*"),             # plain Wine
        (home / ".wine", "drive_c/Program Files*/Roblox/Versions/*"),
    ]
    out: list[Path] = []
    for base, pat in pats:
        if base.is_dir():
            out.extend(p for p in base.glob(pat) if p.is_dir())
    prefix = os.environ.get("WINEPREFIX")
    if prefix:
        out.extend(p for p in Path(prefix).glob("drive_c/users/*/AppData/Local/Roblox/Versions/*") if p.is_dir())
    return out


def _find_studio_mcp_linux() -> Optional[Path]:
    paired: list[Path] = []
    orphans: list[Path] = []
    for version_dir in _linux_version_dirs():
        studio_mcp = version_dir / "StudioMCP.exe"
        if not studio_mcp.is_file():
            continue
        if any((version_dir / exe_name).is_file() for exe_name in WINDOWS_STUDIO_EXECUTABLES):
            paired.append(studio_mcp)
        else:
            orphans.append(studio_mcp)
    return _newest_path(paired) or _newest_path(orphans)


def _wine_prefix_for(exe: Path) -> Optional[Path]:
    """The Wine prefix (the folder holding drive_c) this exe lives in, or - for
    Vinegar's versions folder, which sits outside the prefix - Vinegar's studio prefix."""
    for parent in exe.parents:
        if (parent / "drive_c").is_dir():
            return parent
        if parent.name == "versions" and (parent.parent / "prefixes").is_dir():
            studio = parent.parent / "prefixes" / "studio"
            return studio if studio.is_dir() else next((p for p in (parent.parent / "prefixes").iterdir() if p.is_dir()), None)
    return None


def _linux_command(exe: Path) -> list[str]:
    import shutil
    prefix = _wine_prefix_for(exe)
    in_flatpak = f"/.var/app/{VINEGAR_FLATPAK}/" in exe.as_posix()
    if in_flatpak and shutil.which("flatpak") and not os.environ.get(ENV_WINE):
        cmd = ["flatpak", "run", "--command=wine"]
        if prefix:
            cmd.append(f"--env=WINEPREFIX={prefix}")
        return cmd + [VINEGAR_FLATPAK, str(exe)]
    wine = os.environ.get(ENV_WINE) or shutil.which("wine") or shutil.which("wine64")
    if not wine:
        raise FileNotFoundError("Wine isn't installed (or set VS_WINE to your wine binary).")
    if prefix:
        os.environ["WINEPREFIX"] = str(prefix)
    return [wine, str(exe)]


def find_studio_mcp() -> Optional[Path]:
    override_value = os.environ.get(ENV_OVERRIDE)
    if override_value:
        override_path = _resolve_override_path(override_value)
        if override_path:
            return override_path
        sys.stderr.write(
            f"launch_studio_mcp: {ENV_OVERRIDE} is set but does not point to a valid StudioMCP binary: {override_value}\n"
        )
    if sys.platform == "darwin":
        return _find_studio_mcp_mac()
    if sys.platform.startswith("linux"):
        return _find_studio_mcp_linux()
    return _find_studio_mcp_windows()


def main() -> int:
    linux = sys.platform.startswith("linux")
    custom = os.environ.get(ENV_CMD)
    if custom:
        import shlex
        cmd = shlex.split(custom)
        sys.stderr.write(f"launch_studio_mcp: using {ENV_CMD}: {custom}\n")
    else:
        exe = find_studio_mcp()
        binary_name = "StudioMCP" if sys.platform == "darwin" else "StudioMCP.exe"
        if not exe:
            hint = (" On Linux, install Studio with Vinegar (flathub: org.vinegarhq.Vinegar), open it once,"
                    f" or point {ENV_OVERRIDE} at StudioMCP.exe.") if linux else ""
            sys.stderr.write(
                f"launch_studio_mcp: no {binary_name} found. Open Roblox Studio and "
                f"enable 'Studio as MCP server' (Assistant Settings > MCP Servers).{hint}\n"
            )
            return 1
        try:
            cmd = _linux_command(exe) if linux else [str(exe)]
        except FileNotFoundError as e:
            sys.stderr.write(f"launch_studio_mcp: {e}\n")
            return 1
        sys.stderr.write(f"launch_studio_mcp: using {exe}" + (f" via {cmd[0]}" if linux else "") + "\n")
    sys.stderr.flush()
    # Wine's own chatter goes to stderr; quiet the usual noise so the bridge log stays readable.
    os.environ.setdefault("WINEDEBUG", "-all")
    proc = subprocess.Popen(cmd + sys.argv[1:])
    try:
        return proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
        return proc.wait()


if __name__ == "__main__":
    sys.exit(main())
