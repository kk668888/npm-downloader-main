<#
.SYNOPSIS
    npm-downloader 服务管理脚本

.DESCRIPTION
    用于在 Windows 上管理 npm-downloader 服务的启动、停止、重启和状态查看。

.EXAMPLE
    .\npm-downloader.ps1 start       # 启动服务
    .\npm-downloader.ps1 stop        # 停止服务
    .\npm-downloader.ps1 restart     # 重启服务
    .\npm-downloader.ps1 status      # 查看状态
    .\npm-downloader.ps1 logs        # 查看日志
    .\npm-downloader.ps1 logs server # 查看后端日志
    .\npm-downloader.ps1 build       # 构建项目
    .\npm-downloader.ps1 dev         # 开发模式启动
#>

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "restart", "status", "logs", "build", "dev", "install")]
    [string]$Action = "start",

    [Parameter(Position=1)]
    [string]$Target = ""
)

# ========================================
# 配置
# ========================================
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$SERVER_PORT = 3002
$CLIENT_PORT = 3001
$LOGS_DIR = Join-Path $SCRIPT_DIR "logs"
$DATA_DIR = Join-Path $SCRIPT_DIR "data"
$PID_FILE = Join-Path $SCRIPT_DIR ".service-pids.json"

# ========================================
# 颜色输出函数
# ========================================
function Write-Info {
    param([string]$msg)
    Write-Host "[INFO] $msg" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$msg)
    Write-Host "[OK] $msg" -ForegroundColor Green
}

function Write-WarningMsg {
    param([string]$msg)
    Write-Host "[WARN] $msg" -ForegroundColor Yellow
}

function Write-ErrorMsg {
    param([string]$msg)
    Write-Host "[ERROR] $msg" -ForegroundColor Red
}

function Write-Header {
    param([string]$msg)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor DarkGray
    Write-Host "  $msg" -ForegroundColor White
    Write-Host "========================================" -ForegroundColor DarkGray
}

# ========================================
# 工具函数
# ========================================
function Test-Command {
    param([string]$cmd)
    $null = Get-Command $cmd -ErrorAction SilentlyContinue
    return $?
}

function Test-PortInUse {
    param([int]$port)
    $connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    return ($null -ne $connection)
}

function Test-ServiceHealth {
    param([int]$port)
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$port/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
        return ($response.StatusCode -eq 200)
    }
    catch {
        return $false
    }
}

function Get-ProcessByPort {
    param([int]$port)
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        return Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    }
    return $null
}

function Save-PIDs {
    param([int]$serverPID, [int]$clientPID)
    $pids = @{
        server = $serverPID
        client = $clientPID
    }
    $pids | ConvertTo-Json | Out-File $PID_FILE -Encoding utf8
}

function Get-SavedPIDs {
    if (Test-Path $PID_FILE) {
        return Get-Content $PID_FILE | ConvertFrom-Json
    }
    return @{ server = $null; client = $null }
}

# ========================================
# 检查依赖
# ========================================
function Test-Dependencies {
    Write-Info "Checking dependencies..."

    if (-not (Test-Command "node")) {
        Write-ErrorMsg "Node.js not found. Please install Node.js >= 18"
        Write-Host "Download: https://nodejs.org/" -ForegroundColor Gray
        exit 1
    }

    $nodeVersion = node --version
    Write-Info "Node.js: $nodeVersion"

    if (-not (Test-Command "pnpm")) {
        Write-WarningMsg "pnpm not found, installing..."
        npm install -g pnpm
        if (-not $?) {
            Write-ErrorMsg "pnpm installation failed"
            exit 1
        }
    }

    $pnpmVersion = pnpm --version
    Write-Info "pnpm: $pnpmVersion"
    Write-Host ""
}

# ========================================
# 安装依赖
# ========================================
function Install-Project {
    Write-Header "Installing Dependencies"

    Push-Location $SCRIPT_DIR

    if (Test-Path "node_modules") {
        Write-Info "Dependencies already installed, skipping"
    }
    else {
        Write-Info "Installing dependencies..."
        pnpm install
        if (-not $?) {
            Write-ErrorMsg "Dependency installation failed"
            Pop-Location
            exit 1
        }
        Write-Success "Dependencies installed"
    }

    Pop-Location
}

