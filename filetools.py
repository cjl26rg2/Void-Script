# SPDX-License-Identifier: GPL-3.0-or-later
"""filetools.py - files on your PC for the AI, through the bridge.

The AI (in the extension on DeepSeek, ChatGPT... or the app) can list, read,
write, edit, move, search and open files. What it may touch depends on the
"Files" setting in the extension popup:

  off      - nothing
  anywhere - any folder you name in your message ("fix the site in C:\\...\\website"),
             except Windows, Program Files, ProgramData, AppData and whole drives
  folder   - only inside one folder you picked (also the app's Workspace folder)

It never deletes and never runs programs, and it only opens safe file types (web
pages, pictures, text). Before it changes or overwrites a file, the old version is
copied to a history folder, so nothing is lost.
"""
import datetime
import fnmatch
import json
import os
import shutil

READ_CAP = 512 * 1024        # biggest file it will read
WRITE_CAP = 4 * 1024 * 1024  # biggest file it will write
OPENABLE = {".html", ".htm", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".txt", ".md", ".pdf", ".css", ".json", ".csv"}
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv"}
NAMES = {"files_list", "files_read", "files_write", "files_edit", "files_move", "files_search", "files_open"}
CONFIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
HISTORY = os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "VoidScript", "file-history")


# ── settings ────────────────────────────────────────────────────────────────
def _config():
    try:
        with open(CONFIG, encoding="utf-8") as f:
            v = json.load(f)
            return v if isinstance(v, dict) else {}
    except (OSError, ValueError):
        return {}


