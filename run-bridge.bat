:: SPDX-License-Identifier: GPL-3.0-or-later
:: Double-click launcher for the VoidScript bridge.
:: Runs bridge.py from the repo root and keeps the window open.
@echo off
title VoidScript Bridge
cd /d "%~dp0"

echo   Starting the VoidScript bridge...
echo   Keep this window OPEN. Press Ctrl+C to stop.
echo.

where py >nul 2>nul && ( py bridge.py ) || ( python bridge.py )

echo.
echo   Bridge stopped. Press any key to close.
pause >nul
