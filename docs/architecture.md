# 架构设计

## 项目概述

npm-downloader 是一个 Monorepo 架构的 npm 依赖离线下载工具，支持通过 Web UI 上传 `pnpm-lock.yaml` 或指定包名来下载依赖包。

## Monorepo 结构

项目使用 pnpm workspace 管理：

```
npm-downloader/
├── packages/
│   ├── core/          # 核心包：解析和下载逻辑
│   ├── server/        # 服务端：Express API
│   ├── client/        # 前端：Nuxt 3 Web UI
│   └── types/         # 类型定义：共享 TypeScript 类型
├── docs/              # 项目文档
└── pnpm-workspace.yaml
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

## 技术栈

### 服务端

- **框架**: Express + routing-controllers
- **npm 下载**: pacote
- **文件打包**: archiver
- **文件上传**: multer
- **并发控制**: p-limit

### 前端

- **框架**: Nuxt 3 + Vue 3 Composition API
- **UI 组件**: Nuxt UI (Tailwind CSS)
- **实时通信**: SSE (Server-Sent Events)
- **状态管理**: Composables

### 核心

- **lockfile 解析**: @pnpm/lockfile-file
- **测试**: Vitest

## 目录结构

```
packages/
├── core/                      # 核心包
│   ├── src/
│   │   ├── parser.ts         # lockfile 解析
│   │   ├── downloader.ts     # npm 包下载
│   │   ├── utils.ts          # 工具函数
│   │   └── logger.ts         # 日志工具
│   └── __test__/             # 单元测试
│
├── server/                    # 服务端
│   └── src/
│       ├── app.ts            # 应用入口
│       ├── controllers/      # 路由控制器
│       │   ├── lockfileController.ts    # lockfile 上传
│       │   ├── packageController.ts    # 单包下载
│       │   ├── downloadController.ts    # 文件下载
│       │   ├── historyController.ts     # 历史记录
│       │   └── logController.ts         # 日志流
│       ├── services/         # 业务逻辑
│       │   ├── taskLogger.ts        # 任务日志记录
│       │   ├── taskStatus.ts        # 任务状态管理
│       │   └── logStreamer.ts       # SSE 推流
│       ├── middleware/       # 中间件
│       │   ├── dirs.ts              # 目录配置
│       │   └── upload.ts            # 文件上传
│       ├── history.ts        # 历史记录管理
│       └── data/             # 持久化数据
│
├── client/                    # 前端
│   ├── components/           # 组件
│   │   ├── logs/            # 日志相关组件
│   │   ├── TaskCard.vue     # 任务卡片
│   │   ├── TaskHistory.vue  # 任务历史
│   │   └── ...
│   ├── composables/         # 组合式函数
│   │   ├── useTaskManager.ts    # 任务管理
│   │   ├── useLogStream.ts      # SSE 日志流
│   │   └── usePolling.ts        # 状态轮询
│   ├── layouts/             # 布局
│   │   └── default.vue      # 默认布局
│   └── pages/               # 页面
│       └── index.vue        # 首页
│
└── types/                    # 类型定义
    └── src/
        └── index.ts         # 共享类型