def _app_settings():
    base = os.environ.get("APPDATA")
    if not base:
        return {}
    try:
        with open(os.path.join(base, "app.voidscript.desktop", "settings.json"), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def picked_folder():
    return str(_config().get("files_dir") or "").strip()


def mode():
    """'off', 'anywhere' or 'folder'."""
    if os.environ.get("VS_FILES_DIR", "").strip():
        return "folder"
    m = _config().get("files_mode")
    if m in ("off", "anywhere", "folder"):
        return m if m != "folder" or workspace() else "off"
    return "folder" if workspace() else "off"


def workspace():
    """The base folder (for relative paths), or None."""
    env = os.environ.get("VS_FILES_DIR", "").strip()
    if env:
        return os.path.realpath(env) if os.path.isdir(env) else None
    picked = picked_folder()
    if picked:
        d, why = check_folder(picked)
        return None if why else d
    s = _app_settings()
    d = (s.get("workspace_dir") or "").strip()
    if not s.get("workspace_enabled") or not d or not os.path.isdir(d):
        return None
    return os.path.realpath(d)


def _banned():
    out = []
    for k in ("SystemRoot", "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432", "ProgramData", "APPDATA", "LOCALAPPDATA"):
        v = os.environ.get(k)
        if v:
            out.append(os.path.realpath(v).lower().rstrip("\\/"))
    return out


def blocked(path):
    """Why the AI may not touch this path, or ""."""
    p = os.path.realpath(path).lower().rstrip("\\/")
    if os.path.dirname(p) == p or len(p) <= 3:
        return "Whole drives are off limits - use a folder inside one."
    for b in _banned():
        if p == b or p.startswith(b + os.sep):
            return "Windows, Program Files, ProgramData and AppData are off limits."
    home = os.path.realpath(os.path.expanduser("~")).lower().rstrip("\\/")
    if p == home:
        return "Pick a folder inside your user folder, not the user folder itself."
    if os.path.basename(p) in {".ssh", ".gnupg", ".aws"} or os.sep + ".ssh" + os.sep in p + os.sep:
        return "That folder holds private keys - off limits."
    return ""


def check_folder(d):
    d = os.path.realpath(os.path.expanduser(str(d or "").strip().strip('"')))
    if not os.path.isdir(d):
        return d, "That folder doesn't exist."
    return d, blocked(d)


# ── paths ───────────────────────────────────────────────────────────────────
def _resolve(rel, base, m):
    raw = str(rel or "").strip().strip('"')
    if m == "anywhere" and raw and os.path.isabs(os.path.expanduser(raw)):
        full = os.path.realpath(os.path.expanduser(raw))
    else:
        if not base:
            raise RuntimeError("Give a full path, like C:\\Users\\you\\Documents\\my-site\\index.html.")
        rel = (raw or ".").replace("\\", "/").lstrip("/")
        full = os.path.realpath(os.path.join(base, rel))
        if m != "anywhere" and full != base and not full.startswith(base + os.sep):
            raise RuntimeError(f"'{raw}' is outside the folder the AI may use ({base}).")
    why = blocked(full)
    if why:
        raise RuntimeError(why)
    return full


def _backup(p):
    """Keep the old version before a change, so nothing is ever lost."""
    try:
        stamp = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
        dst = os.path.join(HISTORY, stamp, os.path.basename(p))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(p, dst)
    except OSError:
        pass


def _write(p, text):
    if os.path.exists(p):
        _backup(p)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + ".vs-tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    os.replace(tmp, p)


# ── the tools ───────────────────────────────────────────────────────────────
def tool_defs():
    m = mode()
    if m == "off":
        return []
    base = workspace()
    if m == "anywhere":
        common = ("Use full paths (C:\\...) to any folder the user names" +
                  (f"; short paths are relative to {base}." if base else ".") +
                  " Windows, Program Files and AppData are off limits.")
    else:
        common = f"Paths are relative to the user's folder '{base}'."
    return [
        {"name": "files_list", "description": f"List files and folders on the user's PC. {common}",
         "inputSchema": {"type": "object", "properties": {"path": {"type": "string", "description": "A folder"}}}},
        {"name": "files_read", "description": f"Read a text file on the user's PC. {common}",
         "inputSchema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
        {"name": "files_write", "description": f"Create or overwrite a text file on the user's PC (HTML, CSS, JS, Lua, JSON, Markdown...). Folders are created as needed. {common} To build a website: write index.html (plus style.css / script.js), then files_open it so the user sees it.",
         "inputSchema": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string", "description": "The whole file"}}, "required": ["path", "content"]}},
        {"name": "files_edit", "description": f"Change part of an existing file: replace an exact piece of its text (copy it from files_read, spaces included) with new text. Use this for fixes instead of rewriting the whole file. {common}",
         "inputSchema": {"type": "object", "properties": {"path": {"type": "string"}, "old_text": {"type": "string", "description": "Exact text to replace (must appear once, unless all is true)"},
                                                         "new_text": {"type": "string"}, "all": {"type": "boolean", "description": "Replace every match"}}, "required": ["path", "old_text", "new_text"]}},
        {"name": "files_move", "description": f"Rename or move a file or folder. Won't overwrite something that's already there. {common}",
         "inputSchema": {"type": "object", "properties": {"from": {"type": "string"}, "to": {"type": "string"}}, "required": ["from", "to"]}},
        {"name": "files_search", "description": f"Find files by name (wildcards like *.html work) or by text inside them, under a folder. {common}",
         "inputSchema": {"type": "object", "properties": {"folder": {"type": "string", "description": "Where to look"}, "name": {"type": "string", "description": "e.g. '*.html' or 'index'"},
                                                         "text": {"type": "string", "description": "Text to look for inside files (optional)"}}}},
        {"name": "files_open", "description": f"Open a file for the user to see - a web page in their browser, a picture, a text file. Only safe types (html, svg, images, txt, md, pdf, css, json, csv). {common}",
         "inputSchema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
    ]


def call(name, args):
    m = mode()
    if m == "off":
        raise RuntimeError("File access is off. In the VoidScript extension popup, under Files, choose 'Any folder I name' or 'One folder'.")
    base, args = workspace(), args or {}
    R = lambda key: _resolve(args.get(key), base, m)  # noqa: E731
    if name == "files_list":
        d = R("path")
        if not os.path.isdir(d):
            raise RuntimeError(f"There's no folder '{args.get('path')}'.")
        rows = [f"Folder: {d}"]
        for e in sorted(os.scandir(d), key=lambda e: (not e.is_dir(), e.name.lower()))[:500]:
            rows.append(f"[dir]  {e.name}/" if e.is_dir() else f"       {e.name}  ({e.stat().st_size} bytes)")
        return "\n".join(rows) if len(rows) > 1 else rows[0] + "\n(empty folder)"
    if name == "files_read":
        p = R("path")
        if not os.path.isfile(p):
            raise RuntimeError(f"There's no file '{args.get('path')}'.")
        if os.path.getsize(p) > READ_CAP:
            raise RuntimeError(f"That file is too big to read here (over {READ_CAP // 1024} KB).")
        with open(p, encoding="utf-8", errors="replace") as f:
            return f.read()
    if name == "files_write":
        p = R("path")
        content = str(args.get("content", ""))
        if len(content.encode("utf-8")) > WRITE_CAP:
            raise RuntimeError("That's too big to write in one go (over 4 MB).")
        if os.path.isdir(p):
            raise RuntimeError("That path is a folder - give a file name.")
        existed = os.path.exists(p)
        _write(p, content)
        return f"{'Updated' if existed else 'Created'} {p} ({len(content)} characters)."
    if name == "files_edit":
        p = R("path")
        if not os.path.isfile(p):
            raise RuntimeError(f"There's no file '{args.get('path')}'. Use files_write to create it.")
        old, new = str(args.get("old_text", "")), str(args.get("new_text", ""))
        if not old:
            raise RuntimeError("old_text is empty - say exactly which text to replace.")
        with open(p, encoding="utf-8", errors="replace", newline="") as f:
            text = f.read()
        n = text.count(old)
        if n == 0:
            raise RuntimeError("old_text wasn't found. files_read the file and copy the text exactly (spaces and line breaks too).")
        if n > 1 and not args.get("all"):
            raise RuntimeError(f"old_text appears {n} times. Include more surrounding text so it's unique, or set all to true.")
        text = text.replace(old, new) if args.get("all") else text.replace(old, new, 1)
        if len(text.encode("utf-8")) > WRITE_CAP:
            raise RuntimeError("The file would be too big (over 4 MB).")
        _write(p, text)
        return f"Edited {p} ({n if args.get('all') else 1} change{'s' if args.get('all') and n > 1 else ''})."
    if name == "files_move":
        src, dst = R("from"), R("to")
        if not os.path.exists(src):
            raise RuntimeError(f"There's nothing at '{args.get('from')}'.")
        if os.path.exists(dst):
            raise RuntimeError(f"'{args.get('to')}' already exists - pick another name.")
        if base and src == base:
            raise RuntimeError("That folder itself can't be moved.")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        os.replace(src, dst)
        return f"Moved {src} to {dst}."
    if name == "files_search":
        top = R("folder") if args.get("folder") else (base or "")
        if not top:
            raise RuntimeError("Say which folder to search (a full path).")
        pat, text = str(args.get("name") or "*").lower(), str(args.get("text") or "").lower()
        if "*" not in pat and "?" not in pat:
            pat = f"*{pat}*"
        hits = []
        for d, dirs, files in os.walk(top):
            dirs[:] = [x for x in dirs if x not in SKIP_DIRS and not x.startswith(".") and not blocked(os.path.join(d, x))]
            for fn in files:
                if not fnmatch.fnmatch(fn.lower(), pat):
                    continue
                full = os.path.join(d, fn)
                if text:
                    try:
                        if os.path.getsize(full) > READ_CAP:
                            continue
                        with open(full, encoding="utf-8", errors="ignore") as f:
                            if text not in f.read().lower():
                                continue
                    except OSError:
                        continue
                hits.append(full)
                if len(hits) >= 100:
                    return "\n".join(hits) + "\n(first 100 shown)"
        return "\n".join(hits) or "No files match."
    if name == "files_open":
        p = R("path")
        if not os.path.isfile(p):
            raise RuntimeError(f"There's no file '{args.get('path')}'.")
        ext = os.path.splitext(p)[1].lower()
        if ext not in OPENABLE:
            raise RuntimeError(f"For safety, only these can be opened: {', '.join(sorted(OPENABLE))}.")
        if hasattr(os, "startfile"):
            os.startfile(p)  # the user's default app for that type (a browser for .html)
        else:
            import subprocess
            import sys
            subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", p])
        return f"Opened {p} for the user."
    raise RuntimeError(f"unknown tool '{name}'")
