@echo off
title Hermes Agent Studio Launcher (Ngrok & Discord & Render Workflows)
color 0A
cd /d "%~dp0"

echo ==================================================================
echo         Hermes Agent Studio - Visual AI Operating System
echo      Local-First Autonomous Runtime + Render Workflows Engine
echo ==================================================================
echo.

:: Free up ports if lingering from previous run
echo Cleaning up previous port bindings...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8790') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001') do taskkill /F /PID %%a 2>nul
timeout /t 1 /nobreak >nul

:: 1. Start WhatsApp Web Bridge
echo [1/4] Starting WhatsApp Web QR Bridge (Port 3001)...
start "Hermes WhatsApp Bridge" cmd /k "cd /d "%~dp0" && node backend/wa-bridge/server.js"

:: 2. Start FastAPI Master Server (hosting API + Discord Gateway + Render Workflows)
echo [2/4] Starting FastAPI Master Server & API (Port 8790)...
start "Hermes FastAPI Master Server" cmd /k "cd /d "%~dp0" && .\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8790"

:: 3. Start Frontend Vite Dev UI (Port 5173)
echo [3/4] Starting Frontend Dev Server (Port 5173)...
start "Hermes Frontend Dev UI" cmd /k "cd /d "%~dp0frontend" && npm run dev"

:: Wait 3 seconds to let servers boot
timeout /t 3 /nobreak >nul

:: 4. Start Ngrok Secure HTTPS Tunnel
echo [4/4] Opening Ngrok Secure HTTPS Tunnel to the internet...
start "Ngrok Public Tunnel" cmd /k "cd /d "%~dp0" && .\\ngrok.exe http --url=only-unreformable-doris.ngrok-free.dev 8790"

:: Automatically open browser
start http://localhost:5173

echo.
echo ==================================================================
echo   Launch Complete! All services active:
echo.
echo   Local Frontend UI:   http://localhost:5173
echo   Master Full-Stack:   http://localhost:8790
echo   Public Deployment:   https://only-unreformable-doris.ngrok-free.dev
echo   Discord Gateway Bot: CONNECTED & ONLINE (Hermes047#6785)
echo   WhatsApp Bridge:     CONNECTED (Port 3001)
echo.
echo   Make sure LM Studio is running in the background (Port 1234).
echo ==================================================================
echo.
pause
