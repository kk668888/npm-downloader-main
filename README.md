# npm-downloader

一个 npm 依赖离线下载工具（monorepo），支持通过 Web UI 上传 `pnpm-lock.yaml` 或指定包名来下载依赖包。

## 特性

- 📦 **多种下载方式**：支持上传 `pnpm-lock.yaml` 或直接指定包名
- 📊 **实时进度追踪**：下载进度实时显示，支持并发下载数量配置
- 📝 **实时日志流**：基于 SSE 的实时日志推送，支持日志过滤和搜索
- 🔍 **智能搜索**：npm 包名自动补全和版本提示
- 🌓 **主题切换**：支持亮色/暗色主题
- 💾 **本地持久化**：历史记录和任务日志本地持久化存储
- 📦 **版本显示**：历史卡片显示实际下载的包版本

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm

### 安装

```bash
pnpm install
```

### 启动服务

```bash
# 启动服务端（默认端口 3002）
pnpm -C packages/server dev

# 启动前端（默认端口 3000）
pnpm -C packages/client dev
```

访问：`http://localhost:3000`

## 项目结构

```
packages/
├── core/      # 核心包：解析和下载逻辑
├── server/    # 服务端：Express API
├── client/    # 前端：Nuxt 3 Web UI
└── types/     # 类型定义：共享 TypeScript 类型
```

## 文档

详细文档请查看 [docs/](./docs/) 目录：

- [快速开始指南](./docs/README.md)
- [API 文档](./docs/api.md)
- [架构设计](./docs/architecture.md)
- [开发指南](./docs/development/)
- [使用指南](./docs/guides/)
- [路线图](./docs/roadmap.md)

## 测试

```bash
# Core 包测试
pnpm -C packages/core run test

# Server API 测试
pnpm -C packages/server run test
```

## 构建

```bash
# 构建所有 packages
pnpm run build
```

## 技术栈

**服务端**
- Express + routing-controllers
- pacote（npm 包下载）
- archiver（zip 打包）

**前端**
- Nuxt 3 + Vue 3 Composition API
- Nuxt UI（Tailwind CSS 组件库）
- SSE（EventSource）实时日志流

## 许可证

ISC