# ========================================
# 构建项目
# ========================================
function Build-Project {
    Write-Header "Building Project"

    Push-Location $SCRIPT_DIR

    Write-Info "Building..."
    pnpm run build

    if (-not $?) {
        Write-ErrorMsg "Build failed"
        Pop-Location
        exit 1
    }

    Write-Success "Build completed"
    Pop-Location
}

# ========================================
# 启动服务
# ========================================
function Start-Services {
    param([bool]$devMode = $false)

    $modeText = if ($devMode) { "(Dev Mode)" } else { "(Production Mode)" }
    Write-Header "Starting Services $modeText"

    # 检查是否已在运行
    if ((Test-PortInUse $SERVER_PORT) -or (Test-PortInUse $CLIENT_PORT)) {
        Write-WarningMsg "Detected services may already be running"
        $confirm = Read-Host "Continue starting? (y/N)"
        if ($confirm -ne "y" -and $confirm -ne "Y") {
            exit 0
        }
    }

    # 创建必要目录
    $dirs = @($LOGS_DIR, $DATA_DIR)
    foreach ($dir in $dirs) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }

    Push-Location $SCRIPT_DIR

    # 启动后端
    Write-Info "Starting backend service (port $SERVER_PORT)..."

    $serverLog = Join-Path $LOGS_DIR "server.log"
    $serverPath = Join-Path $SCRIPT_DIR "packages\server"

    if ($devMode) {
        $serverCmd = "cd /d `"$SCRIPT_DIR`" & pnpm exec turbo run dev --filter=@npm-downloader/server >> `"$serverLog`" 2>&1"
    }
    else {
        $serverCmd = "cd /d `"$serverPath`" & pnpm start >> `"$serverLog`" 2>&1"
    }
    $serverJob = Start-Process -FilePath "cmd" -ArgumentList "/c $serverCmd" -WindowStyle Minimized -PassThru

    Write-Info "Waiting for backend to start..."
    Start-Sleep -Seconds 3

    # 检查后端健康
    if (Test-ServiceHealth $SERVER_PORT) {
        Write-Success "Backend service started"
    }
    else {
        Write-WarningMsg "Backend may not be fully started, check logs"
    }

    # 启动前端
    Write-Info "Starting frontend service (port $CLIENT_PORT)..."

    $clientLog = Join-Path $LOGS_DIR "client.log"
    $clientPath = Join-Path $SCRIPT_DIR "packages\client"

    if ($devMode) {
        $clientCmd = "cd /d `"$SCRIPT_DIR`" & pnpm exec turbo run dev --filter=@npm-downloader/client >> `"$clientLog`" 2>&1"
    }
    else {
        $clientCmd = "cd /d `"$clientPath`" & pnpm run serve:static >> `"$clientLog`" 2>&1"
    }
    $clientJob = Start-Process -FilePath "cmd" -ArgumentList "/c $clientCmd" -WindowStyle Minimized -PassThru

    Write-Info "Waiting for frontend to start..."
    Start-Sleep -Seconds 2

    # 保存 PID
    Save-PIDs -serverPID $serverJob.Id -clientPID $clientJob.Id

    Pop-Location

    Write-Success "Services started"
    Write-Host ""
    Write-Host "  Frontend: " -NoNewline
    Write-Host "http://localhost:$CLIENT_PORT" -ForegroundColor Cyan
    Write-Host "  Backend:  " -NoNewline
    Write-Host "http://localhost:$SERVER_PORT" -ForegroundColor Cyan
    Write-Host "  Logs:     " -NoNewline
    Write-Host $LOGS_DIR -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Stop:   .\npm-downloader.ps1 stop" -ForegroundColor DarkGray
    Write-Host "  Status: .\npm-downloader.ps1 status" -ForegroundColor DarkGray
    Write-Host "  Logs:   .\npm-downloader.ps1 logs" -ForegroundColor DarkGray

    # 打开浏览器
    $openBrowser = Read-Host "Open browser? (Y/n)"
    if ($openBrowser -ne "n" -and $openBrowser -ne "N") {
        Start-Process "http://localhost:$CLIENT_PORT"
    }
}

