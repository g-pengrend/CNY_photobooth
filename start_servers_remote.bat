@echo off
TITLE CNY Photobooth - REMOTE MODE (Windows Kiosk)
set DEPLOY_MODE=remote

echo ========================================================
echo   DEPLOY MODE: REMOTE (dual-machine)
echo   This machine runs the photo booth kiosk only.
echo   Linux Receiver should be running on the DGX machine.
echo ========================================================
echo.

echo Starting ComfyUI Server...
start "ComfyUI Server" cmd /k "set DEPLOY_MODE=remote && call C:\Users\Brandon\anaconda3\Scripts\activate.bat C:\Users\Brandon\anaconda3\envs\comfyui && cd /d C:\Users\Brandon\Documents\comfy\ComfyUI && python main.py"

timeout /t 5 /nobreak >nul

echo Starting CNY Photo Booth App...
start "CNY Photo Booth App" cmd /k "set DEPLOY_MODE=remote && call C:\Users\Brandon\anaconda3\Scripts\activate.bat C:\Users\Brandon\anaconda3\envs\comfyui && cd /d C:\Users\Brandon\Desktop\Projects\CNY_photobooth\kiosk_frontend && python app.py"

timeout /t 2 /nobreak >nul
echo Opening Browser...
start http://localhost:5000

echo All servers started in REMOTE mode!
echo (Make sure the Linux receiver is running on the DGX)
pause
