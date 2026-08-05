:: SPDX-License-Identifier: GPL-3.0-or-later
:: VoidScript launcher (Windows). Finds a usable Python, makes sure the
:: `websockets` dependency is present, frees the bridge port if a previous run
:: left it held, then runs bridge.py. Written for VoidScript; kept GPL-3.0 as
:: part of the project.
@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title VoidScript Bridge  -  Roblox Studio agent
cd /d "%~dp0"

:: ---- palette ---------------------------------------------------------------
:: 24-bit ANSI (Windows 10 1607+ / 11). ASCII-only art on purpose: colour codes
:: mixed with Unicode box glyphs confuse cmd's parser under chcp 65001.
for /f %%e in ('echo prompt $E ^| cmd') do set "E=%%e"
set "C0=%E%[0m"
set "CB=%E%[1m"
set "CRED=%E%[38;2;255;90;82m"
set "CVIO=%E%[38;2;124;140;255m"
set "CWHT=%E%[38;2;236;236;242m"
set "CDIM=%E%[38;2;120;120;140m"
set "COK=%E%[38;2;52;211;153m"
set "CWARN=%E%[38;2;251;191;36m"

:: ---- config ----------------------------------------------------------------
set "PORT=17613"
if defined VOID_BRIDGE_PORT set "PORT=%VOID_BRIDGE_PORT%"
set "LOGDIR=%~dp0logs"
set "LOG=%LOGDIR%\start.log"
if not exist "%LOGDIR%" md "%LOGDIR%" >nul 2>nul
call :note "==== %DATE% %TIME%  launcher started (port %PORT%) ===="
for /f "delims=" %%v in ('ver') do call :note "%%v"

call :banner

:: ---- 0. sanity: are we actually in the project folder? ---------------------
:: Opening start.bat straight from inside the ZIP extracts it alone to %TEMP%,
:: so bridge.py is missing and Python fails with a confusing error. Catch it.
if not exist "%~dp0bridge.py" (
    call :fail "bridge.py is not next to start.bat."
    echo   You probably ran start.bat from *inside* the ZIP. Extract the whole
    echo   ZIP first ^(right-click the .zip -^> "Extract All..."^), then run
    echo   start.bat from the extracted folder.
    call :note "ABORT: bridge.py missing (launched from inside the ZIP?)."
    call :halt 1
)

:: ---- 1. locate a usable Python --------------------------------------------
echo   %CVIO%[1/3]%C0% %CB%Locating Python...%C0%
set "PY="
call :try_python "py -3"                    && goto :have_python
call :try_python "python"                   && goto :have_python
call :scan_python_dirs                       && goto :have_python

:: none found -> try to install it
call :note "no usable Python on PATH or in the usual install folders."
where winget >nul 2>nul || (
    call :fail "Python is not installed, and winget is unavailable to install it."
    echo   Install Python 3.9+ yourself: https://www.python.org/downloads/
    echo   Tick %CB%"Add python.exe to PATH"%C0% during setup, then rerun start.bat.
    call :note "ABORT: no Python and no winget."
    call :halt 1
)
echo         %CWARN%Not found - installing Python via winget...%C0%
winget install --id Python.Python.3.12 --source winget --accept-package-agreements --accept-source-agreements
call :note "winget install finished (see console for its own result)."
echo         Re-checking...
:: a fresh install does not update THIS window's PATH, so re-scan the folders too
call :try_python "py -3"      && goto :have_python
call :try_python "python"     && goto :have_python
call :scan_python_dirs        && goto :have_python
call :fail "Python still not found after the winget install."
echo   Install it manually from https://www.python.org/downloads/ ^(tick
echo   "Add python.exe to PATH"^) and run start.bat again.
call :note "ABORT: no usable Python even after winget."
call :halt 1

:have_python
for /f "delims=" %%v in ('call %PY% --version 2^>^&1') do set "PYVER=%%v"
echo         %COK%Using%C0% %PY%  %CDIM%(!PYVER!)%C0%
call :note "python: %PY% (!PYVER!)"

:: ---- 2. dependency: websockets --------------------------------------------
echo.
echo   %CVIO%[2/3]%C0% %CB%Checking the websockets library...%C0%
%PY% -c "import websockets" >nul 2>nul
if errorlevel 1 (
    echo         Installing websockets ^(one time only^)...
    %PY% -m pip install --user websockets
    if errorlevel 1 (
        call :fail "Could not install websockets (see pip output above)."
        echo   Usually this is no internet, a firewall/AV blocking pip, or a
        echo   Microsoft Store Python with no working pip. Install from
        echo   https://www.python.org/downloads/ and tick "Add to PATH".
        call :note "ABORT: pip install websockets failed."
        call :halt 1
    )
)
echo         %COK%Ready%C0%
call :note "websockets present."

