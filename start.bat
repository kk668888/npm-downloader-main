@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title npm-downloader

echo ========================================
echo   npm-downloader 启动脚本 v2.0
echo ========================================
echo.

:: 设置项目根目录
set "PROJECT_ROOT=%~dp0"
cd /d "%PROJECT_ROOT%"

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装 Node.js ^>= 18
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

:: 检查 pnpm
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo [提示] 未找到 pnpm，正在安装...
    npm install -g pnpm
    if %errorlevel% neq 0 (
        echo [错误] pnpm 安装失败
        pause
        exit /b 1
    )
)

:: 显示版本
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
for /f "tokens=*" %%i in ('pnpm --version') do set PNPM_VER=%%i
echo [信息] Node.js: %NODE_VER%
echo [信息] pnpm: %PNPM_VER%
echo.

:: 检查是否已在运行
tasklist /FI "WINDOWTITLE eq npm-downloader*" 2>nul | find "cmd.exe" >nul
if %errorlevel% equ 0 (
    echo [警告] 检测到服务可能已在运行
    echo        如需重启，请先运行 stop.bat
    echo.
    choice /c YN /m "是否继续启动（可能启动失败）"
    if errorlevel 2 exit /b 0
)

:: 安装依赖
if not exist "node_modules" (
    echo [1/4] 正在安装依赖...
    call pnpm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
) else (
    echo [1/4] 依赖已安装，跳过
)

:: 构建项目
echo [2/4] 正在构建项目...
call pnpm run build
if %errorlevel% neq 0 (
    echo [错误] 项目构建失败
    pause
    exit /b 1
)
echo.

:: 创建必要目录
if not exist "logs" mkdir logs
if not exist "data" mkdir data

:: 创建 PID 文件目录
set "PID_DIR=%PROJECT_ROOT%.pids"
if not exist "%PID_DIR%" mkdir "%PID_DIR%"

:: 启动后端
echo [3/4] 正在启动后端服务 (端口 3002)...
cd /d "%PROJECT_ROOT%packages\server"
start "npm-downloader Server" /min cmd /c "pnpm start >> ..\..\logs\server.log 2>&1 & echo %errorlevel% > ..\..\.pids\server.pid"

:: 等待后端启动
echo      等待后端服务启动...
timeout /t 3 /nobreak >nul

:: 检查后端是否启动成功
curl -s http://localhost:3002/health >nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] 后端服务可能未完全启动，请检查 logs\server.log
) else (
    echo      后端服务启动成功
)

:: 启动前端
echo [4/4] 正在启动前端服务 (端口 3001)...
cd /d "%PROJECT_ROOT%packages\client"
start "npm-downloader Client" /min cmd /c "pnpm run serve:static >> ..\..\logs\client.log 2>&1 & echo %errorlevel% > ..\..\.pids\client.pid"

:: 等待前端启动
timeout /t 3 /nobreak >nul

:: 返回项目根目录
cd /d "%PROJECT_ROOT%"

echo.
echo ========================================
echo   启动完成！
echo ========================================
echo   前端地址: http://localhost:3001
echo   后端地址: http://localhost:3002
echo   日志目录: %PROJECT_ROOT%logs
echo.
echo   停止服务: 运行 stop.bat
echo   查看状态: 运行 status.bat
echo ========================================
echo.

:: 打开浏览器
choice /c YN /t 5 /d Y /m "是否打开浏览器"
if errorlevel 1 (
    start http://localhost:3001
)

endlocal
