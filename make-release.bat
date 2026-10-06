@echo off
rem Builds <APP>-<version>.zip for a GitHub release: everything users need
rem (the app exe included), none of the app source (desktop), build output or local data.
rem Attach the zip as the FIRST file on the release - the updater downloads that one.
setlocal
cd /d "%~dp0"

rem The app's name for this release. October is SpookyScript; set it back to
rem VoidScript after Halloween. The app's shortcuts and updates follow either name.
set "APP=SpookyScript"

for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "(Get-Content 'voidscript-extension\manifest.json' -Raw | ConvertFrom-Json).version"`) do set "VER=%%v"
if not defined VER (
  echo Could not read the version from voidscript-extension\manifest.json
  pause
  exit /b 1
)

if not exist "%APP%.exe" (
  echo %APP%.exe is missing. Build it first: cd desktop, npx tauri build --no-bundle,
  echo then copy desktop\src-tauri\target\release\voidscript.exe here as %APP%.exe.
  pause
  exit /b 1
)

set "STAGE=%TEMP%\vs_release\%APP%"
set "OUT=%~dp0%APP%-%VER%.zip"
if exist "%TEMP%\vs_release" rmdir /s /q "%TEMP%\vs_release"
if exist "%OUT%" del /q "%OUT%"

echo Packing %APP% %VER%...
rem Only this release's exe goes in - never an old-named or dev one.
robocopy "%~dp0." "%STAGE%" /E /NFL /NDL /NJH /NJS /NP ^
  /XD .git .kilo desktop website target node_modules gen logs backups __pycache__ ^
  /XF check_update.json config.json *.old *.zip *.pyc *.exe make-release.bat make-release-dev.bat >nul
if errorlevel 8 (
  echo Copy failed.
  pause
  exit /b 1
)
copy /y "%APP%.exe" "%STAGE%\%APP%.exe" >nul

powershell -NoProfile -Command "Compress-Archive -Path '%STAGE%' -DestinationPath '%OUT%' -Force"
rmdir /s /q "%TEMP%\vs_release"
if not exist "%OUT%" (
  echo Zipping failed.
  pause
  exit /b 1
)

echo.
echo Done: %APP%-%VER%.zip
echo Upload it as the first file on the V%VER% GitHub release.
pause