```

## 前端架构

### 组件结构

```
components/
├── logs/                      # 日志模块
│   ├── LogViewer.vue         # 日志查看器弹窗
│   ├── LogFilters.vue        # 日志过滤器
│   ├── LogStats.vue          # 日志统计
│   └── LogLine.vue           # 单行日志
├── TaskCard.vue              # 历史任务卡片
├── TaskHistory.vue           # 任务历史列表
├── ActiveTaskCard.vue        # 活动任务卡片
├── UploadPanel.vue           # lockfile 上传面板
└── PackageDownload.vue       # 单包下载（带搜索）
```

### Composables

| Composable | 功能 |
|------------|------|
| `useTaskManager` | 任务管理（创建、查询历史、删除） |
| `useLogStream` | SSE 日志流连接管理（自动重连、心跳检测） |
| `usePolling` | 任务状态轮询 |

### 页面布局

- **PC 优先设计**：左侧 320px 侧边栏 + 右侧历史记录网格
- **全屏布局**：使用 flexbox 实现高度自适应
- **主题支持**：亮色/暗色主题切换

## 服务端架构

### 路由控制

| Controller | 路由前缀 | 功能 |
|------------|----------|------|
| `LockfileController` | `/api` | lockfile 上传和下载 |
| `PackageController` | `/api` | 单包下载 |
| `DownloadController` | `/api` | 文件下载 |
| `HistoryController` | `/api` | 历史记录管理 |
| `LogController` | `/api` | 日志查询 |

### 服务层

| Service | 功能 |
|---------|------|
| `taskLogger` | 任务日志记录（支持持久化） |
| `taskStatus` | 任务状态管理（内存存储） |
| `logStreamer` | SSE 推流服务 |

### 中间件

| Middleware | 功能 |
|------------|------|
| `dirs` | 工作目录配置和初始化 |
| `upload` | multer 文件上传配置 |

## 数据流

### 上传 lockfile 下载流程

```
用户上传文件
    ↓
multer 保存文件
    ↓
创建临时目录，复制为 pnpm-lock.yaml
    ↓
parseLockFile 解析依赖
    ↓
创建下载任务
    ↓
并发下载 npm 包（p-limit: 10）
    ↓
打包成 zip（archiver）
    ↓
返回下载链接
```

### 实时日志流

```
用户打开日志查看器
    ↓
建立 SSE 连接（EventSource）
    ↓
发送历史日志
    ↓
实时推送新日志
    ↓
任务结束，关闭连接
```

## 数据持久化

### 存储位置

目录支持通过环境变量自定义，详见 [目录配置](guides/directory-configuration.md)。

默认位置：
- **历史记录**: `packages/server/data/history.json`
- **任务日志**: `packages/server/data/logs/:taskId.log`

环境变量：
- `DATA_DIR`: 数据目录根路径
- `UPLOAD_DIR`: 上传文件临时目录
- `TEMP_DIR`: 临时文件目录

详见 [持久化实现](development/persistence.md)和 [目录配置指南](guides/directory-configuration.md)。

## 类型共享

使用 `@npm-downloader/types` 包实现跨包类型共享：

```typescript
// types/src/index.ts
export interface HistoryItem {
  taskId: string;
  type: "lockfile" | "package";
  status: "pending" | "processing" | "completed" | "failed";
  // ...
}
```

在各个包中引用：

```typescript
import type { HistoryItem } from "@npm-downloader/types";
```

详见 [类型共享实现](development/type-sharing.md)

## 并发控制

使用 `p-limit` 控制并发下载数量：

```typescript
const limit = pLimit(10); // 最多 10 个并发下载

const downloadPromises = packages.map((pkg) => {
  return limit(async () => {
    await downloadTgzFile(pkg, taskDir);
  });
});
```

## 错误处理

### 下载重试

每个包下载最多重试 3 次，使用指数退避：

```typescript
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    await downloadTgzFile(pkg, taskDir);
    return;
  } catch (error) {
    if (attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}
```

### 任务状态

任务失败时会记录错误日志并更新状态：

```typescript
setTaskStatus(taskId, "failed", "Download failed");
addTaskLog(taskId, "error", `Failed: ${error.message}`);
```

## 清理机制

服务器每小时运行一次清理任务，删除超过 1 小时的临时文件：

```typescript
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
const MAX_AGE = 60 * 60 * 1000; // 1 hour
```

## 开发相关

### 热重载

- **服务端**: 使用 `tsx watch` 实现热重载
- **前端**: Nuxt 3 内置 HMR

### 类型提示

VSCode 中需要安装 `Volar` 插件以获得完整的类型提示。

创建 `packages/client/tsconfig.json`：

```json
{
  "extends": "./.nuxt/tsconfig.json"
}
```
