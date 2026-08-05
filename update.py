#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# update.py - VoidScript auto-updater.
#
#   python update.py --auto    fully automatic mode (used by start.bat):
#                              silently downloads+applies a newer release and
#                              prints UPDATE_APPLIED <tag> only when it did;
#                              nothing is printed when up to date and errors
#                              never block startup.
#   python update.py --check   non-intrusive check: prints UPDATE_AVAILABLE
#                              <tag> when a newer release exists, otherwise
#                              nothing. Never downloads.
#   python update.py           full update: download the latest release asset,
#                              extract it, and swap it over the project (keeping
#                              config.json, logs/ and .git).
#
# Uses ONLY the Python standard library, so no extra install is ever needed.
import json
import os
import re
import shutil
import sys
import tempfile
import time
import urllib.request
import zipfile

REPO = "cjl26rg2/Void-Script"
API = f"https://api.github.com/repos/{REPO}/releases/latest"
RELEASES_URL = f"https://github.com/{REPO}/releases"
STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "check_update.json")
# Only hit the API this often in --check mode (start.bat calls it every launch).
CHECK_TTL_SEC = 3600
# Paths that must never be overwritten by a release swap.
PRESERVE = {"config.json", "logs"}
USER_AGENT = "VoidScript-Updater/2.0"


def log(msg):
    print(msg, flush=True)


def norm_tag(tag):
    # "V1.1.0" -> [1, 1, 0]; "2.0.0" -> [2, 0, 0]
    m = re.findall(r"\d+", str(tag))
    return [int(x) for x in m[:3]] + [0] * (3 - len(m))


def is_newer(a, b):
    return norm_tag(a) > norm_tag(b)


def read_installed_version():
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "voidscript-extension", "manifest.json")
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f).get("version", "0.0.0")
    except Exception:
        return "0.0.0"


def read_state():
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"last_check": 0, "last_tag": "", "last_url": ""}


def write_state(state):
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f)
    except Exception:
        pass


