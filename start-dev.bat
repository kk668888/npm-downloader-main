@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title npm-downloader (Dev Mode)

echo ========================================
echo   npm-downloader Dev Mode v2.0
echo ========================================
echo.

set "PROJECT_ROOT=%~dp0"
cd /d "%PROJECT_ROOT%"

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found
    pause
    exit /b 1
)

:: Check pnpm
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing pnpm...
    npm install -g pnpm
)

:: Show versions
for /f "tokens=*" %%i in ('node --version') do echo [INFO] Node.js: %%i
for /f "tokens=*" %%i in ('pnpm --version') do echo [INFO] pnpm: %%i
echo.

:: Install dependencies
if not exist "node_modules" (
    echo [1/2] Installing dependencies...
    call pnpm install
)
echo.

:: Create log directory
if not exist "logs" mkdir logs

:: Start dev servers
echo [2/2] Starting dev servers...
echo.
echo   Server: tsx watch (hot reload)
echo   Client: Vite (HMR)
echo.

start "npm-downloader Server (Dev)" cmd /k "cd /d "%PROJECT_ROOT%" && pnpm exec turbo run dev --filter=@npm-downloader/server"
timeout /t 3 /nobreak >nul

start "npm-downloader Client (Dev)" cmd /k "cd /d "%PROJECT_ROOT%" && pnpm exec turbo run dev --filter=@npm-downloader/client"
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo   Dev mode started!
echo ========================================
echo   Frontend: http://localhost:3003 (Vite)
echo   Backend:  http://localhost:3002 (tsx watch)
echo.
echo   Auto-reload on code changes
echo   Stop: run stop.bat
echo ========================================
echo.

start http://localhost:303

endlocal
