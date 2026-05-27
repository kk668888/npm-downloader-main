/**
 * Electron 主进程入口
 *
 * 职责：
 * 1. 生产模式下：启动内置 Express 服务器，同时服务 API 和前端静态文件
 * 2. 开发模式下：直接连接到已运行的 dev server
 * 3. 创建 BrowserWindow 展示应用界面
 *
 * 调试功能：
 * - 按 F12 或 Ctrl+Shift+I 打开 DevTools（生产模式也可用）
 * - 按 Ctrl+Shift+L 打开日志窗口（查看服务器输出）
 * - 服务器日志同时写入 userData/logs/ 目录
 */

const { app, BrowserWindow, dialog, Menu, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')

// 是否为开发模式（未打包的 Electron 运行）
const isDev = !app.isPackaged

// 服务器进程引用（生产模式下用于退出时清理）
let serverProcess = null

// 主窗口引用
let mainWindow = null

// 日志窗口引用
let logWindow = null

// 日志缓冲区（用于日志窗口展示）
const logBuffer = []
const MAX_LOG_BUFFER = 2000

// 日志文件路径
const LOG_DIR = path.join(app.getPath('userData'), 'logs')
const LOG_FILE = path.join(LOG_DIR, 'server.log')

// 服务器启动 Promise 的 reject 回调（用于服务器崩溃时主动 reject）
let serverStartReject = null

// ======================== 日志系统 ========================

/**
 * 确保日志目录存在
 */
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  }
}

/**
 * 写入日志到文件和缓冲区
 * @param {string} level - 日志级别：INFO / WARN / ERROR
 * @param {string} message - 日志内容
 */
function writeLog(level, message) {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] [${level}] ${message}`

  // 写入缓冲区（日志窗口消费）
  logBuffer.push(line)
  if (logBuffer.length > MAX_LOG_BUFFER) {
    logBuffer.shift()
  }

  // 写入文件
  try {
    fs.appendFileSync(LOG_FILE, line + '\n')
  } catch {
    // 日志写入失败时不崩溃
  }

  // 推送到日志窗口（如果打开着）
  if (logWindow && !logWindow.isDestroyed()) {
    logWindow.webContents.send('log-data', line)
  }
}

// ======================== 服务器管理 ========================

/**
 * 轮询等待服务器就绪
 * 通过请求 /health 端点判断服务是否已启动
 *
 * @param {string} host - 服务器地址
 * @param {number} port - 服务器端口
 * @param {number} maxRetries - 最大重试次数
 * @returns {Promise<void>}
 */
function waitForServer(host, port, maxRetries = 40) {
  return new Promise((resolve, reject) => {
    let retries = 0
    serverStartReject = reject

    const check = () => {
      const req = http.get(`http://${host}:${port}/health`, (res) => {
        if (res.statusCode === 200) {
          serverStartReject = null
          resolve()
        } else {
          retry()
        }
        res.resume()
      })
      req.on('error', () => retry())
      req.setTimeout(2000, () => {
        req.destroy()
        retry()
      })
    }

    const retry = () => {
      retries++
      if (retries >= maxRetries) {
        serverStartReject = null
        reject(new Error(`Server at ${host}:${port} failed to start after ${maxRetries} retries`))
      } else {
        setTimeout(check, 500)
      }
    }

    check()
  })
}

/**
 * 获取用户数据目录路径
 * 在桌面模式下，将上传文件、临时文件、数据文件存放在 Electron 的 userData 目录
 */
function getUserDataDirs() {
  const userDataPath = app.getPath('userData')
  return {
    DATA_DIR: path.join(userDataPath, 'data'),
    UPLOAD_DIR: path.join(userDataPath, 'uploads'),
    TEMP_DIR: path.join(userDataPath, 'temp'),
  }
}

/**
 * 确保必要的数据目录存在
 */
function ensureDataDirs(dirs) {
  for (const dirPath of Object.values(dirs)) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
  }
}

/**
 * 启动 Express 服务器（生产模式）
 * 使用 child_process.fork 运行打包后的服务器脚本
 */