def fetch_latest():
    req = urllib.request.Request(API, headers={"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.load(resp)


def latest_release():
    data = fetch_latest()
    tag = data.get("tag_name", "")
    assets = data.get("assets") or []
    url = ""
    for a in assets:
        if a.get("browser_download_url"):
            url = a["browser_download_url"]
            break
    if not url:
        # No uploaded asset -> fall back to the source tarball of the tag.
        url = data.get("tarball_url", "")
    return tag, url, assets


def check_mode():
    now = int(time.time())
    state = read_state()
    installed = read_installed_version()
    # TTL: reuse the last API answer for an hour so repeated start.bat launches
    # are instant and don't burn the anonymous GitHub rate limit.
    if now - state.get("last_check", 0) < CHECK_TTL_SEC and state.get("last_tag"):
        tag = state["last_tag"]
    else:
        try:
            tag, url, _assets = latest_release()
        except Exception:
            # Offline / rate-limited / repo changed: stay silent, never block
            # startup and never print something start.bat would misread as a
            # version bump. Reuse the last known tag (or nothing).
            tag = state.get("last_tag", "")
            url = state.get("last_url", "")
        if tag:
            write_state({"last_check": now, "last_tag": tag, "last_url": url})
    if tag and is_newer(tag, installed):
        log(f"UPDATE_AVAILABLE {tag}")
    return 0


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as resp:
        with open(dest, "wb") as f:
            shutil.copyfileobj(resp, f)


def extract(archive, dest_dir):
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as z:
            z.extractall(dest_dir)
    else:
        # A GitHub tarball fallback (rare: no release asset uploaded).
        import tarfile
        with tarfile.open(archive, "r:*") as t:
            t.extractall(dest_dir)


def move_over(src, dst):
    # Replace dst even if it somehow survived the wipe (e.g. the running
    # start.bat that cmd keeps an open handle on).
    if os.path.exists(dst):
        if os.path.isdir(dst) and not os.path.islink(dst):
            shutil.rmtree(dst, ignore_errors=True)
        else:
            try:
                os.remove(dst)
            except OSError:
                pass
    shutil.move(src, dst)


def perform_swap(tag, url, quiet=False):
    root = os.path.dirname(os.path.abspath(__file__))
    if not quiet:
        log(f"[update] New release {tag}. Downloading...")
    tmp = tempfile.mkdtemp(prefix="vs_update_")
    try:
        archive = os.path.join(tmp, "release.bin")
        download(url, archive)
        if not quiet:
            log("[update] Downloaded. Extracting...")
        extracted = os.path.join(tmp, "extract")
        os.makedirs(extracted, exist_ok=True)
        extract(archive, extracted)
        # The extract may leave a single top-level folder (GitHub tarball style).
        entries = os.listdir(extracted)
        if len(entries) == 1 and os.path.isdir(os.path.join(extracted, entries[0])):
            extracted = os.path.join(extracted, entries[0])
        # Sanity: a real VoidScript release always ships these.
        if not os.path.exists(os.path.join(extracted, "bridge.py")) or not os.path.exists(
            os.path.join(extracted, "voidscript-extension", "manifest.json")
        ):
            if not quiet:
                log("[update] Downloaded file does not look like a VoidScript release. Aborting - nothing was changed.")
            return False
        new_version = "0.0.0"
        try:
            with open(os.path.join(extracted, "voidscript-extension", "manifest.json"), "r", encoding="utf-8") as f:
                new_version = json.load(f).get("version", "0.0.0")
        except Exception:
            pass
        installed = read_installed_version()
        if not is_newer(new_version, installed):
            if not quiet:
                log(f"[update] Extracted release is not newer than installed ({installed}). Aborting.")
            return False

        if not quiet:
            log(f"[update] Swapping files (v{installed} -> v{new_version})...")
        backup = os.path.join(tmp, "preserved")
        os.makedirs(backup, exist_ok=True)
        # Park the things a release must never clobber (user data) plus the
        # updater itself (a release zip might not ship update.py/update.bat).
        park = sorted(PRESERVE | {"update.py", "update.bat"})
        for keep in park:
            src = os.path.join(root, keep)
            if os.path.exists(src):
                shutil.move(src, os.path.join(backup, keep))
        git = os.path.join(root, ".git")
        git_parked = False
        if os.path.exists(git):
            shutil.move(git, os.path.join(backup, ".git"))
            git_parked = True
        # Wipe the project (except what we parked) and move the release in.
        for entry in os.listdir(root):
            p = os.path.join(root, entry)
            if os.path.isdir(p) and not os.path.islink(p):
                shutil.rmtree(p, ignore_errors=True)
            else:
                try:
                    os.remove(p)
                except OSError:
                    pass
        for entry in os.listdir(extracted):
            move_over(os.path.join(extracted, entry), os.path.join(root, entry))
        restore = park[:]
        if git_parked:
            restore.append(".git")
        # Restore parked paths, but only where the new release doesn't already
        # ship its own copy (e.g. a newer update.py must win; user config and
        # logs always win since a release never contains real user data). .git
        # is restored unconditionally when we parked it.
        for keep in restore:
            if not os.path.exists(os.path.join(root, keep)) and os.path.exists(os.path.join(backup, keep)):
                shutil.move(os.path.join(backup, keep), os.path.join(root, keep))
        write_state({"last_check": int(time.time()), "last_tag": tag, "last_url": url})
        if not quiet:
            log(f"[update] Done! Updated to v{new_version}.")
            log("Reload the extension in chrome://extensions, then run start.bat again.")
            if git_parked:
                log("(Local git history preserved - working tree now shows the release as uncommitted changes.)")
        return True
    except Exception as e:
        if not quiet:
            log(f"[update] Update failed: {e}")
        return False
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def auto_mode():
    # Used by start.bat on every launch: a newer GitHub release is downloaded
    # and applied automatically. Silent unless it actually updated (then it
    # prints "UPDATE_APPLIED <tag>"), and it never blocks startup on errors.
    now = int(time.time())
    state = read_state()
    installed = read_installed_version()
    if now - state.get("last_check", 0) < CHECK_TTL_SEC and state.get("last_tag"):
        tag = state.get("last_tag")
        url = state.get("last_url", "")
    else:
        try:
            tag, url, _assets = latest_release()
        except Exception:
            return 0
        if tag:
            write_state({"last_check": now, "last_tag": tag, "last_url": url})
    if not tag or not url or not is_newer(tag, installed):
        return 0
    if perform_swap(tag, url, quiet=True):
        log(f"UPDATE_APPLIED {tag}")
    return 0


def full_mode():
    installed = read_installed_version()
    try:
        tag, url, assets = latest_release()
    except Exception as e:
        log(f"[update] Could not reach GitHub: {e}")
        return 1
    if not url:
        log("[update] Release found but it has no downloadable asset.")
        return 1
    if not is_newer(tag, installed):
        log(f"[update] Already up to date (installed {installed}, latest {tag}).")
        write_state({"last_check": int(time.time()), "last_tag": tag, "last_url": url})
        return 0
    return 0 if perform_swap(tag, url, quiet=False) else 1


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--check":
        return check_mode()
    if len(sys.argv) > 1 and sys.argv[1] == "--auto":
        return auto_mode()
    return full_mode()


if __name__ == "__main__":
    sys.exit(main())
