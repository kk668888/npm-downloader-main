# 目录配置

支持通过环境变量自定义工作目录和数据目录的路径。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `UPLOAD_DIR` | 上传文件临时存储目录 | `./uploads` |
| `TEMP_DIR` | 临时文件目录（下载任务、临时文件等） | `./temp` |
| `DATA_DIR` | 数据目录（历史记录、任务日志等） | `./packages/server/data` |
| `PORT` | 服务端口 | `3002` |

## 使用方式

### 1. 使用默认配置

```bash
pnpm -C packages/server dev
```

目录结构：
```
npm-downloader/
├── uploads/           # 上传的 lockfile
├── temp/              # 下载任务临时文件
└── packages/server/
    └── data/          # 历史记录、日志
```

### 2. 自定义目录（环境变量）

```bash
UPLOAD_DIR=/data/uploads \
TEMP_DIR=/data/temp \
DATA_DIR=/data/app/data \
pnpm -C packages/server dev
```

### 3. 生产环境部署

```bash
# Docker 挂载卷
docker run -v /mnt/storage/uploads:/uploads \
           -v /mnt/storage/temp:/temp \
           -v /mnt/storage/data:/app/data \
           -e UPLOAD_DIR=/uploads \
           -e TEMP_DIR=/temp \
           -e DATA_DIR=/app/data \
           npm-downloader-server
```

### 4. 使用 .env 文件

服务器启动时会自动加载 `.env` 文件（需要 dotenv 支持）。

创建 `.env` 文件：

```bash
PORT=3002
UPLOAD_DIR=./uploads
TEMP_DIR=./temp
DATA_DIR=./data
```

**提示**: 可以参考 `.env.example` 文件创建配置：
```bash
cp .env.example .env
# 然后编辑 .env 文件修改配置
```

## 目录用途

### uploads/

- **用途**: multer 上传的 lockfile 临时存储
- **生命周期**: 上传处理后立即删除
- **清理**: 服务端代码自动清理

### temp/

- **用途**: 下载任务的临时文件
  - 解压后的 .tgz 包
  - 下载过程中的临时文件
  - 最终生成的 .zip 文件
- **生命周期**: 服务每小时清理一次（1 小时过期）
- **清理**: 自动清理任务

### data/

- **用途**: 持久化数据
  - `history.json`: 历史下载记录
  - `logs/:taskId.log`: 任务日志文件
- **生命周期**: 永久保留（手动清理）
- **管理**: 通过 API 删除

## 迁移说明

如果你之前使用的是旧版本（`temp/history.json` 和 `temp/logs/`），升级后：

1. **默认行为**: 数据目录变为 `packages/server/data/`
2. **数据迁移**: 可以通过环境变量指定旧目录

```bash
# 使用旧目录（保持兼容）
DATA_DIR=./temp pnpm -C packages/server dev
```

3. **迁移数据**（可选）:
```bash
# 复制历史记录
mkdir -p packages/server/data
cp temp/history.json packages/server/data/
cp -r temp/logs packages/server/data/
```
