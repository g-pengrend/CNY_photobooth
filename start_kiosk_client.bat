@echo off
setlocal enabledelayedexpansion
TITLE CNY Photobooth - Kiosk Client (Hybrid Mode)

echo ========================================================
echo   CNY Photobooth - Kiosk Client Mode (Hybrid)
echo   This PC will run:
echo     - Kiosk Frontend (port 5000)
echo     - Local Receiver (port 5001) for local printing
echo     - Cloudflare Tunnel (for mobile QR codes)
echo.
echo   All ComfyUI processing will run on the remote machine.
echo ========================================================
echo.

set "CACHE_FILE=%~dp0.receiver_address"
set "DEFAULT_HOST=breadnbiscuit"

:: Read cached address if exists
if exist "%CACHE_FILE%" (
    set /p CACHED_VAL=<"%CACHE_FILE%"
    set "DEFAULT_HOST=!CACHED_VAL!"
)

echo The current configured remote backend host is: !DEFAULT_HOST!
echo To use a different host or IP (e.g. Tailscale IP), type it below.
echo Otherwise, press ENTER to keep [!DEFAULT_HOST!].
echo.
set /p USER_INPUT="Remote Host/IP: "

if defined USER_INPUT (
    set "REMOTE_HOST=!USER_INPUT!"
) else (
    set "REMOTE_HOST=!DEFAULT_HOST!"
)

:: Save to cache
echo !REMOTE_HOST!> "!CACHE_FILE!"

echo.
echo ========================================================
echo   Connecting Kiosk to Remote Backend: !REMOTE_HOST!
echo   Make sure Tailscale is connected and remote backend is running!
echo ========================================================
echo.

set "DEPLOY_MODE=hybrid"
set "RECEIVER_IP=!REMOTE_HOST!"

echo 1. Starting Frontend server (port 5000)...
start "CNY Photo Booth Kiosk Frontend" cmd /k "set DEPLOY_MODE=hybrid&&set RECEIVER_IP=!REMOTE_HOST!&&call C:\Users\Brandon\anaconda3\Scripts\activate.bat C:\Users\Brandon\anaconda3\envs\comfyui && cd /d %~dp0kiosk_frontend && python app.py"

timeout /t 2 /nobreak >nul

echo 2. Starting Local Receiver (port 5001)...
start "Local Receiver" cmd /k "set DEPLOY_MODE=hybrid&&set RECEIVER_IP=!REMOTE_HOST!&&call C:\Users\Brandon\anaconda3\Scripts\activate.bat C:\Users\Brandon\anaconda3\envs\comfyui && cd /d %~dp0dgx_photobooth && python linux_receiver.py"

timeout /t 2 /nobreak >nul

echo 3. Starting Cloudflare Tunnel...
del /q "%~dp0dgx_photobooth\tunnel.log" 2>nul
start "Cloudflare Tunnel" cmd /k "cd /d %~dp0dgx_photobooth && cloudflared tunnel --url http://localhost:5001 > tunnel.log 2>&1"

timeout /t 3 /nobreak >nul
echo Opening Kiosk Browser (http://localhost:5000)...
start http://localhost:5000

echo.
echo ========================================================
echo   CNY Photobooth Client is running!
echo   - Kiosk Frontend: http://localhost:5000
echo   - Gallery ^& Printing: http://localhost:5001
echo ========================================================
echo.
pause
