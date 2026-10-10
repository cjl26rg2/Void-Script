:: SPDX-License-Identifier: GPL-3.0-or-later
:: VoidScript2 launcher (Windows). Finds a usable Python, makes sure the
:: `websockets` library is there, then runs bridge.py. It never downloads or
:: runs an installer by itself, and only updates when you say yes.
@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

:: ---- look ------------------------------------------------------------------
:: 24-bit colour (Windows 10 1607+ / 11). The art is plain ASCII on purpose:
:: colour codes mixed with Unicode glyphs confuse cmd's parser under chcp 65001.
for /f %%e in ('echo prompt $E ^| cmd') do set "E=%%e"
set "C0=%E%[0m"
set "CB=%E%[1m"
set "CACC=%E%[38;2;255;122;61m"
set "CACC2=%E%[38;2;255;179;107m"
set "CWHT=%E%[38;2;240;240;245m"
set "CDIM=%E%[38;2;125;126;140m"
set "COK=%E%[38;2;63;207;142m"
set "CWARN=%E%[38;2;240;180;64m"
set "CRED=%E%[38;2;242;99;122m"
:: The Halloween release ships SpookyScript.exe - wear its colours and name too.
set "NAME=VoidScript"
if exist "%~dp0SpookyScript.exe" (
    set "NAME=SpookyScript"
    set "CACC=%E%[38;2;255;140;40m"
    set "CACC2=%E%[38;2;190;130;255m"
)
title %NAME%2 bridge  -  keep this window open
if not defined VS_GUI mode con: cols=100 lines=34 >nul 2>nul

:: ---- config ----------------------------------------------------------------
set "PORT=17613"
if defined VS_BRIDGE_PORT set "PORT=%VS_BRIDGE_PORT%"
set "LOGDIR=%~dp0logs"
set "LOG=%LOGDIR%\start.log"
if not exist "%LOGDIR%" md "%LOGDIR%" >nul 2>nul
call :note "==== %DATE% %TIME%  launcher started (port %PORT%) ===="
for /f "delims=" %%v in ('ver') do call :note "%%v"

:: The banner is for the console; the app has its own screens.
if not defined VS_GUI (
    if "%NAME%"=="SpookyScript" (call :banner_spooky) else (call :banner_void)
    echo   %CDIM%AI that builds in Roblox Studio  -  local bridge%C0%
    echo.
)

:: ---- 0. are we in the project folder? --------------------------------------
:: Opening start.bat straight from inside the ZIP extracts it alone to %TEMP%,
:: so bridge.py is missing and Python fails with a confusing error. Catch it.
if not exist "%~dp0bridge.py" (
    call :fail "bridge.py isn't next to start.bat." "You probably opened start.bat from inside the ZIP. Right-click the ZIP," "choose Extract All, then run start.bat from the extracted folder."
    call :note "ABORT: bridge.py missing (launched from inside the ZIP?)."
    call :halt 1 & exit /b 1
)

:: ---- 1. Python -------------------------------------------------------------
call :step 1 "Python"
set "PY="
call :try_python "py -3"                    && goto :have_python
call :try_python "python"                   && goto :have_python
call :scan_python_dirs                       && goto :have_python

:: None found. VoidScript never downloads or runs installers by itself - you
:: install Python, then start it again. Exit code 3 tells the VoidScript app to
:: show its "Python needed" help instead of a generic error.
call :note "no usable Python on PATH or in the usual install folders."
call :fail "Python isn't installed." "VoidScript needs Python 3.9 or newer. Get it from https://www.python.org/downloads/" "and tick 'Add python.exe to PATH' - or run:  winget install Python.Python.3.12"
call :halt 3 & exit /b 3

:have_python
for /f "delims=" %%v in ('call %PY% --version 2^>^&1') do set "PYVER=%%v"
call :ok "!PYVER!" "%PY%"
call :note "python: %PY% (!PYVER!)"
set "VER="
for /f "delims=" %%v in ('call %PY% -c "import json;print(json.load(open(r'%~dp0voidscript-extension\manifest.json',encoding='utf-8'))['version'])" 2^>nul') do set "VER=%%v"