# ========================================
# 停止服务
# ========================================
function Stop-Services {
    Write-Header "Stopping Services"

    $stopped = $false

    # 通过端口停止
    $ports = @($SERVER_PORT, $CLIENT_PORT)
    foreach ($port in $ports) {
        $proc = Get-ProcessByPort $port
        if ($proc) {
            Write-Info "Stopping process on port $port [PID: $($proc.Id)]..."
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            $stopped = $true
        }
    }

    # 通过窗口标题停止（备用）
    try {
        $windows = Get-Process -Name cmd -ErrorAction SilentlyContinue | Where-Object {
            $_.MainWindowTitle -like "*npm-downloader*"
        }

        if ($windows) {
            foreach ($win in $windows) {
                Write-Info "Stopping window: $($win.MainWindowTitle)"
                Stop-Process -Id $win.Id -Force -ErrorAction SilentlyContinue
                $stopped = $true
            }
        }
    }
    catch {
        # 忽略错误
    }

    # 清理 PID 文件
    if (Test-Path $PID_FILE) {
        Remove-Item $PID_FILE -Force -ErrorAction SilentlyContinue
    }

    if ($stopped) {
        Write-Success "Services stopped"
    }
    else {
        Write-WarningMsg "No running services found"
    }
}

# ========================================
# 重启服务
# ========================================
function Restart-Services {
    Stop-Services
    Start-Sleep -Seconds 2
    Start-Services
}

# ========================================
# 查看状态
# ========================================
function Show-Status {
    Write-Header "Service Status"

    $serverRunning = Test-ServiceHealth $SERVER_PORT
    $clientRunning = Test-PortInUse $CLIENT_PORT

    # 后端状态
    Write-Host "  [Backend] " -NoNewline
    if ($serverRunning) {
        Write-Host "Running" -ForegroundColor Green -NoNewline
        Write-Host " - http://localhost:$SERVER_PORT"
    }
    else {
        Write-Host "Stopped" -ForegroundColor Red
    }

    # 前端状态
    Write-Host "  [Frontend] " -NoNewline
    if ($clientRunning) {
        Write-Host "Running" -ForegroundColor Green -NoNewline
        Write-Host " - http://localhost:$CLIENT_PORT"
    }
    else {
        Write-Host "Stopped" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "  Port Details:" -ForegroundColor DarkGray

    $ports = @($SERVER_PORT, $CLIENT_PORT)
    foreach ($port in $ports) {
        $proc = Get-ProcessByPort $port
        if ($proc) {
            Write-Host "    Port $port : PID $($proc.Id) ($($proc.ProcessName))" -ForegroundColor Gray
        }
    }

    Write-Host ""
}

# ========================================
# 查看日志
# ========================================
function Show-Logs {
    param([string]$target = "all")

    if (-not (Test-Path $LOGS_DIR)) {
        Write-WarningMsg "Logs directory does not exist"
        return
    }

    if ($target -eq "server") {
        $logFile = Join-Path $LOGS_DIR "server.log"
        if (Test-Path $logFile) {
            Write-Header "Backend Logs (last 50 lines)"
            Get-Content $logFile -Tail 50
        }
        else {
            Write-WarningMsg "Backend log file not found"
        }
    }
    elseif ($target -eq "client") {
        $logFile = Join-Path $LOGS_DIR "client.log"
        if (Test-Path $logFile) {
            Write-Header "Frontend Logs (last 50 lines)"
            Get-Content $logFile -Tail 50
        }
        else {
            Write-WarningMsg "Frontend log file not found"
        }
    }
    else {
        Write-Header "Log Files"
        Get-ChildItem $LOGS_DIR -Filter "*.log" | Format-Table Name, Length, LastWriteTime -AutoSize
        Write-Host ""
        Write-Host "Usage: .\npm-downloader.ps1 logs server|client" -ForegroundColor DarkGray
    }
}

# ========================================
# 主入口
# ========================================
switch ($Action) {
    "start" {
        Test-Dependencies
        Install-Project
        Build-Project
        Start-Services -devMode $false
    }
    "stop" {
        Stop-Services
    }
    "restart" {
        Restart-Services
    }
    "status" {
        Show-Status
    }
    "logs" {
        Show-Logs $Target
    }
    "build" {
        Test-Dependencies
        Build-Project
    }
    "dev" {
        Test-Dependencies
        Install-Project
        Start-Services -devMode $true
    }
    "install" {
        Test-Dependencies
        Install-Project
    }
}
