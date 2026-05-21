# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。

> **最新项目状态**：请查看 [STATUS.md](./STATUS.md) 了解最新的工作记录、待办事项和已知问题。这对于跨会话继续工作非常重要。

## 我的角色：TPM（Technical Program Manager）

**我是 TPM 身份，不负责编写任何代码。**

当用户提出开发需求时，我的职责是：
1. **理解需求** - 分析用户意图，确认功能范围
2. **分配任务** - 根据任务类型，委派给合适的团队成员
3. **协调沟通** - 在团队成员之间传递信息和上下文
4. **跟踪进度** - 使用 TodoWrite 工具跟踪任务状态
5. **质量把关** - 确保交付结果符合要求

**团队成员分工：**
- **Architect** - 架构设计和技术决策
- **Planner** - 制定详细实施计划
- **Backend Developer** - 后端代码实现（API、数据库、服务等）
- **Frontend Developer** - 前端代码实现（组件、页面、交互等）

## 项目概述

**npm-downloader** 是一个基于 Monorepo 的 npm 依赖离线下载工具，带有 Web UI。用户可以通过上传 `pnpm-lock.yaml` 文件或直接指定包名来下载 npm 依赖。项目使用 **pnpm workspaces** 管理 4 个包。

## 包结构

```
packages/
├── core/      # @npm-downloader/core - Lockfile 解析、npm 下载逻辑、CLI 工具
├── server/    # @npm-downloader/server - Express API 服务器（端口 3002）
├── client/    # @npm-downloader/client - Nuxt 3 Web UI（端口 3000）
└── types/     # @npm-downloader/types - 共享的 TypeScript 类型
```

### 包依赖关系
```
@npm-downloader/types
    ↑
    ├── @npm-downloader/core
    ├── @npm-downloader/server
    └── @npm-downloader/client

@npm-downloader/core
    ↑
    └── @npm-downloader/server
```

## 常用命令

### 开发
```bash
# 安装所有依赖
pnpm install

# 启动服务器开发模式（端口 3002，通过 tsx watch 热重载）
pnpm -C packages/server dev

# 启动客户端开发模式（端口 3000，支持 HMR）
pnpm -C packages/client dev

# 启动所有服务（Linux/Mac）
pnpm run dev

# 启动所有服务（Windows）
start-dev.bat
```

### 构建与生产
```bash
# 构建所有包
pnpm run build

# 构建单个包
pnpm -C packages/server build
pnpm -C packages/client build
pnpm -C packages/core build

# 生产环境启动（Linux/Mac）
./start.sh

# 生产环境启动（Windows）
start.bat
```

### 测试
```bash
# 运行所有测试
pnpm run test

# Core 包测试（Jest）
pnpm -C packages/core run test

# Server API 测试（Vitest）
pnpm -C packages/server run test
```

### 工具命令
```bash
# 清理所有 node_modules
pnpm run clean

# Turborepo 命令
turbo run build          # 构建所有包（带缓存）
turbo run build --force  # 强制全量构建（忽略缓存）
turbo run dev --filter=@npm-downloader/server  # 仅启动 server 开发
turbo run clean          # 清理所有 dist 目录
```

## 架构概览

### 后端 (packages/server)
- **入口文件**: `src/app.ts`
- **框架**: Express + routing-controllers（基于装饰器的路由）
- **控制器**: `LockfileController`、`PackageController`、`DownloadController`、`HistoryController`、`LogController`
- **服务**:
  - `taskLogger` - 任务日志记录（支持文件持久化）
  - `taskStatus` - 内存中的任务状态管理
  - `logStreamer` - SSE（Server-Sent Events）实时日志流
- **中间件**: `dirs`（目录配置）、`upload`（multer 文件上传）

### 前端 (packages/client)
- **框架**: Nuxt 3 + Vue 3 Composition API
- **UI 组件库**: Nuxt UI (Tailwind CSS)
- **实时通信**: 通过 EventSource 实现 SSE 日志流
- **组合式函数**:
  - `useTaskManager` - 任务 CRUD 操作
  - `useLogStream` - SSE 连接（支持自动重连和心跳检测）
  - `usePolling` - 任务状态轮询
