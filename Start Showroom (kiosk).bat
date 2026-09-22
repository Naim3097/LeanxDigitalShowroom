@echo off
rem ------------------------------------------------------------------
rem  Leanx Showroom - exhibition launcher
rem  Opens the showroom full screen (kiosk mode) on this machine.
rem
rem    Start Showroom (kiosk).bat
rem        runs the local copy: starts the local server, opens localhost
rem
rem    Start Showroom (kiosk).bat https://showroom.leanxdigital.io
rem        runs the deployed copy: no local server, opens that address
rem
rem  Press Alt+F4 to close Chrome when the day is over.
rem ------------------------------------------------------------------
cd /d "%~dp0"
set PORT=8765
set URL=%~1

if "%URL%"=="" (
  set URL=http://localhost:%PORT%/
  start "Leanx Showroom server" /min cmd /c "node tools\serve.mjs %PORT%"
  timeout /t 2 /nobreak >nul
)

set CHROME=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if "%CHROME%"=="" if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set CHROME=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if "%CHROME%"=="" (
  echo Chrome or Edge not found. Open %URL% in a browser and press F for fullscreen.
  pause
  exit /b
)

rem The profile lives in a stable folder, not TEMP, so a sign-in inside a
rem project (for example DISCOVA) survives a restart of the kiosk.
set PROFILE=%LOCALAPPDATA%\LeanxShowroom\chrome-profile

"%CHROME%" --kiosk --no-first-run --no-default-browser-check --noerrdialogs --disable-pinch --overscroll-history-navigation=0 --disable-session-crashed-bubble --disable-infobars --disable-translate --autoplay-policy=no-user-gesture-required --touch-events=enabled --check-for-update-interval=31536000 --user-data-dir="%PROFILE%" "%URL%"
