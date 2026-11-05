@echo off
title Hermes Agent Studio Launcher (Ngrok & Render Workflows)
color 0A

echo ==================================================================
echo         Hermes Agent Studio - Visual AI Operating System
echo      Local-First Autonomous Runtime + Render Workflows Engine
echo ==================================================================
echo.

:: 1. Start WhatsApp Web Bridge
echo [1/3] Starting WhatsApp Web QR Bridge (Port 3001)...
start "Hermes WhatsApp Bridge" /D "%~dp0" cmd /k "node backend/wa-bridge/server.js"

:: 2. Start FastAPI Master Server & SPA Frontend
echo [2/3] Starting FastAPI Master Server & Web UI (Port 8790)...
start "Hermes FastAPI Master Server" /D "%~dp0" cmd /k ".\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8790"

:: 3. Wait 3 seconds to let the server boot
timeout /t 3 /nobreak >nul

:: 4. Start Ngrok Tunnel
echo [3/3] Opening Ngrok Secure HTTPS Tunnel to the internet...
start "Ngrok Tunnel" /D "%~dp0" cmd /k ".\ngrok.exe http --url=only-unreformable-doris.ngrok-free.dev 8790"

echo.
echo ==================================================================
echo   Launch Complete! All services running in background windows.
echo.
echo   Make sure LM Studio is running in the background (Port 1234).
echo.
echo   Local Access:      http://localhost:8790
echo   Public Deployment: https://only-unreformable-doris.ngrok-free.dev
echo   Render Workflows:  https://render.com/workflows (render.yaml Blueprint)
echo ==================================================================
echo.
pause
