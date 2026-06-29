import 'reflect-metadata'

// Load environment variables from .env file
import { config } from 'dotenv'
config()
import { createExpressServer } from 'routing-controllers'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import type { Request, Response } from 'express'
import { ensureWorkingDirs, TEMP_DIR } from './middleware/dirs.js'
import { getDataDir } from './config/dirs.js'
import { LockfileController } from './controllers/lockfileController.js'
import { PackageController } from './controllers/packageController.js'
import { HistoryController } from './controllers/historyController.js'
import {
  LogController,
  handleLogStream
} from './controllers/logController.js'
import { AuditController } from './controllers/auditController.js'
import { errorHandler } from './middleware/errorHandler.js'
import { loadHistory, findHistoryItem } from './services/history.js'
import {
  getTaskStatus,
  confirmAudit,
  validateTaskToken,
  cancelTask
} from './services/taskStatus.js'
import type { TaskStatusInfo } from '@npm-downloader/types'

// 初始化工作目录
ensureWorkingDirs()

// 初始化数据目录
const DATA_DIR = getDataDir()
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  console.log(`Created data directory: ${DATA_DIR}`)
}

// 启动时加载历史记录
loadHistory()

const PORT = process.env.PORT || 3002
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 先创建基础 Express app
import express from 'express'
import cors from 'cors'
const baseApp = express()

// 启用 CORS（P1-6：配置白名单，不再 origin: true）
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:3003']
baseApp.use(
  cors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true)
      } else {
        callback(null, false)
      }
    },
    credentials: true
  })
)

// 先注册更具体的 SSE 流路由（必须在 createExpressServer 之前）
// 这样 /api/logs/:taskId/stream 不会被 /api/logs/:taskId 拦截
baseApp.get('/api/logs/:taskId/stream', handleLogStream)

// 审计确认端点：使用原生 Express 路由，绕开 routing-controllers 的 body 解析问题
// Express 5 的 express.json() 确保 req.body 正确解析
baseApp.post(
  '/api/task/:taskId/confirm-audit',
  express.json(),
  (req: Request, res: Response) => {
    const { taskId } = req.params
    const token = req.body?.token as string | undefined

    if (!token || !validateTaskToken(taskId, token)) {
      res.status(403).json({ ok: false, message: '无效的任务令牌' })
      return
    }

    const confirmed = confirmAudit(taskId)
    if (!confirmed) {
      res
        .status(409)
        .json({ ok: false, message: '没有等待确认的审计任务' })
      return
    }
    res.json({ ok: true })
  }
)

// 任务取消端点：使用原生 Express 路由，需要 token 验证确保安全性
baseApp.post(
  '/api/task/:taskId/cancel',
  express.json(),
  (req: Request, res: Response) => {
    const { taskId } = req.params
    const token = req.body?.token as string | undefined

    // 验证任务令牌，防止恶意取消他人任务
    if (!token || !validateTaskToken(taskId, token)) {
      res.status(403).json({ ok: false, message: '无效的任务令牌' })
      return
    }

    const cancelled = cancelTask(taskId)
    if (!cancelled) {
      res.status(404).json({ ok: false, message: '任务不存在或已完成' })
      return
    }
    res.json({ ok: true })
  }
)

const app = createExpressServer({
  cors: false,
  routePrefix: '/api',
  controllers: [
    LockfileController,
    PackageController,
    HistoryController,
    LogController,
    AuditController
  ],
  defaultErrorHandler: false // Use custom error handler
})

// 桌面模式下，在 routing-controllers 挂载之前注册静态文件服务
// 这样 /、/assets/ 等非 API 路径由 express.static 处理，不会被 routing-controllers 吞掉
if (process.env.DESKTOP_MODE === 'true') {
  const clientDistPath = process.env.CLIENT_DIST_PATH
    || path.resolve(__dirname, '../../client/dist')

  console.log(`[DESKTOP] CLIENT_DIST_PATH: ${clientDistPath}`)
  console.log(`[DESKTOP] Directory exists: ${fs.existsSync(clientDistPath)}`)
  const indexPath = path.join(clientDistPath, 'index.html')
  console.log(`[DESKTOP] index.html exists: ${fs.existsSync(indexPath)}`)

  baseApp.use(express.static(clientDistPath))

  // SPA fallback：非 /api、非 /health 的 GET 请求返回 index.html
  baseApp.use((req: Request, res: Response, next) => {
    if (req.method === 'GET' && req.accepts('html') && !req.path.startsWith('/api') && !req.path.startsWith('/health')) {
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error(`[DESKTOP] Failed to send index.html:`, err)
          next(err)
        }
      })
    } else {
      next()
    }
  })
}

