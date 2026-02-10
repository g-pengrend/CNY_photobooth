@echo off
TITLE Auto-Starters

echo ========================================================
echo IMPORTANT REMINDER:
echo Please key in the Linux Receiver IP address
echo before sending files!
echo ========================================================
echo.

echo Starting ComfyUI Server...
start "ComfyUI Server" cmd /k "call conda activate comfyui && cd /d C:\Users\Brandon\Documents\comfy\ComfyUI && python main.py"

timeout /t 5 /nobreak >nul

echo Starting CNY Photo Booth App...
start "CNY Photo Booth App" cmd /k "call conda activate comfyui && cd /d C:\Users\Brandon\Desktop\Projects\CNY_photobooth && python app.py"

timeout /t 2 /nobreak >nul
echo Opening Browser...
start http://localhost:5000

echo All servers started!
pause
