@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo   npm-downloader Stop v2.0
echo ========================================
echo.

set "PROJECT_ROOT=%~dp0"
set "PID_DIR=%PROJECT_ROOT%.pids"

:: Method 1: Stop by window title
echo [1/2] Stopping service windows...
taskkill /FI "WINDOWTITLE eq npm-downloader*" /T /F >nul 2>&1
if %errorlevel% equ 0 (
    echo      Service windows stopped
) else (
    echo      No running service windows found
)

:: Method 2: Stop by port (fallback)
echo [2/2] Checking port usage...
for %%p in (3001 3002) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p " ^| findstr "LISTENING"') do (
        taskkill /PID %%a /F >nul 2>&1
        if !errorlevel! equ 0 (
            echo      Stopped port %%p process [PID: %%a]
        )
    )
)

:: Clean PID files
if exist "%PID_DIR%" (
    rmdir /s /q "%PID_DIR%" 2>nul
)

echo.
echo ========================================
echo   All services stopped
echo ========================================
echo.

endlocal
