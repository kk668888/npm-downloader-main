@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title npm-downloader (Dev Mode)

echo ========================================
echo   npm-downloader 开发模式启动 v2.0
echo ========================================
echo.

set "PROJECT_ROOT=%~dp0"
cd /d "%PROJECT_ROOT%"

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js
    pause
    exit /b 1
)

:: 检查 pnpm
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo [提示] 正在安装 pnpm...
    npm install -g pnpm
)

:: 显示版本
for /f "tokens=*" %%i in ('node --version') do echo [信息] Node.js: %%i
for /f "tokens=*" %%i in ('pnpm --version') do echo [信息] pnpm: %%i
echo.

:: 安装依赖
if not exist "node_modules" (
    echo [1/2] 正在安装依赖...
    call pnpm install
)
echo.

:: 创建日志目录
if not exist "logs" mkdir logs

:: 启动后端开发服务器（带热重载）
echo [2/2] 启动开发服务器...
echo.
echo   后端: tsx watch (支持热重载)
echo   前端: Vite (支持 HMR)
echo.

start "npm-downloader Server (Dev)" cmd /k "cd /d "%PROJECT_ROOT%" && pnpm exec turbo run dev --filter=@npm-downloader/server"
timeout /t 3 /nobreak >nul

start "npm-downloader Client (Dev)" cmd /k "cd /d "%PROJECT_ROOT%" && pnpm exec turbo run dev --filter=@npm-downloader/client"
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo   开发模式启动完成！
echo ========================================
echo   前端: http://localhost:3000 (Vite)
echo   后端: http://localhost:3002 (tsx watch)
echo.
echo   修改代码会自动重载
echo   停止服务: 运行 stop.bat
echo ========================================
echo.

start http://localhost:3000

endlocal