:: ---- 1.5. updates (only when you say yes) ----------------------------------
:: Under the VoidScript app, updates are the app's job: it asks first, on its
:: Updates page. Run by hand, we look first and only install when you say yes.
:: The restart window runs with --skip-update so it never updates twice.
if "%~1"=="--skip-update" set "SKIP_UPDATE=1"
if defined VS_GUI set "SKIP_UPDATE=1"
if not defined SKIP_UPDATE if exist "%~dp0update.py" (
    set "UPCHK="
    for /f "delims=" %%u in ('call %PY% "%~dp0update.py" --check 2^>nul') do set "UPCHK=%%u"
    if /i "!UPCHK:~0,16!"=="UPDATE_AVAILABLE" (
        echo.
        echo   %CACC%%CB%  NEW  %C0%  %CWHT%A new %NAME% is out:%C0% %CB%!UPCHK:~17!%C0%
        choice /c YN /n /t 20 /d N /m "         Install it now? [Y/N - no after 20 seconds] "
        if errorlevel 2 set "SKIP_UPDATE=1"
    ) else set "SKIP_UPDATE=1"
)
if not defined SKIP_UPDATE (
    if exist "%~dp0update.py" (
        for /f "delims=" %%u in ('call %PY% "%~dp0update.py" --auto 2^>nul') do set "UPAUTO=%%u"
        if defined UPAUTO (
            if /i "!UPAUTO:~0,14!"=="UPDATE_APPLIED" (
                echo.
                echo   %COK%%CB%  UPDATED  %C0%  !UPAUTO:~15!  %CDIM%- reload the extension at chrome://extensions after this restarts%C0%
                call :note "auto-update applied: !UPAUTO!"
                echo   %CDIM%Restarting with the new version...%C0%
                :: Restart-loop guard: if the new window somehow updates again,
                :: stop after 3 restarts instead of opening windows forever.
                set "RESTART_COUNT=0"
                if exist "%TEMP%\vs_restart_count" set /p RESTART_COUNT=<"%TEMP%\vs_restart_count"
                set /a RESTART_COUNT+=1
                > "%TEMP%\vs_restart_count" echo !RESTART_COUNT!
                if !RESTART_COUNT! GTR 3 (
                    del "%TEMP%\vs_restart_count" >nul 2>nul
                    call :fail "The update kept restarting (!RESTART_COUNT! times), so it stopped." "Run start.bat again in a minute, or check the releases on GitHub."
                    call :note "ABORT: update restart loop detected (!RESTART_COUNT! restarts)."
                    if not defined VS_GUI pause >nul
                    exit /b 1
                )
                rem Under the app, exit code 99 means "update installed" and the app relaunches.
                if defined VS_GUI exit /b 99
                start "%NAME% update" /d "%~dp0" cmd /c ""%~f0" --skip-update"
                exit /b 0
            )
        )
    )
)
:: A normal launch clears the restart counter, so the next one starts from zero.
del "%TEMP%\vs_restart_count" >nul 2>nul

:: ---- 2. websockets ---------------------------------------------------------
call :step 2 "Libraries"
%PY% -c "import websockets" >nul 2>nul
if errorlevel 1 (
    echo          %CDIM%installing websockets ^(one time only^)...%C0%
    %PY% -m pip install --user websockets
    if errorlevel 1 (
        call :fail "Couldn't install the websockets library (see pip above)." "Usually: no internet, a firewall blocking pip, or the Microsoft Store Python." "Install Python from https://www.python.org/downloads/ and tick 'Add to PATH'."
        call :note "ABORT: pip install websockets failed."
        call :halt 1 & exit /b 1
    )
)
call :ok "websockets" ""
call :note "websockets present."

:: ---- 3. run the bridge -----------------------------------------------------
call :step 3 "Bridge"
call :ok "starting on port %PORT%" ""
if not defined VS_GUI call :ready
call :note "launching bridge.py"
%PY% "%~dp0bridge.py"
set "RC=%errorlevel%"
call :note "bridge.py exited with code %RC%"

echo.
if "%RC%"=="0" (
    echo   %COK%%CB%  STOPPED  %C0%  %CDIM%The bridge stopped normally.%C0%
) else (
    call :fail "The bridge stopped with error code %RC%." "Scroll up for the Python message and include this whole window in a bug report." "Log: %LOG%"
)
call :halt %RC% & exit /b %RC%


:: ===========================================================================
::  helpers
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

:: :step <n> "<name>"  - a step header with a progress bar
:step
set "_bar=#####-----"
if "%~1"=="2" set "_bar=##########-----"
if "%~1"=="3" set "_bar=###############"
if "%~1"=="1" set "_bar=#####----------"
echo   %CACC%%CB%[%~1/3]%C0%  %CWHT%%CB%%~2%C0%   %CACC2%!_bar!%C0%
exit /b 0

