# BDD Feature 文件说明

本目录包含 npm-downloader 项目的 BDD（Behavior-Driven Development）功能规格文件，使用 Gherkin 语法编写。

## 文件列表

| 文件 | 覆盖功能 |
|------|---------|
| `lockfile-upload.feature` | Lockfile 上传、解析、批量下载、ZIP 打包 |
| `package-download.feature` | 单包下载、依赖递归解析、任务状态查询 |
| `history-management.feature` | 历史记录 CRUD、持久化、前端轮询 |
| `log-streaming.feature` | SSE 实时日志流、重连、过滤、查看器 |
| `ui-interactions.feature` | 页面布局、深色模式、Toast 通知、响应式 |
| `file-cleanup.feature` | 临时文件清理、上传文件清理 |
| `error-handling.feature` | 重试机制、错误处理、前端错误展示 |
| `core-parsing.feature` | Lockfile 解析、包名解析、URL 生成 |
| `deployment.feature` | Windows/Linux/Docker 部署、打包、环境变量 |

## 涵盖的 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/upload | 上传 lockfile 并下载所有依赖 |
| POST | /api/download-package | 下载单个包及其依赖 |
| GET | /api/history | 获取历史记录列表 |
| DELETE | /api/history/:taskId | 删除历史记录项 |
| GET | /api/logs/:taskId | 获取任务日志 |
| GET | /api/logs/:taskId/stream | SSE 实时日志流 |
| GET | /api/download/:taskId | 下载 ZIP 文件 |
| GET | /api/task/:taskId | 查询任务状态 |
| GET | /health | 健康检查 |

## 涵盖的 UI 组件

- `Home.vue` - 主页面布局
- `UploadPanel.vue` - Lockfile 上传面板
- `PackageDownload.vue` - 单包下载面板
- `CurrentTask.vue` - 当前活跃任务卡片
- `TaskHistory.vue` / `TaskCard.vue` - 历史记录列表
- `LogViewer.vue` - 日志查看器 Modal
- `LogFilters.vue` - 日志过滤（级别、搜索）
- `LogStats.vue` - 日志统计面板
- `LogLine.vue` - 单行日志渲染
