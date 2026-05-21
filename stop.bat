@echo off
chcp 65001 >nul
setlocal

echo ========================================
echo   npm-downloader 停止脚本 v2.0
echo ========================================
echo.

set "PROJECT_ROOT=%~dp0"
set "PID_DIR=%PROJECT_ROOT%.pids"

:: 方法1: 通过窗口标题停止
echo [1/2] 正在停止服务窗口...
taskkill /FI "WINDOWTITLE eq npm-downloader*" /T /F >nul 2>&1
if %errorlevel% equ 0 (
    echo      已停止服务窗口
) else (
    echo      未找到运行中的服务窗口
)

:: 方法2: 通过端口停止（备用）
echo [2/2] 检查端口占用...
for %%p in (3001 3002) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p " ^| findstr "LISTENING"') do (
        taskkill /PID %%a /F >nul 2>&1
        if !errorlevel! equ 0 (
            echo      已停止端口 %%p 的进程 [PID: %%a]
        )
    )
)

:: 清理 PID 文件
if exist "%PID_DIR%" (
    rmdir /s /q "%PID_DIR%" 2>nul
)

echo.
echo ========================================
echo   所有服务已停止
echo ========================================
echo.

endlocal