async function startServer() {
  const { fork } = require('child_process')

  // 服务器脚本路径：优先从 extraResources 查找，回退到开发路径
  const serverScript = process.resourcesPath
    ? path.join(process.resourcesPath, 'server', 'app.js')
    : path.resolve(__dirname, '../../server/dist/app.js')

  const host = 'localhost'
  const port = 3002

  // 用户数据目录
  const dataDirs = getUserDataDirs()
  ensureDataDirs(dataDirs)

  // 前端静态文件路径
  const clientDistPath = process.resourcesPath
    ? path.join(process.resourcesPath, 'client', 'dist')
    : path.resolve(__dirname, '../../client/dist')

  writeLog('INFO', `Electron version: ${process.versions.electron}`)
  writeLog('INFO', `Node version: ${process.versions.node}`)
  writeLog('INFO', `Chrome version: ${process.versions.chrome}`)
  writeLog('INFO', `App path: ${app.getAppPath()}`)
  writeLog('INFO', `UserData path: ${app.getPath('userData')}`)
  writeLog('INFO', `Server script: ${serverScript}`)
  writeLog('INFO', `Client dist: ${clientDistPath}`)
  writeLog('INFO', `Server script exists: ${fs.existsSync(serverScript)}`)
  writeLog('INFO', `Client dist exists: ${fs.existsSync(clientDistPath)}`)

  // 构建环境变量
  const forkEnv = {
    ...process.env,
    DESKTOP_MODE: 'true',
    PORT: String(port),
    CLIENT_DIST_PATH: clientDistPath,
    ...dataDirs,
  }
  delete forkEnv.ELECTRON_RUN_AS_NODE

  serverProcess = fork(serverScript, [], {
    env: forkEnv,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  })

  // 将服务器日志转发到日志系统
  serverProcess.stdout?.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean)
    lines.forEach((line) => {
      writeLog('INFO', `[Server] ${line}`)
    })
  })
  serverProcess.stderr?.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean)
    lines.forEach((line) => {
      writeLog('ERROR', `[Server] ${line}`)
    })
  })

  serverProcess.on('error', (err) => {
    writeLog('ERROR', `Failed to start server: ${err.message}`)
  })

  // 服务器退出时，如果还在等待启动，主动 reject
  serverProcess.on('exit', (code, signal) => {
    writeLog('INFO', `Server exited with code ${code}, signal ${signal}`)
    if (serverStartReject && code !== 0) {
      serverStartReject(new Error(`Server crashed with exit code ${code}`))
      serverStartReject = null
    }
  })

  // 等待服务器就绪
  await waitForServer(host, port)
  writeLog('INFO', `Server ready at http://${host}:${port}`)

  return { host, port }
}

// ======================== 窗口管理 ========================

/**
 * 创建主窗口
 */
function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'NPM Downloader',
    autoHideMenuBar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  mainWindow.loadURL(url)

  // 开发模式自动打开 DevTools
  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/**
 * 创建日志查看窗口
 * 显示服务器所有输出日志，支持自动滚动
 */