:: ---- 3. free the port, then run the bridge --------------------------------
echo.
echo   %CVIO%[3/3]%C0% %CB%Starting the bridge...%C0%
call :free_port

call :keepopen
REM Launch the self-made VoidScript bridge (pairs with the voidscript-extension).
call :note "launching bridge.py"
%PY% "%~dp0bridge.py"
set "RC=%errorlevel%"
call :note "bridge.py exited with code %RC%"

echo.
if "%RC%"=="0" (
    echo   %COK%Bridge stopped normally.%C0%
) else (
    echo   %CRED%Bridge stopped with error code %RC%.%C0% Scroll up for the Python
    echo   message and include this whole window in any bug report.
    echo   Log: %LOG%
)
call :halt %RC%


:: ===========================================================================
::  subroutines
:: ===========================================================================

:: :try_python "<command>"  - set PY and return 0 if the command is a real,
:: pip-capable Python 3.9+ (rejects the Microsoft Store stub and old versions).
:try_python
set "_cand=%~1"
where %_cand% >nul 2>nul || exit /b 1
%_cand% -m pip --version >nul 2>nul || exit /b 1
%_cand% -c "import sys; sys.exit(0 if sys.version_info>=(3,9) else 1)" >nul 2>nul || exit /b 1
set "PY=%_cand%"
exit /b 0

:: :scan_python_dirs  - last resort when neither `py` nor `python` resolve
:: (installed without "Add to PATH"). Newest version first; sets PY on success.
:scan_python_dirs
for %%D in ("%LOCALAPPDATA%\Programs\Python" "%ProgramFiles%" "%ProgramFiles(x86)%") do (
    if exist "%%~D" (
        for /f "delims=" %%F in ('dir /b /ad /o-n "%%~D\Python3*" 2^>nul') do (
            if exist "%%~D\%%F\python.exe" (
                call :try_python "%%~D\%%F\python.exe" && exit /b 0
            )
        )
    )
)
exit /b 1

:: :free_port  - if a previous bridge is still holding PORT, replace it. A
:: double-launch is easy to do by accident, and a silent bind failure looks
:: like nothing happened.
:free_port
set "HOLDER="
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :%PORT% ^| findstr LISTENING 2^>nul') do set "HOLDER=%%p"
if not defined HOLDER exit /b 0
echo         %CWARN%A previous bridge (pid !HOLDER!) is on port %PORT% - replacing it.%C0%
call :note "killing leftover bridge pid !HOLDER! on port %PORT%."
taskkill /F /T /PID !HOLDER! >nul 2>nul
timeout /t 1 /nobreak >nul
set "HOLDER="
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :%PORT% ^| findstr LISTENING 2^>nul') do set "HOLDER=%%p"
if defined HOLDER (
    echo         %CWARN%Port %PORT% is still held by pid !HOLDER!.%C0% If the bridge
    echo         fails to start, close that process in Task Manager and retry.
    call :note "WARN: port %PORT% still held by pid !HOLDER! after taskkill."
)
exit /b 0

:banner
echo.
echo   %CRED%    _______%C0%
echo   %CRED%   /\      \%C0%      %CB%%CWHT%VOID%CVIO%SCRIPT%C0%   %CVIO%^</^>%C0%
echo   %CRED%  /  \______\%C0%     %CDIM%AI agent  %CRED%x%CDIM%  ROBLOX STUDIO%C0%
echo   %CRED%  \  /      /%C0%     %CDIM%local bridge%C0%
echo   %CRED%   \/______/%C0%
echo.
echo   %CVIO%==============================================%C0%
echo.
exit /b 0

:keepopen
echo.
echo  %CRED%##############################################################%C0%
echo  %CRED%##%C0%                                                          %CRED%##%C0%
echo  %CRED%##%C0%   %CB%%CWHT%KEEP THIS WINDOW OPEN%C0% %CDIM%-%C0% %CRED%DO NOT CLOSE IT%C0%                %CRED%##%C0%
echo  %CRED%##%C0%                                                          %CRED%##%C0%
echo  %CRED%##%C0%   %CDIM%VoidScript stops the moment this closes. Just%C0%          %CRED%##%C0%
echo  %CRED%##%C0%   %CDIM%minimize it and leave it running in the background.%C0%    %CRED%##%C0%
echo  %CRED%##%C0%                                                          %CRED%##%C0%
echo  %CRED%##############################################################%C0%
echo.
exit /b 0

:fail
echo.
echo   %CRED%ERROR:%C0% %~1
echo.
exit /b 0

:: :note "<text>"  - append a line to the log, best-effort, never blocks.
:: Redirect first so a message that ends in a digit is not misread as a handle.
:note
>>"%LOG%" 2>nul echo(%~1
exit /b 0

:: :halt <code>  - pause so the window stays readable, then exit with <code>.
:halt
echo   Press any key to close.
pause >nul
exit /b %~1
