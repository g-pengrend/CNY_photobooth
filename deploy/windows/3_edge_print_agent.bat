@echo off
TITLE Photobooth Edge Print Agent (Domain Hosted Mode)

cd /d "%~dp0..\.."

echo ========================================================
echo   PHOTOBOOTH EDGE PRINT AGENT (Windows)
echo.
echo   Use this when accessing Photobooth via a Domain Name
echo   or remote server. This script catches print jobs from
echo   the cloud and sends them directly to your USB printer.
echo   (No Tailscale needed if using public domain!)
echo ========================================================
echo.

set "DEFAULT_URL=https://photobooth.mydomain.edu.sg"
if exist ".print_server_address" (
    set /p CACHED_URL=<".print_server_address"
    if defined CACHED_URL set "DEFAULT_URL=!CACHED_URL!"
)

echo Target Server URL: [!DEFAULT_URL!]
echo Press ENTER to keep, or enter the Photobooth Server URL
echo (e.g. https://photobooth.mydomain.edu.sg or http://100.x.y.z:5000):
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
