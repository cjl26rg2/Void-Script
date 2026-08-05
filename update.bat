:: SPDX-License-Identifier: GPL-3.0-or-later
:: VoidScript updater (Windows). Double-click to check for and apply the latest
:: GitHub release. Finds a usable Python (same logic as start.bat), runs
:: update.py, then pauses so you can read the result.
@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title VoidScript Updater
cd /d "%~dp0"

:: ---- palette ---------------------------------------------------------------
for /f %%e in ('echo prompt $E ^| cmd') do set "E=%%e"
set "C0=%E%[0m"
set "CB=%E%[1m"
set "CRED=%E%[38;2;255;90;82m"
set "CVIO=%E%[38;2;124;140;255m"
set "CWHT=%E%[38;2;236;236;242m"
set "CDIM=%E%[38;2;120;120;140m"
set "COK=%E%[38;2;52;211;153m"
set "CWARN=%E%[38;2;251;191;36m"

echo.
echo   %CVIO%==============================================%C0%
echo   %CB%%CWHT%VOID%CVIO%SCRIPT%C0%  %CDIM%auto-updater%C0%
echo   %CVIO%==============================================%C0%
echo.

:: ---- 0. sanity -------------------------------------------------------------
if not exist "%~dp0update.py" (
    echo   %CRED%ERROR:%C0% update.py is not next to update.bat.
    echo   You probably ran this from *inside* the ZIP. Extract the whole ZIP
    echo   first, then run update.bat from the extracted folder.
    goto :halt1
)

:: ---- 1. locate a usable Python --------------------------------------------
set "PY="
call :try_python "py -3"                    && goto :have_python
call :try_python "python"                   && goto :have_python
call :scan_python_dirs                       && goto :have_python

echo   %CRED%ERROR:%C0% Python 3.9+ was not found.
echo   Install it from https://www.python.org/downloads/ ^(tick
echo   "Add python.exe to PATH"^), or just run start.bat which handles it.
goto :halt1

:have_python
echo   %CDIM%Using %PY%%C0%
echo.
%PY% "%~dp0update.py"
set "RC=%errorlevel%"
echo.
echo   Press any key to close.
pause >nul
exit /b %RC%

:halt1
echo   Press any key to close.
pause >nul
exit /b 1

:: :try_python "<command>" - set PY if the command is a real pip-capable Py3.9+.
:try_python
set "_cand=%~1"
where %_cand% >nul 2>nul || exit /b 1
%_cand% -m pip --version >nul 2>nul || exit /b 1
%_cand% -c "import sys; sys.exit(0 if sys.version_info>=(3,9) else 1)" >nul 2>nul || exit /b 1
set "PY=%_cand%"
exit /b 0

:: :scan_python_dirs - last resort when neither `py` nor `python` resolve.
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