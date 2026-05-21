# 项目状态 / Project Status

## 最近完成的工作 / Recent Work

### 2026-04-01

#### Turborepo 迁移
- **从 pnpm workspaces 迁移到 Turborepo 管理**
  - 新增 `turbo.json` pipeline 配置（build/dev/test/clean）
  - 根 `package.json` scripts 改为 `turbo run` 命令
  - 添加 `turbo ^2` 到 devDependencies
  - 各子包添加 `clean` 脚本
  - 构建缓存验证通过（cache hit 正常工作）
  - 依赖感知的构建顺序验证通过（types/core → server/client）
  - 共 8 个提交：`180e8d5..0a4a013`

- **部署脚本更新**
  - `npm-downloader.ps1` — dev 模式改用 `turbo run dev --filter`
  - `start-dev.bat` — dev 模式改用 `turbo run dev --filter`
  - `pack.sh` — 排除 `.turbo` 缓存目录
  - `start.bat`、`Dockerfile` — 无需修改（已通过验证）

- **文档更新**
  - `CLAUDE.md` — 添加 Turborepo 技术栈说明和命令参考
  - 设计文档：`docs/superpowers/specs/2026-04-01-turborepo-migration-design.md`
  - 实施计划：`docs/superpowers/plans/2026-04-01-turborepo-migration.md`

#### 客户端迁移
- **前端从 Nuxt 3 迁移到 Vite + Vue 3**
  - 移除 Nuxt 依赖，改用纯 Vite 构建
  - UI 组件库改为 Tailwind CSS + Headless UI
  - 生产环境用 `serve` 托管静态文件（端口 3001）

#### BDD 功能文档
- **创建完整的 BDD feature 文件**（9 个文件，83 个场景）
  - lockfile-upload、package-download、history-management
  - log-streaming、ui-interactions、file-cleanup
  - error-handling、core-parsing、deployment

#### 修复
- **Express 5 req.params 类型兼容** — `req.params.taskId as string`
- **.gitignore 规则修复** — `logs/` → `/logs/` 避免 match `components/logs/`
- **pack.sh 排除规则修复** — `logs` → `/logs`

#### Dark Industrial 主题重设计
- **前端 UI 全面切换到暗色工业风主题**
  - 设计规范：`docs/dark-industrial-theme.md`
  - 色板：深海军蓝灰阶（base-950 ~ base-100），cyan 强调色（#22d3ee）
  - 语义色：success=#34d399、danger=#f87171、warning=#22d3ee
  - 字体：JetBrains Mono（代码/日志）+ DM Sans（UI 文字），npm 本地包
  - 深色专用主题（移除亮色/暗色切换）
  - 新增 Header 组件：实时时钟、品牌标识、状态指示灯
  - 自定义细滚动条（scrollbar-thin）
  - 终端风格日志查看器（交通灯标题栏、mono 字体、日志着色）
  - 拖拽区域激活态：`border-accent bg-accent/5 scale-[1.01]`

- **修改的文件**
  - `packages/client/src/assets/css.css` — 全新 CSS 主题变量和组件类
  - `packages/client/tailwind.config.js` — 新增 base-* / accent / danger 颜色 token
  - `packages/client/src/components/layouts/DefaultLayout.vue` — 工业风 Header
  - 全部 UI 基础组件：Card、Button、Badge、Input、Progress、Alert、Popover、SelectMenu
  - 全部业务组件：TaskHistory、TaskCard、UploadPanel、PackageDownload、CurrentTask
  - 全部日志组件：LogViewer、LogLine、LogStats、LogFilters
  - `packages/client/src/views/Home.vue` — 更新样式类
  - `packages/client/src/App.vue` — 移除暗色模式切换

- **依赖变更**
  - 新增 `@fontsource-variable/jetbrains-mono`（workspace root）
  - 新增 `@fontsource-variable/dm-sans`（workspace root）

- **修复**
  - TaskCard 删除按钮：Popover 确认方式改为浏览器原生 `confirm()` 对话框

#### BDD 合规检查
- **对 `history-management.feature`（10 个场景）进行了代码审查**
  - 8 个场景完全通过
  - 1 个高优先级问题：Lockfile/Package 任务完成时 `status: "completed"` 未写入历史记录
  - 1 个低优先级问题：删除不存在记录时返回 500 而非 404

#### Windows 部署工具
- **PowerShell 服务管理脚本** `npm-downloader.ps1`
  - 支持 start/stop/restart/status/logs/build/dev/install
- **批处理脚本** `start.bat`、`start-dev.bat`
- **Linux 打包脚本** `pack.sh`（排除 node_modules/dist/.git 等）

### 2026-01-31

#### 修复
- **修复下载 API 404 错误**
  - 问题：`routing-controllers` 与 `res.download()` 不兼容
  - 解决：使用原生 Express 路由处理 `/api/download/:taskId` 和 `/api/task/:taskId`
  - 启用 ES 模块支持（`tsconfig.json` + `package.json`）
  - 修复路径解析使用 `import.meta.url` 获取相对路径

#### 新功能
- **历史记录删除功能**
  - 后端：`DELETE /api/history/:taskId` 端点
  - 前端：任务卡片添加红色删除按钮

#### Docker 支持
- **下载目录持久化**
  - 添加环境变量：`TEMP_DIR`、`DATA_DIR`、`UPLOAD_DIR`
  - 创建 `docker-compose.yml` 配置
  - 数据保存到 `/dockerData/npm-downloader/`

#### 文档
- 创建 `CLAUDE.md`（中文版）- Claude Code 指导文档
- 创建 `/dockerData/npm-downloader/README.md` - Docker 部署说明

## 技术栈 / Tech Stack

- **任务编排**: Turborepo
- **包管理**: pnpm workspaces
- **后端**: Express + routing-controllers
- **前端**: Vite + Vue 3 + Tailwind CSS + Headless UI
- **Docker**: Node.js 20 Alpine
- **测试**: Jest (core)、Vitest (server)、Playwright (client)

## 快速启动 / Quick Start

```bash
# 安装依赖
pnpm install

# 开发
turbo run dev
# 或单独启动
turbo run dev --filter=@npm-downloader/server
turbo run dev --filter=@npm-downloader/client

# 构建（带缓存）
turbo run build

# 测试
turbo run test

# 清理
turbo run clean

# Docker
cd /dockerData/npm-downloader
docker-compose up -d
```

## 已知问题 / Known Issues

- Core 包测试存在 Jest/Babel ESM 解析错误（迁移前已存在）
- Server 包集成测试需要运行中的服务器（非单元测试）

## 待办事项 / TODO

- [ ] 修复 Core 包 Jest ESM 配置
- [ ] 添加单元测试覆盖
- [ ] 支持更多 lockfile 格式（package-lock.json、yarn.lock）
- [ ] **[高] 任务完成时同步 `status: "completed"` 到历史记录**（lockfileController / packageController 中 `upsertHistoryItem` 未更新 status）
- [ ] **[低] 删除不存在的历史记录时返回 404 而非 500**（HistoryController）
