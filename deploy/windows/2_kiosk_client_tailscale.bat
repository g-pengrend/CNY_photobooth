@echo off
setlocal enabledelayedexpansion
TITLE CNY Photobooth - Windows Kiosk Client (Tailscale / Remote Mode)

cd /d "%~dp0..\.."

echo ========================================================
echo   CNY Photobooth - Kiosk Client Mode (Hybrid / Remote)
echo   This PC will run:
echo     - Kiosk Frontend (port 5000)
echo     - Local Receiver (port 5001) for direct local USB printing
echo     - Cloudflare Tunnel (for mobile QR codes)
echo.
echo   All ComfyUI processing runs on the remote DGX machine.
echo ========================================================
echo.

:: ---------------------------------------------------------
:: 1. Check Python / Conda environment
:: ---------------------------------------------------------
set "ENV_CMD="
if exist "%USERPROFILE%\anaconda3\Scripts\activate.bat" (
    set "ENV_CMD=call "%USERPROFILE%\anaconda3\Scripts\activate.bat" comfyui"
) else if exist "%USERPROFILE%\miniconda3\Scripts\activate.bat" (
    set "ENV_CMD=call "%USERPROFILE%\miniconda3\Scripts\activate.bat" comfyui"
) else if exist "C:\ProgramData\anaconda3\Scripts\activate.bat" (
    set "ENV_CMD=call "C:\ProgramData\anaconda3\Scripts\activate.bat" comfyui"
) else if exist "C:\ProgramData\miniconda3\Scripts\activate.bat" (
    set "ENV_CMD=call "C:\ProgramData\miniconda3\Scripts\activate.bat" comfyui"
) else if exist "%~dp0..\..\venv\Scripts\activate.bat" (
    set "ENV_CMD=call "%~dp0..\..\venv\Scripts\activate.bat""
) else if exist "C:\Users\Brandon\anaconda3\Scripts\activate.bat" (
    set "ENV_CMD=call "C:\Users\Brandon\anaconda3\Scripts\activate.bat" comfyui"
) else (
    set "ENV_CMD=call conda activate comfyui 2>nul || ver >nul"
)

:: ---------------------------------------------------------
:: 2. Check Tailscale Installation / Status
:: ---------------------------------------------------------
set "TAILSCALE_FOUND=0"
where tailscale >nul 2>nul
if %errorlevel%==0 set "TAILSCALE_FOUND=1"
if exist "%ProgramFiles%\Tailscale\tailscale.exe" set "TAILSCALE_FOUND=1"
if exist "%LOCALAPPDATA%\Tailscale\tailscale.exe" set "TAILSCALE_FOUND=1"

if "!TAILSCALE_FOUND!"=="0" (
    echo [REMINDER - TAILSCALE]
    echo   Tailscale is NOT detected in standard folders on this PC.
    echo   - If your ComfyUI backend is on a remote DGX (e.g. breadnbiscuit),
    echo     make sure Tailscale is connected, or use local Wi-Fi IP.
    echo.
) else (
    echo [OK] Tailscale detected.
)

:: ---------------------------------------------------------
:: 3. Check Cloudflare Tunnel (cloudflared)
:: ---------------------------------------------------------
set "CLOUDFLARED_FOUND=0"
where cloudflared >nul 2>nul
if %errorlevel%==0 set "CLOUDFLARED_FOUND=1"
if exist "%~dp0..\..\dgx_photobooth\cloudflared.exe" set "CLOUDFLARED_FOUND=1"
if exist "%~dp0..\..\cloudflared.exe" set "CLOUDFLARED_FOUND=1"

if "!CLOUDFLARED_FOUND!"=="0" (
    echo [REMINDER - CLOUDFLARED]
    echo   Cloudflare Tunnel CLI (cloudflared) not found in PATH.
    echo   Mobile QR code photo downloads require cloudflared.
    echo.
) else (
    echo [OK] Cloudflare Tunnel (cloudflared) is found.
)
echo --------------------------------------------------------
echo.

:: ---------------------------------------------------------
:: 4. Resolve Remote Backend Host / IP
:: ---------------------------------------------------------
set "CACHE_FILE=%~dp0..\..\.receiver_address"
set "DEFAULT_HOST=breadnbiscuit"

if exist "%CACHE_FILE%" (
    set /p CACHED_VAL=<"%CACHE_FILE%"
    if defined CACHED_VAL set "DEFAULT_HOST=!CACHED_VAL!"
)

echo The currently configured remote backend host is: [!DEFAULT_HOST!]
echo.
echo   Options:
echo     1) Tailscale hostname: breadnbiscuit
echo     2) Tailscale direct IP: 100.x.y.z
echo     3) Local Wi-Fi IP: 192.168.x.x
echo     4) Localhost: 127.0.0.1
echo.
echo Press ENTER to keep [!DEFAULT_HOST!], or type a new Host/IP:
set /p USER_INPUT="Remote Host/IP: "

if defined USER_INPUT (
    set "REMOTE_HOST=!USER_INPUT!"
) else (
    set "REMOTE_HOST=!DEFAULT_HOST!"
)

echo !REMOTE_HOST!> "!CACHE_FILE!"

echo.
echo ========================================================
echo   Connecting Kiosk to Remote Backend: !REMOTE_HOST!
echo ========================================================
echo.

set "DEPLOY_MODE=hybrid"
set "RECEIVER_IP=!REMOTE_HOST!"

echo 1. Starting Frontend server (port 5000)...
start "CNY Photo Booth Kiosk Frontend" cmd /k "set DEPLOY_MODE=hybrid&&set RECEIVER_IP=!REMOTE_HOST!&&!ENV_CMD!&&cd /d "%~dp0..\..\kiosk_frontend" && python app.py"

timeout /t 2 /nobreak >nul

echo 2. Starting Local Receiver (port 5001)...
start "Local Receiver" cmd /k "set DEPLOY_MODE=hybrid&&set RECEIVER_IP=!REMOTE_HOST!&&!ENV_CMD!&&cd /d "%~dp0..\..\dgx_photobooth" && python linux_receiver.py"

timeout /t 2 /nobreak >nul

echo 3. Starting Cloudflare Tunnel...
del /q "%~dp0..\..\dgx_photobooth\tunnel.log" 2>nul
start "Cloudflare Tunnel" cmd /k "cd /d "%~dp0..\..\dgx_photobooth" && (where cloudflared >nul 2>nul && cloudflared tunnel --url http://localhost:5001 > tunnel.log 2>&1 || if exist cloudflared.exe (cloudflared.exe tunnel --url http://localhost:5001 > tunnel.log 2>&1) else (echo Cloudflare tunnel optional))"

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
