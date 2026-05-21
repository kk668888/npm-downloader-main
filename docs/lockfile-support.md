# Lockfile 支持场景清单

## 支持的 lockfile 格式

| 格式 | 状态 | 说明 |
|------|------|------|
| pnpm-lock.yaml (v6+) | ✅ 完全支持 | 通过 `@pnpm/lockfile-file` 解析 |
| pnpm-lock.yaml (v5) | ✅ 兼容 | 向下兼容 |

## 依赖类型支持矩阵

lockfile 中的依赖按来源分类，只有 registry 来源的包会被下载：

| 依赖协议 | 示例 | 下载 | 说明 |
|----------|------|------|------|
| **npm registry** | `lodash@4.17.21` | ✅ | 从 registry.npmjs.org 下载 tgz |
| **scoped** | `@types/node@20.0.0` | ✅ | 作用域包，从 registry 下载 |
| **workspace** | `workspace:*` | ❌ | Monorepo 内部包，需在本地构建 |
| **file** | `file:../shared` | ❌ | 本地文件路径引用 |
| **link** | `link:./packages/utils` | ❌ | 符号链接，指向本地目录 |
| **git** | `git+https://github.com/...` | ❌ | Git 仓库引用 |
| **github** | `github:user/repo` | ❌ | GitHub 简写 |
| **alias** | `npm:other-pkg@1.0.0` | ❌ | npm 别名 |
| **catalog** | `catalog:react19` | ❌ | pnpm catalog 协议 |

## 上传限制

| 限制项 | 值 | 说明 |
|--------|------|------|
| 文件大小 | 10 MB | 超过返回 HTTP 413 |
| 文件格式 | pnpm-lock.yaml | 非 YAML 格式会解析失败 |

## 跳过依赖的展示

当 lockfile 包含非 registry 依赖时，系统会：

1. **日志记录**：任务日志中记录跳过的依赖数量和类型
2. **审计报告**：弹窗顶部显示跳过依赖的横幅，按类型分类统计
3. **不影响下载**：仅跳过无法从 npm registry 下载的包，其他包正常下载

## 典型场景

### 场景 1：纯 registry 依赖（最常见）

```yaml
packages:
  /lodash/4.17.21:
    resolution: ...
  /express/4.18.2:
    resolution: ...
```

**结果**：全部下载，无跳过。

### 场景 2：Monorepo 项目（含 workspace 依赖）

```yaml
packages:
  /lodash/4.17.21:
    resolution: ...
  'my-app':
    resolution: { directory: apps/web, type: directory }
    dependencies:
      my-utils: 'workspace:*'
  'my-utils':
    resolution: { directory: packages/utils, type: directory }
```

**结果**：`my-app` 和 `my-utils` 被跳过（workspace 类型），`lodash` 正常下载。审计报告显示 "2 个依赖未包含在下载中: 工作区: 2"。

### 场景 3：混合来源

```yaml
packages:
  /react/18.2.0:
    resolution: ...
  'my-plugin':
    resolution: { directory: plugins/x, type: directory }
    dependencies:
      core-lib: 'file:../core'
      tool: 'github:org/tool#v1.0'
```

**结果**：`react` 正常下载，`my-plugin`（workspace）、`core-lib`（file）、`tool`（git）被跳过。
