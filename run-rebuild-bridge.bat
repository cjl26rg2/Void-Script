:: SPDX-License-Identifier: GPL-3.0-or-later
:: Double-click launcher for the rebuilt (self-made) VoidScript bridge.
:: Runs rebuild\bridge.py from the repo root and keeps the window open.
@echo off
title VoidScript Bridge (rebuild)
cd /d "%~dp0"

echo   Starting the rebuilt VoidScript bridge...
echo   Keep this window OPEN. Press Ctrl+C to stop.
echo.

where py >nul 2>nul && ( py rebuild\bridge.py ) || ( python rebuild\bridge.py )

echo.
echo   Bridge stopped. Press any key to close.
pause >nul
