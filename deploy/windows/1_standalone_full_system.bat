@echo off
TITLE CNY Photobooth - FULL WINDOWS SETUP (Local Standalone Mode)
set DEPLOY_MODE=local
cd /d "%~dp0..\.."

echo ========================================================
echo   DEPLOY MODE: LOCAL (Full Windows Standalone Setup)
echo   All services run on this single Windows machine:
echo     - ComfyUI Server (Port 8188)
echo     - Kiosk Frontend (Port 5000)
echo     - Local Receiver (Port 5001)
echo     - Cloudflare Tunnel (Mobile QR Codes)
echo ========================================================
echo.

echo Starting ComfyUI Server...
start "ComfyUI Server" cmd /k "set DEPLOY_MODE=local && call C:\Users\Brandon\anaconda3\Scripts\activate.bat C:\Users\Brandon\anaconda3\envs\comfyui && cd /d C:\Users\Brandon\Documents\comfy\ComfyUI && python main.py"

timeout /t 5 /nobreak >nul

echo Starting CNY Photo Booth Frontend...
start "CNY Photo Booth Frontend" cmd /k "set DEPLOY_MODE=local && call C:\Users\Brandon\anaconda3\Scripts\activate.bat C:\Users\Brandon\anaconda3\envs\comfyui && cd /d "%~dp0..\..\kiosk_frontend" && python app.py"

timeout /t 2 /nobreak >nul

echo Starting Local Receiver...
start "Local Receiver" cmd /k "set DEPLOY_MODE=local && call C:\Users\Brandon\anaconda3\Scripts\activate.bat C:\Users\Brandon\anaconda3\envs\comfyui && cd /d "%~dp0..\..\dgx_photobooth" && python linux_receiver.py"

timeout /t 2 /nobreak >nul

echo Starting Cloudflare Tunnel...
del /q "%~dp0..\..\dgx_photobooth\tunnel.log" 2>nul
start "Cloudflare Tunnel" cmd /k "cd /d "%~dp0..\..\dgx_photobooth" && cloudflared tunnel --url http://localhost:5001 > tunnel.log 2>&1"

timeout /t 2 /nobreak >nul
echo Opening Browser...
start http://localhost:5000

echo All servers started in LOCAL standalone mode!
pause