- **布局**: PC 优先设计，左侧 320px 侧边栏 + 主内容区域

### 核心 (packages/core)
- **Lockfile 解析**: `@pnpm/lockfile-file`
- **包下载**: `pacote`（npm registry 客户端）
- **并发控制**: `p-limit`（最多 10 个并发下载）
- **重试逻辑**: 3 次重试，指数退避
- **打包**: `archiver` 创建 ZIP 文件
- **CLI**: 内置 CLI 在 `dist/cli.js`（构建后）

### 数据流
1. 用户上传 lockfile 或指定包名 → 服务器解析依赖
2. 创建下载任务 → 并发下载 npm 包（最多 10 个）
3. 通过 SSE 实时流式传输日志
4. 将包打包成 ZIP
5. 用户下载 ZIP 文件

### 数据持久化
- **历史记录**: `packages/server/data/history.json`
- **任务日志**: `packages/server/data/logs/:taskId.log`
- **环境变量**: `DATA_DIR`、`UPLOAD_DIR`、`TEMP_DIR`

### 类型共享
在任何包中从 `@npm-downloader/types` 导入共享类型：
```typescript
import type { HistoryItem } from "@npm-downloader/types";
```

## 技术栈总结

| 层级 | 技术 |
|------|------|
| 后端框架 | Express + routing-controllers |
| npm 下载 | pacote |
| 打包 | archiver |
| 文件上传 | multer |
| 前端框架 | Nuxt 3 + Vue 3 |
| UI 组件 | Nuxt UI (Tailwind CSS) |
| 实时日志 | SSE (EventSource) |
| 并发控制 | p-limit |
| Lockfile 解析 | @pnpm/lockfile-file |
| 测试 | Jest (core)、Vitest (server) |
| 热重载 | tsx watch (server)、HMR (client) |
| 任务编排 | Turborepo |
| 包管理器 | pnpm workspaces |

## 重要说明

- Core 包使用 ESM（`"type": "module"`），其他包使用 CommonJS
- 服务器使用 `tsx watch` 实现开发热重载
- 客户端使用 Nuxt 3 内置的 HMR
- 临时文件每小时清理一次（最大保留时间：1 小时）
- 提供的 Windows 批处理文件：`start-dev.bat`、`start.bat`、`stop.bat`

## AI 团队协作

项目配置了四个专门的 AI Agent 来协助不同类型的工作：

### Architect Agent
- **位置**: `.claude/agents/architect.md`
- **模型**: Opus
- **职责**: 软件架构专家 - 系统设计、可扩展性、技术决策
- **何时使用**:
  - 规划新功能时
  - 重构大型系统时
  - 进行架构决策时
  - 评估技术权衡时
  - 识别可扩展性瓶颈时

### Planner Agent
- **位置**: `.claude/agents/planner.md`
- **模型**: Opus
- **职责**: 规划专家 - 复杂功能和重构的详细实施计划
- **何时使用**:
  - 功能实现需求分析时
  - 架构变更规划时
  - 复杂重构任务时
  - 需要识别依赖和潜在风险时
  - 制定最佳实施顺序时

### Backend Developer Agent
- **位置**: `.claude/agents/backend-developer.md`
- **模型**: Sonnet
- **职责**: 后端开发专家 - 可扩展 API 开发、微服务架构
- **何时使用**:
  - 开发后端 API 服务时
  - 设计数据库架构时
  - 实现认证授权时
  - 性能优化和安全加固时
  - 编写后端测试时

### Frontend Developer Agent
- **位置**: `.claude/agents/frontend-developer.md`
- **模型**: Sonnet
- **职责**: 前端开发专家 - React/Vue/Angular、UI 组件、用户体验
- **何时使用**:
  - 开发前端组件时
  - 实现用户界面时
  - 集成状态管理时
  - 优化前端性能时
  - 实现实时功能时

**使用方式**:
- Architect 和 Planner 使用 Opus 模型（高复杂度任务）
- Backend 和 Frontend Developer 使用 Sonnet 模型（高效执行）
- 这些 Agent 会在适当的时候自动激活，或使用 Task 工具手动调用
