# npm-downloader 文档

## 目录

- [快速开始](#快速开始)
- [API 文档](api.md) - REST API 接口说明
- [架构设计](architecture.md) - 项目架构和设计说明
- [开发指南](#开发指南)
- [使用指南](#使用指南)
- [更多资源](#更多资源)

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm

### 安装

```bash
pnpm install
```

### 启动服务

1. 启动服务端（默认端口 `3002`）

```bash
pnpm -C packages/server dev
```

2. 启动前端（默认端口 `3000`）

```bash
pnpm -C packages/client dev
```

3. 访问前端：`http://localhost:3000`

### 构建

```bash
# 构建所有 packages
pnpm run build

# 单独构建
pnpm -C packages/server run build
pnpm -C packages/client run build
```

## API 文档

详细的 API 文档请查看 [API 文档](api.md)，包含：

- 下载相关接口
- 历史记录接口
- 日志流（SSE）接口
- 健康检查接口

## 架构设计

详细的架构说明请查看 [架构设计文档](architecture.md)，包含：

- Monorepo 结构
- 技术栈
- 目录结构
- 前端组件架构

## 使用指南

- [目录配置](guides/directory-configuration.md) - 自定义工作目录和数据目录
- [持久化使用](guides/persistence.md) - 数据持久化功能使用

## 开发指南

### 实现文档

- [进度追踪实现](development/progress.md) - 下载进度追踪功能的实现
- [持久化实现](development/persistence.md) - 数据持久化功能的实现
- [类型共享实现](development/type-sharing.md) - Monorepo 类型共享的实现

### 使用指南

- [持久化使用指南](guides/persistence.md) - 如何使用数据持久化功能

### 测试

```bash
# Core 包测试
pnpm -C packages/core run test

# Server API 测试
pnpm -C packages/server run test
```

## 项目规划

- [路线图](roadmap.md) - 项目发展规划
- [待办事项](todo.md) - 待办事项列表

## 许可证

ISC
