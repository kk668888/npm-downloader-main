@echo off
chcp 65001 >nul
setlocal

echo ========================================
echo   npm-downloader 服务状态
echo ========================================
echo.

set "SERVER_RUNNING=0"
set "CLIENT_RUNNING=0"

:: 检查后端 (3002)
curl -s http://localhost:3002/health >nul 2>&1
if %errorlevel% equ 0 (
    set "SERVER_RUNNING=1"
    echo [后端] 运行中 - http://localhost:3002
) else (
    echo [后端] 未运行
)

:: 检查前端 (3001)
curl -s http://localhost:3001 >nul 2>&1
if %errorlevel% equ 0 (
    set "CLIENT_RUNNING=1"
    echo [前端] 运行中 - http://localhost:3001
) else (
    echo [前端] 未运行
)

echo.
echo ----------------------------------------

:: 显示端口占用详情
echo 端口占用详情:
for %%p in (3001 3002) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p " ^| findstr "LISTENING" 2^>nul') do (
        echo   端口 %%p: PID %%a
    )
)

echo ========================================

endlocal
