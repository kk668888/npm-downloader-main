@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title npm-downloader

echo ========================================
echo   npm-downloader v2.0
echo ========================================
echo.

:: Set project root
set "PROJECT_ROOT=%~dp0"
cd /d "%PROJECT_ROOT%"

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found, please install Node.js ^>= 18
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)

:: Check pnpm
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] pnpm not found, installing...
    npm install -g pnpm
    if %errorlevel% neq 0 (
        echo [ERROR] pnpm install failed
        pause
        exit /b 1
    )
)

:: Show versions
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
for /f "tokens=*" %%i in ('pnpm --version') do set PNPM_VER=%%i
echo [INFO] Node.js: %NODE_VER%
echo [INFO] pnpm: %PNPM_VER%
echo.

:: Check if already running
tasklist /FI "WINDOWTITLE eq npm-downloader*" 2>nul | find "cmd.exe" >nul
if %errorlevel% equ 0 (
    echo [WARN] Detected existing services
    echo        Run stop.bat first to restart
    echo.
    choice /c YN /m "Continue anyway (may fail)"
    if errorlevel 2 exit /b 0
)

:: Install dependencies
if not exist "node_modules" (
    echo [1/4] Installing dependencies...
    call pnpm install
    if %errorlevel% neq 0 (
        echo [ERROR] Dependency install failed
        pause
        exit /b 1
    )
) else (
    echo [1/4] Dependencies installed, skipping
)

:: Build project
echo [2/4] Building project...
call pnpm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)
echo.

:: Create directories
if not exist "logs" mkdir logs
if not exist "data" mkdir data

:: Create PID directory
set "PID_DIR=%PROJECT_ROOT%.pids"
if not exist "%PID_DIR%" mkdir "%PID_DIR%"

:: Start backend
echo [3/4] Starting backend server (port 3002)...
cd /d "%PROJECT_ROOT%packages\server"
start "npm-downloader Server" /min cmd /c "pnpm start >> ..\..\logs\server.log 2>&1 & echo %errorlevel% > ..\..\.pids\server.pid"

:: Wait for backend
echo      Waiting for backend...
timeout /t 3 /nobreak >nul

:: Check backend health
curl -s http://localhost:3002/health >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] Backend may not be ready, check logs\server.log
) else (
    echo      Backend started successfully
)

:: Start frontend
echo [4/4] Starting frontend server (port 3001)...
cd /d "%PROJECT_ROOT%packages\client"
start "npm-downloader Client" /min cmd /c "pnpm run serve:static >> ..\..\logs\client.log 2>&1 & echo %errorlevel% > ..\..\.pids\client.pid"

:: Wait for frontend
timeout /t 3 /nobreak >nul

:: Return to root
cd /d "%PROJECT_ROOT%"

echo.
echo ========================================
echo   Started!
echo ========================================
echo   Frontend: http://localhost:3001
echo   Backend:  http://localhost:3002
echo   Logs:     %PROJECT_ROOT%logs
echo.
echo   Stop:   run stop.bat
echo   Status: run status.bat
echo ========================================
echo.

:: Open browser
choice /c YN /t 5 /d Y /m "Open browser"
if errorlevel 1 (
    start http://localhost:3001
)

endlocal