function createLogWindow() {
  if (logWindow && !logWindow.isDestroyed()) {
    logWindow.focus()
    return
  }

  logWindow = new BrowserWindow({
    width: 900,
    height: 600,
    title: 'NPM Downloader - Server Logs',
    autoHideMenuBar: true,
    parent: mainWindow || undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // 用 data URL 加载一个简单的日志查看页面
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Server Logs</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1e1e1e; color: #d4d4d4; font-family: 'Consolas', 'Courier New', monospace; font-size: 13px; padding: 8px; }
    #toolbar { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
    #toolbar button { background: #333; color: #ddd; border: 1px solid #555; padding: 4px 12px; cursor: pointer; border-radius: 3px; font-size: 12px; }
    #toolbar button:hover { background: #444; }
    #toolbar label { color: #888; font-size: 12px; display: flex; align-items: center; gap: 4px; }
    #log { white-space: pre-wrap; word-break: break-all; line-height: 1.5; }
    .log-info { color: #9cdcfe; }
    .log-warn { color: #dcdcaa; }
    .log-error { color: #f48771; }
  </style>
</head>
<body>
  <div id="toolbar">
    <button onclick="clearLogs()">Clear</button>
    <button onclick="openLogFile()">Open Log File</button>
    <label><input type="checkbox" id="autoScroll" checked> Auto-scroll</label>
  </div>
  <div id="log"></div>
  <script>
    const logEl = document.getElementById('log');
    const autoScrollEl = document.getElementById('autoScroll');

    // 渲染日志行（根据级别着色）
    function appendLine(text) {
      const span = document.createElement('span');
      let cls = 'log-info';
      if (text.includes('[ERROR]') || text.includes('[ERROR]')) cls = 'log-error';
      else if (text.includes('[WARN]')) cls = 'log-warn';
      span.className = cls;
      span.textContent = text + '\\n';
      logEl.appendChild(span);
      if (autoScrollEl.checked) {
        logEl.scrollTop = logEl.scrollHeight;
      }
    }

    // 监听主进程推送的日志
    const { ipcRenderer } = require('electron');
    ipcRenderer.on('log-data', (event, line) => {
      appendLine(line);
    });

    // 加载已有日志
    ipcRenderer.on('log-history', (event, lines) => {
      lines.forEach(appendLine);
    });

    function clearLogs() {
      logEl.innerHTML = '';
    }

    function openLogFile() {
      ipcRenderer.send('open-log-file');
    }
  </script>
</body>
</html>`

  // 注意：这里用了 nodeIntegration workaround
  // 日志窗口需要 ipcRenderer，但我们设置了 contextIsolation: true
  // 所以改用 webContents.executeJavaScript 来注入日志
  logWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent))

  // 由于 contextIsolation，直接通过 webContents 注入日志
  // 加载完成后推送历史日志
  logWindow.webContents.on('did-finish-load', () => {
    logBuffer.forEach((line) => {
      logWindow.webContents.executeJavaScript(`
        (function() {
          var logEl = document.getElementById('log');
          var span = document.createElement('span');
          var cls = 'log-info';
          if (${JSON.stringify(line)}.includes('[ERROR]')) cls = 'log-error';
          else if (${JSON.stringify(line)}.includes('[WARN]')) cls = 'log-warn';
          span.className = cls;
          span.textContent = ${JSON.stringify(line)} + '\\n';
          logEl.appendChild(span);
          if (document.getElementById('autoScroll').checked) {
            logEl.scrollTop = logEl.scrollHeight;
          }
        })();
      `).catch(() => {})
    })
  })

  logWindow.on('closed', () => {
    logWindow = null
  })
}

// ======================== 错误处理 ========================

/**
 * 显示错误对话框
 */
function showError(title, message) {
  if (mainWindow) {
    dialog.showErrorBox(title, message)
  }
}

/**
 * 显示启动失败的详细错误信息
 * 包含日志文件路径，方便用户排查
 */
function showStartupError(error) {
  writeLog('ERROR', `Startup failed: ${error.message}`)

  const logInfo = `\n\nLog file: ${LOG_FILE}`
  dialog.showErrorBox(
    'NPM Downloader - Startup Failed',
    `Error: ${error.message}${logInfo}`
  )
}

// ======================== 菜单 ========================

/**
 * 创建应用菜单（含调试选项）
 */
function createMenu() {
  const template = [
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: 'Reload' },
        { role: 'forceReload', label: 'Force Reload' },
        { type: 'separator' },
        {
          label: 'Toggle DevTools',
          accelerator: 'F12',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) {
              win.webContents.toggleDevTools()
            }
          },
        },
        {
          label: 'Server Logs',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => {
            createLogWindow()
          },
        },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toggle Full Screen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open Log Folder',
          click: () => {
            ensureLogDir()
            shell.showItemInFolder(LOG_FILE)
          },
        },
        {
          label: 'Open Data Folder',
          click: () => {
            shell.showItemInFolder(path.join(app.getPath('userData'), 'data'))
          },
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// ======================== 应用生命周期 ========================

async function main() {
  // 初始化日志系统
  ensureLogDir()

  // 启动时清空旧日志文件（保留最近一次启动的日志）
  try {
    fs.writeFileSync(LOG_FILE, `=== NPM Downloader started at ${new Date().toISOString()} ===\n`)
  } catch {
    // 忽略写入失败
  }

  writeLog('INFO', `Mode: ${isDev ? 'development' : 'production'}`)
  writeLog('INFO', `Platform: ${process.platform} ${process.arch}`)
  writeLog('INFO', `App version: ${app.getVersion()}`)

  // 单实例锁
  const gotTheLock = app.requestSingleInstanceLock()
  if (!gotTheLock) {
    app.quit()
    return
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.on('ready', async () => {
    // 创建菜单（含调试快捷键）
    createMenu()

    try {
      if (isDev) {
        writeLog('INFO', 'Dev mode: waiting for dev servers...')
        await waitForServer('localhost', 3002, 60)
        createWindow('http://localhost:3003')
      } else {
        const { host, port } = await startServer()
        createWindow(`http://${host}:${port}`)
      }
    } catch (err) {
      writeLog('ERROR', `Fatal: ${err.message}`)
      showStartupError(err)
      app.quit()
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('activate', () => {
    if (mainWindow === null) {
      if (isDev) {
        createWindow('http://localhost:3003')
      } else {
        createWindow('http://localhost:3002')
      }
    }
  })

  app.on('before-quit', () => {
    if (serverProcess) {
      writeLog('INFO', 'Stopping server...')
      serverProcess.kill()
      serverProcess = null
    }
  })
}

main().catch((err) => {
  writeLog('ERROR', `Unhandled error: ${err.message}`)
  showStartupError(err)
  app.quit()
})