:: :ok "<what>" "<detail>"
:ok
echo          %COK%ok%C0%  %CWHT%%~1%C0%  %CDIM%%~2%C0%
exit /b 0

:: :fail "<headline>" ["<line>" ...]  - a red panel, up to three extra lines
:fail
echo.
echo   %CRED%%CB%  PROBLEM  %C0%  %CWHT%%CB%%~1%C0%
if not "%~2"=="" echo   %CRED%^|%C0%  %~2
if not "%~3"=="" echo   %CRED%^|%C0%  %~3
if not "%~4"=="" echo   %CRED%^|%C0%  %~4
echo.
exit /b 0

:ready
echo.
echo   %CACC%==========================================================================%C0%
echo   %COK%%CB%  READY  %C0%  %CWHT%%CB%%NAME%2 %VER%%C0%  %CDIM%bridge on port %PORT%%C0%
echo.
echo   %CACC%^|%C0%  %CWHT%Keep this window open%C0% %CDIM%- minimise it. Closing it stops %NAME%.%C0%
echo   %CACC%^|%C0%  %CDIM%Next: open Roblox Studio, then your AI site, and press%C0% %CWHT%Start%C0%%CDIM%.%C0%
echo   %CACC%^|%C0%  %CDIM%Help and updates: https://voidscript.dev%C0%
echo   %CACC%==========================================================================%C0%
echo.
exit /b 0

:: :note "<text>"  - append a line to the log, best-effort, never blocks.
:: Redirect first so a message that ends in a digit is not misread as a handle.
:note
>>"%LOG%" 2>nul echo(%~1
exit /b 0

:: :halt <code>  - pause so the window stays readable, then exit with <code>.
:halt
rem Under the app (VS_GUI) there's no console to press a key in; the app shows
rem the error and its own close button instead.
if defined VS_GUI exit /b %~1
echo   %CDIM%Press any key to close.%C0%
pause >nul
exit /b %~1

:banner_void
echo.
echo  %E%[38;2;255;122;61m __     __    _     _  ____            _       _   %E%[38;2;255;179;107m ___ %C0%
echo  %E%[38;2;252;115;73m \ \   / /__ (_) __^| ^|/ ___^|  ___ _ __(_)_ __ ^| ^|_ %E%[38;2;255;179;107m^|_  )%C0%
echo  %E%[38;2;250;107;85m  \ \ / / _ \^| ^|/ _` ^|\___ \ / __^| '__^| ^| '_ \^| __^|%E%[38;2;255;179;107m / / %C0%
echo  %E%[38;2;247;100;98m   \ V / (_) ^| ^| (_^| ^| ___) ^| (__^| ^|  ^| ^| ^|_) ^| ^|_ %E%[38;2;255;179;107m/___^|%C0%
echo  %E%[38;2;245;92;110m    \_/ \___/^|_^|\__,_^|^|____/ \___^|_^|  ^|_^| .__/ \__^|%E%[38;2;255;179;107m     %C0%
echo  %E%[38;2;242;85;122m                                        ^|_^|        %E%[38;2;255;179;107m     %C0%
exit /b 0

:banner_spooky
echo.
echo  %E%[38;2;255;140;40m  ____                    _          ____            _       _   %E%[38;2;255;179;107m ___ %C0%
echo  %E%[38;2;238;129;81m / ___^| _ __   ___   ___ ^| ^| ___   _/ ___^|  ___ _ __(_)_ __ ^| ^|_ %E%[38;2;255;179;107m^|_  )%C0%
echo  %E%[38;2;220;118;123m \___ \^| '_ \ / _ \ / _ \^| ^|/ / ^| ^| \___ \ / __^| '__^| ^| '_ \^| __^|%E%[38;2;255;179;107m / / %C0%
echo  %E%[38;2;203;107;164m  ___) ^| ^|_) ^| (_) ^| (_) ^|   ^<^| ^|_^| ^|___) ^| (__^| ^|  ^| ^| ^|_) ^| ^|_ %E%[38;2;255;179;107m/___^|%C0%
echo  %E%[38;2;185;96;206m ^|____/^| .__/ \___/ \___/^|_^|\_\\__, ^|____/ \___^|_^|  ^|_^| .__/ \__^|%E%[38;2;255;179;107m     %C0%
echo  %E%[38;2;168;85;247m       ^|_^|                     ^|___/                  ^|_^|        %E%[38;2;255;179;107m     %C0%
exit /b 0
