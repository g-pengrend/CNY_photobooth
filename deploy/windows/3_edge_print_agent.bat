@echo off
setlocal enabledelayedexpansion
TITLE Photobooth Edge Print Agent (Domain & Tailscale Mode)

cd /d "%~dp0..\.."

echo ========================================================
echo   PHOTOBOOTH EDGE PRINT AGENT (Windows)
echo.
echo   Connects to Domain Name, Tailscale IP, or Localhost.
echo   Listens for print jobs and prints directly to your
echo   physical USB photo printer with zero browser popups.
echo ========================================================
echo.

set "DEFAULT_URL=http://100.67.79.127:5000"
if exist ".print_server_address" (
    set /p CACHED_URL=<".print_server_address"
    if defined CACHED_URL set "DEFAULT_URL=!CACHED_URL!"
)

echo Target Server URL: [!DEFAULT_URL!]
echo Press ENTER to keep, or enter the Photobooth Server URL
echo (e.g. http://100.67.79.127:5000, http://breadnbiscuit:5000, or domain):
set /p USER_SERVER="Server URL: "

if defined USER_SERVER (
    set "SERVER_URL=!USER_SERVER!"
) else (
    set "SERVER_URL=!DEFAULT_URL!"
)

echo !SERVER_URL!> ".print_server_address"

echo.
echo Connecting Print Agent to: !SERVER_URL!
echo Make sure your physical photo printer is powered on and set as default!
echo.
python print_agent.py --server "!SERVER_URL!"

pause
