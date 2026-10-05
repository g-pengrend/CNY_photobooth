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
echo   All ComfyUI processing runs on the remote machine.
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
) else if exist "%~dp0venv\Scripts\activate.bat" (
    set "ENV_CMD=call "%~dp0venv\Scripts\activate.bat""
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
    echo   Tailscale is NOT detected in PATH or standard folders on this PC.
    echo   - If your ComfyUI backend is on a remote machine (e.g. breadnbiscuit),
    echo     Tailscale MUST be installed and CONNECTED on this PC:
    echo     Download: https://tailscale.com/download/windows
    echo   - If both PCs are on the SAME local Wi-Fi, you do not need Tailscale;
    echo     just use the remote PC's local Wi-Fi IP (e.g. 192.168.x.x).
    echo.
) else (
    echo [OK] Tailscale detected. (Make sure it is CONNECTED to the same Tailnet!)
)

:: ---------------------------------------------------------
:: 3. Check Cloudflare Tunnel (cloudflared)
:: ---------------------------------------------------------
set "CLOUDFLARED_FOUND=0"
where cloudflared >nul 2>nul
if %errorlevel%==0 set "CLOUDFLARED_FOUND=1"
if exist "%~dp0dgx_photobooth\cloudflared.exe" set "CLOUDFLARED_FOUND=1"
if exist "%~dp0cloudflared.exe" set "CLOUDFLARED_FOUND=1"

if "!CLOUDFLARED_FOUND!"=="0" (
    echo [REMINDER - CLOUDFLARED]
    echo   Cloudflare Tunnel CLI (cloudflared) is NOT installed or found in PATH!
    echo   * Mobile QR codes for photo downloads will NOT work without it.
    echo   * Quick install (run in PowerShell / CMD):
    echo       winget install --id Cloudflare.cloudflared
    echo     Or download cloudflared-windows-amd64.exe from GitHub, rename to
    echo     cloudflared.exe and place it in this folder.
    echo.
) else (
    echo [OK] Cloudflare Tunnel (cloudflared) is found.
)
echo --------------------------------------------------------
echo.

:: ---------------------------------------------------------
:: 4. Resolve Remote Backend Host / IP
:: ---------------------------------------------------------
set "CACHE_FILE=%~dp0.receiver_address"
set "DEFAULT_HOST=breadnbiscuit"

:: Read cached address if exists
if exist "%CACHE_FILE%" (
    set /p CACHED_VAL=<"%CACHE_FILE%"
    if defined CACHED_VAL set "DEFAULT_HOST=!CACHED_VAL!"
)

echo The currently configured remote backend host is: [!DEFAULT_HOST!]
echo.
echo   Options:
echo     1) Tailscale hostname: breadnbiscuit (Requires Tailscale running on this PC)
echo     2) Tailscale direct IP: 100.x.y.z (Bypasses DNS, recommended if name fails)
echo     3) Local Wi-Fi IP: 192.168.x.x (If both PCs on same router, no Tailscale needed)
echo     4) Localhost: 127.0.0.1 (If ComfyUI is running on THIS PC)
echo.
echo Press ENTER to keep [!DEFAULT_HOST!], or type a new Host/IP:
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
echo ========================================================
echo.

set "DEPLOY_MODE=hybrid"
set "RECEIVER_IP=!REMOTE_HOST!"

echo 1. Starting Frontend server (port 5000)...
start "CNY Photo Booth Kiosk Frontend" cmd /k "set DEPLOY_MODE=hybrid&&set RECEIVER_IP=!REMOTE_HOST!&&!ENV_CMD!&&cd /d %~dp0kiosk_frontend && python app.py"

timeout /t 2 /nobreak >nul

echo 2. Starting Local Receiver (port 5001)...
start "Local Receiver" cmd /k "set DEPLOY_MODE=hybrid&&set RECEIVER_IP=!REMOTE_HOST!&&!ENV_CMD!&&cd /d %~dp0dgx_photobooth && python linux_receiver.py"

timeout /t 2 /nobreak >nul

echo 3. Starting Cloudflare Tunnel...
del /q "%~dp0dgx_photobooth\tunnel.log" 2>nul
start "Cloudflare Tunnel" cmd /k "cd /d %~dp0dgx_photobooth && (where cloudflared >nul 2>nul && cloudflared tunnel --url http://localhost:5001 > tunnel.log 2>&1 || if exist cloudflared.exe (cloudflared.exe tunnel --url http://localhost:5001 > tunnel.log 2>&1) else (echo. && echo ======================================================== && echo [WARNING] cloudflared is NOT installed or found in PATH! && echo Mobile QR codes will NOT generate until cloudflared is installed. && echo Install via: winget install --id Cloudflare.cloudflared && echo Or download cloudflared.exe into this folder. && echo ======================================================== && echo.))"

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
