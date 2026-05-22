@echo off
chcp 65001 >nul
setlocal

echo ========================================
echo   npm-downloader Status
echo ========================================
echo.

set "SERVER_RUNNING=0"
set "CLIENT_RUNNING=0"

:: Check backend (3002)
curl -s http://localhost:3002/health >nul 2>&1
if %errorlevel% equ 0 (
    set "SERVER_RUNNING=1"
    echo [Backend] Running - http://localhost:3002
) else (
    echo [Backend] Not running
)

:: Check frontend (3001)
curl -s http://localhost:3001 >nul 2>&1
if %errorlevel% equ 0 (
    set "CLIENT_RUNNING=1"
    echo [Frontend] Running - http://localhost:3001
) else (
    echo [Frontend] Not running
)

echo.
echo ----------------------------------------

:: Show port details
echo Port details:
for %%p in (3001 3002) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p " ^| findstr "LISTENING" 2^>nul') do (
        echo   Port %%p: PID %%a
    )
)

echo ========================================

endlocal
