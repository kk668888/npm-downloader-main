# Dark Industrial Theme

暗色工业风 UI 主题，适用于工具类/DevOps 类 Web 应用。

## 色板

### 灰阶（Slate）

深海军蓝底色，从接近纯黑到近白，共 10 级。

| Token | 色值 | 示例 | 用途 |
|-------|------|------|------|
| `base-950` | `#0b1120` | ![](https://via.placeholder.com/16/0b1120/0b1120) | 页面背景 |
| `base-900` | `#111827` | ![](https://via.placeholder.com/16/111827/111827) | 卡片、面板、模态框背景 |
| `base-800` | `#1e293b` | ![](https://via.placeholder.com/16/1e293b/1e293b) | 边框、分隔线、输入框边框 |
| `base-700` | `#334155` | ![](https://via.placeholder.com/16/334155/334155) | 滚动条、次要边框、禁用态 |
| `base-600` | `#475569` | ![](https://via.placeholder.com/16/475569/475569) | 次要文字、时间戳、图标 |
| `base-500` | `#64748b` | ![](https://via.placeholder.com/16/64748b/64748b) | 占位文字、辅助图标 |
| `base-400` | `#94a3b8` | ![](https://via.placeholder.com/16/94a3b8/94a3b8) | 辅助文字 |
| `base-300` | `#cbd5e1` | ![](https://via.placeholder.com/16/cbd5e1/cbd5e1) | 次要标题 |
| `base-200` | `#e2e8f0` | ![](https://via.placeholder.com/16/e2e8f0/e2e8f0) | 高亮文字、列表项标题 |
| `base-100` | `#f1f5f9` | ![](https://via.placeholder.com/16/f1f5f9/f1f5f9) | 主标题 |

### 语义色

| Token | 色值 | 示例 | 用途 |
|-------|------|------|------|
| `accent` | `#22d3ee` | ![](https://via.placeholder.com/16/22d3ee/22d3ee) | 主强调色，按钮、链接、拖拽高亮 |
| `accent-dim` | `#0891b2` | ![](https://via.placeholder.com/16/0891b2/0891b2) | 强调暗色，hover 态、图标底色 |
| `success` | `#34d399` | ![](https://via.placeholder.com/16/34d399/34d399) | 成功状态、完成、已连接 |
| `warning` | `#22d3ee` | ![](https://via.placeholder.com/16/22d3ee/22d3ee) | 跳过/警告（同 accent，cyan） |
| `danger` | `#f87171` | ![](https://via.placeholder.com/16/f87171/f87171) | 失败、错误、删除 |
| `danger-dim` | `#991b1b` | ![](https://via.placeholder.com/16/991b1b/991b1b) | 失败暗色，危险背景 |

## Tailwind CSS v4 配置

```css
@theme {
  --color-base-950: #0b1120;
  --color-base-900: #111827;
  --color-base-800: #1e293b;
  --color-base-700: #334155;
  --color-base-600: #475569;
  --color-base-500: #64748b;
  --color-base-400: #94a3b8;
  --color-base-300: #cbd5e1;
  --color-base-200: #e2e8f0;
  --color-base-100: #f1f5f9;

  --color-accent: #22d3ee;
  --color-accent-dim: #0891b2;
  --color-success: #34d399;
  --color-warning: #22d3ee;
  --color-danger: #f87171;
  --color-danger-dim: #991b1b;

  --font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', ui-monospace, monospace;
  --font-sans: 'DM Sans', 'Noto Sans SC', system-ui, -apple-system, sans-serif;
}
```

## 字体

| 用途 | 字体 | 备选 | npm 包 |
|------|------|------|--------|
| 等宽（代码/日志） | JetBrains Mono | Fira Code, SF Mono | `@fontsource-variable/jetbrains-mono` |
| 正文（UI 文字） | DM Sans | Noto Sans SC, system-ui | `@fontsource-variable/dm-sans` |

CSS 导入：

```css
@import "@fontsource-variable/jetbrains-mono";
@import "@fontsource-variable/dm-sans";
```

## 组件模式

### 按钮

- **主按钮**：`bg-accent text-base-950`（青色实心，深色文字）
- **禁用**：`bg-base-800 text-base-500 cursor-not-allowed`
- **危险**：`text-danger hover:bg-danger/10`

### 卡片

- **默认**：`bg-base-900/40 border border-base-800 rounded-lg`
- **悬浮**：`hover:bg-base-900/70`
- **激活/展开**：`bg-base-900 border-base-700`

### 状态指示

- 圆点：`w-1.5 h-1.5 rounded-full` + `bg-success` / `bg-danger` / `bg-base-500`
- 徽标：`px-1 py-0.5 rounded text-[9px] font-medium` + `bg-{status}/10 text-{status}`

### 终端/日志

- 容器：`bg-base-900 border border-base-800 rounded-lg font-mono text-xs`
- 交通灯标题栏：三个圆点 `w-2 h-2 rounded-full`（红/黄/绿）
- 文字颜色按类型：info=`text-base-400`，success=`text-success`，skip=`text-warning`，error=`text-danger`

### 滚动条

```css
.scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: var(--color-base-700) transparent;
}
.scrollbar-thin::-webkit-scrollbar { width: 5px; }
.scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
.scrollbar-thin::-webkit-scrollbar-thumb { background: var(--color-base-700); border-radius: 9999px; }
.scrollbar-thin::-webkit-scrollbar-thumb:hover { background: var(--color-base-600); }
```

### 布局

- 全屏：`h-screen flex flex-col bg-base-950 overflow-hidden`
- Header：`px-6 py-3.5 border-b border-base-800/60 flex-shrink-0`
- 分栏：左右 flex 布局，`border-r border-base-800/40` 分隔
- 拖拽区域：`border-2 border-dashed border-base-700`，激活态 `border-accent bg-accent/5 scale-[1.01]`

## 设计原则

1. **低对比度层次**：灰阶从背景到文字平滑过渡，不使用纯白纯黑
2. **点缀式强调**：大面积灰底中用 cyan 点亮关键操作
3. **信息密度优先**：小字号（10-13px）、紧凑间距、mono 字体对齐
4. **状态色克制**：成功绿、失败红、跳过青，无多余颜色
5. **无边框感**：用背景色差和透明度区分层级，少用实线边框
