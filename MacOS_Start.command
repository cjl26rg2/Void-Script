#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# VoidScript launcher (macOS / Linux). Double-clickable in Finder (.command so
# Finder runs it instead of opening an editor). Finds Python, makes sure the
# `websockets` dependency is present, frees the bridge port if a stale instance
# is holding it, then runs bridge.py. Windows equivalent: start.bat. Kept
# GPL-3.0 as part of the VoidScript project.
set -u

cd "$(dirname "$0")" || exit 1
SELF="$(pwd)/$(basename "$0")"

PORT="${VOID_BRIDGE_PORT:-17613}"
LOG="logs/start.log"
mkdir -p logs 2>/dev/null

# ---- palette (ANSI truecolor; harmless if the terminal ignores it) ----------
if [ -t 1 ]; then
  R=$'\033[0m'; B=$'\033[1m'
  RED=$'\033[38;2;255;90;82m'; VIO=$'\033[38;2;124;140;255m'
  WHT=$'\033[38;2;236;236;242m'; DIM=$'\033[38;2;120;120;140m'
  OK=$'\033[38;2;52;211;153m';  WARN=$'\033[38;2;251;191;36m'
else
  R=""; B=""; RED=""; VIO=""; WHT=""; DIM=""; OK=""; WARN=""
fi

logline() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >>"$LOG" 2>/dev/null || true; }

hold() {  # a double-clicked .command opens a throwaway window; keep it readable
  echo
  read -n 1 -s -r -p "  Press any key to close this window..."
  echo
  exit "${1:-0}"
}

fail() { echo; echo "  ${RED}ERROR:${R} $1"; echo; }

banner() {
  echo
  echo "  ${RED}    _______${R}"
  echo "  ${RED}   /\\      \\${R}      ${B}${WHT}VOID${VIO}SCRIPT${R}   ${VIO}</>${R}"
  echo "  ${RED}  /  \\______\\${R}     ${DIM}AI agent  ${RED}x${DIM}  ROBLOX STUDIO${R}"
  echo "  ${RED}  \\  /      /${R}     ${DIM}local bridge${R}"
  echo "  ${RED}   \\/______/${R}"
  echo
  echo "  ${VIO}==============================================${R}"
  echo
}

keepopen() {
  echo
  echo "  ${RED}##############################################################${R}"
  echo "  ${RED}##${R}   ${B}${WHT}KEEP THIS WINDOW OPEN${R} ${DIM}-${R} ${RED}DO NOT CLOSE IT${R}                ${RED}##${R}"
  echo "  ${RED}##${R}   ${DIM}VoidScript stops the moment this closes. Just${R}          ${RED}##${R}"
  echo "  ${RED}##${R}   ${DIM}minimize it and leave it running in the background.${R}    ${RED}##${R}"
  echo "  ${RED}##############################################################${R}"
  echo
}

banner
logline "==== launcher started (port $PORT) ===="

# ---- 0. bridge.py must sit next to us --------------------------------------
if [ ! -f bridge.py ]; then
  fail "bridge.py is not next to this launcher."
  echo "  Extract the WHOLE download, then run VoidScript from that folder."
  logline "ABORT: bridge.py missing."
  hold 1
fi

# ---- 1. locate Python 3.9+ with a working pip ------------------------------
echo "  ${VIO}[1/3]${R} ${B}Locating Python 3.9+...${R}"
PY=""
for cand in python3 python; do
  command -v "$cand" >/dev/null 2>&1 || continue
  "$cand" -c 'import sys; sys.exit(0 if sys.version_info >= (3,9) else 1)' >/dev/null 2>&1 || continue
  PY="$cand"; break
done
if [ -z "$PY" ]; then
  fail "Python 3.9 or newer was not found."
  echo "  Install it from https://www.python.org/downloads/ (or on macOS run"
  echo "  ${B}xcode-select --install${R}), then run this again."
  logline "ABORT: no Python 3.9+."
  hold 1
fi
PYVER="$("$PY" --version 2>&1)"
echo "        ${OK}Using${R} $PY  ${DIM}($PYVER)${R}"
logline "python: $PY ($PYVER)"

# ---- 1.5. auto-update (fully automatic) ------------------------------------
# Downloads and applies a newer GitHub release on every launch, then re-executes
# this script so the NEW bridge.py is the one that runs. Silent when nothing is
# newer; offline/API errors are silent too and never block startup.
if [ -f update.py ]; then
  UPAUTO="$("$PY" update.py --auto 2>/dev/null || true)"
  case "$UPAUTO" in
    UPDATE_APPLIED*)
      echo
      echo "  ${OK}UPDATE INSTALLED${R}  $UPAUTO"
      echo "  Reload the extension at chrome://extensions after this restarts."
      logline "auto-update applied: $UPAUTO"
      echo
      echo "  ${VIO}Restarting VoidScript with the new version...${R}"
      exec bash "$SELF"
      ;;
  esac
fi

# ---- 2. dependency: websockets ---------------------------------------------
echo
echo "  ${VIO}[2/3]${R} ${B}Checking the websockets library...${R}"
if ! "$PY" -c 'import websockets' >/dev/null 2>&1; then
  echo "        Installing websockets (one time only)..."
  logline "installing websockets via pip --user."
  if ! "$PY" -m pip install --user websockets >/dev/null 2>&1; then
    # Homebrew / python.org builds mark the env externally managed (PEP 668) and
    # refuse --user. This is the user's own machine and one pure-Python package,
    # so retry allowing it.
    logline "pip --user failed; retrying with --break-system-packages."
    "$PY" -m pip install --user --break-system-packages websockets >/dev/null 2>&1 || true
  fi
  if ! "$PY" -c 'import websockets' >/dev/null 2>&1; then
    fail "Could not install the 'websockets' library automatically."
    echo "  Install it yourself, then run this again:"
    echo "      ${B}$PY -m pip install --user websockets${R}"
    logline "ABORT: websockets install failed."
    hold 1
  fi
fi
echo "        ${OK}Ready${R}"
logline "websockets present."

# ---- 3. free the port, then run the bridge ---------------------------------
echo
echo "  ${VIO}[3/3]${R} ${B}Starting the bridge...${R}"
if command -v lsof >/dev/null 2>&1; then
  STALE="$(lsof -ti "tcp:$PORT" -s TCP:LISTEN 2>/dev/null | head -n1)"
  if [ -n "${STALE:-}" ]; then
    echo "        ${WARN}A previous bridge (pid $STALE) is on port $PORT - replacing it.${R}"
    logline "killing stale bridge pid $STALE on port $PORT."
    kill -TERM "$STALE" 2>/dev/null || true
    sleep 1
    if kill -0 "$STALE" 2>/dev/null; then kill -9 "$STALE" 2>/dev/null || true; sleep 1; fi
  fi
fi

keepopen
logline "launching bridge.py"
"$PY" bridge.py
RC=$?
logline "bridge.py exited with code $RC"

echo
if [ "$RC" -ne 0 ]; then
  echo "  ${RED}Bridge stopped with error code $RC.${R} Scroll up for the Python"
  echo "  message and include this whole window in any bug report (logs/start.log)."
else
  echo "  ${OK}Bridge stopped normally.${R}"
fi
hold "$RC"