// 将 routing-controllers 的路由挂载到基础 app 上
baseApp.use(app)

// 重新赋值，确保后续使用正确的 app
const expressApp = baseApp

// 下载端点
// 优先用 folderName 命名的 ZIP 查找，回退到 taskId 命名
expressApp.get(
  '/api/download/:taskId',
  (req: Request, res: Response) => {
    const { taskId } = req.params
    const historyItem = findHistoryItem(taskId)

    // 计算 ZIP 文件名：有 folderName 则用 folderName.zip，否则用 taskId.zip
    const dirName = historyItem?.folderName
      ? historyItem.folderName.replace(/[\\/:*?"<>|]/g, '_').trim() || taskId
      : taskId
    const zipFileName = `${dirName}.zip`
    const zipPath = path.join(TEMP_DIR, zipFileName)

    if (fs.existsSync(zipPath)) {
      res.download(zipPath, zipFileName, (err) => {
        if (err) {
          console.error('Download error:', err)
          if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed' })
          }
        }
      })
    } else {
      res.status(404).json({ error: 'File not found' })
    }
  }
)

// 打开任务目录端点：用系统文件管理器打开 ZIP 所在的临时目录
// 仅限本地使用（桌面模式 / 本地开发）
import { exec } from 'child_process'
expressApp.get('/api/open-folder/:taskId', (req: Request, res: Response) => {
  const { taskId } = req.params
  const historyItem = findHistoryItem(taskId)

  const dirName = historyItem?.folderName
    ? historyItem.folderName.replace(/[\\/:*?"<>|]/g, '_').trim() || taskId
    : taskId

  // 优先打开任务目录（解压前的文件夹），不存在则打开 TEMP_DIR
  const taskDir = path.join(TEMP_DIR, dirName)
  const targetDir = fs.existsSync(taskDir) ? taskDir : TEMP_DIR

  const command =
    process.platform === 'win32' ? `explorer "${targetDir}"` :
    process.platform === 'darwin' ? `open "${targetDir}"` :
    `xdg-open "${targetDir}"`

  exec(command, (err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to open folder' })
    } else {
      res.json({ ok: true, path: targetDir })
    }
  })
})

// 任务状态查询端点（不暴露 token，token 仅通过初始创建响应返回）
expressApp.get('/api/task/:taskId', (req: Request, res: Response) => {
  const taskId = req.params.taskId as string
  const status = getTaskStatus(taskId)

  if (status) {
    // 返回状态数据但剔除 token
    const { token: _token, ...publicStatus } = status
    res.json(publicStatus)
  } else {
    res.status(404).json({ error: 'Task not found' })
  }
})

// Health check (keep under /health)
expressApp.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' })
})

// Error handling middleware (must be last)
expressApp.use(errorHandler)

// Cleanup task
const CLEANUP_INTERVAL = 60 * 60 * 1000 // 1 hour
const MAX_AGE = 60 * 60 * 1000 // 1 hour

setInterval(() => {
  console.log('Running cleanup task...')
  if (!fs.existsSync(TEMP_DIR)) return

  fs.readdir(TEMP_DIR, (err, files) => {
    if (err) {
      console.error('Failed to read temp directory', err)
      return
    }

    const now = Date.now()
    files.forEach((file) => {
      const filePath = path.join(TEMP_DIR, file)
      fs.stat(filePath, (err, stats) => {
        if (err) return

        if (now - stats.mtimeMs > MAX_AGE) {
          fs.rm(filePath, { recursive: true, force: true }, (err) => {
            if (err) console.error(`Failed to delete ${file}`, err)
            else console.log(`Deleted expired file: ${file}`)
          })
        }
      })
    })
  })
}, CLEANUP_INTERVAL)

// Start server
expressApp.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`)
})

export default expressApp
