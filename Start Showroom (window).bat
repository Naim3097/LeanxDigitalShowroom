@echo off
rem  Leanx Showroom - opens in a normal browser window (for checking and editing).
rem  Pass a URL to open a deployed copy instead of the local one.
cd /d "%~dp0"
set PORT=8765
set URL=%~1
if "%URL%"=="" (
  set URL=http://localhost:%PORT%/
  start "Leanx Showroom server" /min cmd /c "node tools\serve.mjs %PORT%"
  timeout /t 2 /nobreak >nul
)
start "" "%URL%"
