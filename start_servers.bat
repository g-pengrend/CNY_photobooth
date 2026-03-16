@echo off
TITLE CNY Photobooth - LOCAL MODE
set DEPLOY_MODE=local

echo ========================================================
echo   DEPLOY MODE: LOCAL (single machine testing)
echo   All services will run on this Windows machine.
echo ========================================================
echo.

echo Starting ComfyUI Server...
start "ComfyUI Server" cmd /k "set DEPLOY_MODE=local && call C:\Users\Brandon\anaconda3\Scripts\activate.bat C:\Users\Brandon\anaconda3\envs\comfyui && cd /d C:\Users\Brandon\Documents\comfy\ComfyUI && python main.py"

timeout /t 5 /nobreak >nul

echo Starting CNY Photo Booth App...
start "CNY Photo Booth App" cmd /k "set DEPLOY_MODE=local && call C:\Users\Brandon\anaconda3\Scripts\activate.bat C:\Users\Brandon\anaconda3\envs\comfyui && cd /d C:\Users\Brandon\Desktop\Projects\CNY_photobooth\kiosk_frontend && python app.py"

timeout /t 2 /nobreak >nul

echo Starting Linux Receiver (local mode)...
start "Linux Receiver (Local)" cmd /k "set DEPLOY_MODE=local && call C:\Users\Brandon\anaconda3\Scripts\activate.bat C:\Users\Brandon\anaconda3\envs\comfyui && cd /d C:\Users\Brandon\Desktop\Projects\CNY_photobooth\dgx_photobooth && python linux_receiver.py"

timeout /t 2 /nobreak >nul

echo Starting Cloudflare Tunnel...
del /q "C:\Users\Brandon\Desktop\Projects\CNY_photobooth\dgx_photobooth\tunnel.log" 2>nul
start "Cloudflare Tunnel" cmd /k "cd /d C:\Users\Brandon\Desktop\Projects\CNY_photobooth\dgx_photobooth && cloudflared tunnel --url http://localhost:5001 > tunnel.log 2>&1"

timeout /t 2 /nobreak >nul
echo Opening Browser...
start http://localhost:5000

echo All servers started in LOCAL mode!
pause
