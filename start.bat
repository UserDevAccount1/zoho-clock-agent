@echo off
echo Starting Outsourcey Process Automation...
cd /d "D:\COMPANY\OUTSOURCEY\PROCESS AUTOMATION\zoho-clock"

echo Starting backend server...
start "Backend Server" cmd /k "node server/index.js"
timeout /t 2 /nobreak >nul

echo Starting frontend dev server...
start "Frontend Dev" cmd /k "cd frontend && npm run dev"
timeout /t 3 /nobreak >nul

echo Starting tunnel...
start "Tunnel" cmd /k "npx localtunnel --port 3847 --subdomain zoho-clock-gab"

echo.
echo === Outsourcey Process Automation Started ===
echo Backend:  http://localhost:3847
echo Frontend: http://localhost:5173
echo Tunnel:   https://zoho-clock-gab.loca.lt
echo.
pause
