# 持久化功能使用说明

## 🎯 功能概述

npm-downloader 现在支持本地持久化，所有下载历史和任务日志都会自动保存到磁盘，服务器重启后数据不会丢失。

## 📂 文件结构

```
packages/server/temp/
├── history.json              # 历史记录文件（最多50条）
├── logs/                     # 日志文件目录
│   ├── 1767694317261.log    # 任务日志文件（JSONL格式）
│   └── ...
├── 1767694317261/           # 任务临时目录
│   └── *.tgz                # 下载的包文件
└── 1767694317261.zip        # 打包的ZIP文件
```

## 🚀 使用方式

### 零配置使用
无需任何配置，持久化功能默认启用：

```bash
# 启动服务器
cd packages/server
pnpm dev

# 输出会显示：
# Loaded X history items from disk
# Server is running on http://localhost:3002
```

### 查看历史记录

```bash
# 通过 API
curl http://localhost:3002/api/history

# 或直接查看文件
cat packages/server/temp/history.json
```

### 查看任务日志

```bash
# 通过 API
curl http://localhost:3002/api/logs/{taskId}

# 或直接查看文件
cat packages/server/temp/logs/{taskId}.log
```

## 📊 数据格式

### history.json
```json
[
  {
    "taskId": "1767694317261",
    "type": "package",
    "status": "completed",
    "message": "Download complete",
    "createdAt": 1767694317261,
    "updatedAt": 1767694326210,
    "zipUrl": "/api/download/1767694317261",
    "packageName": "axios@1.6.0",
    "packagesCount": 23
  }
]
```

### {taskId}.log (JSONL格式)
```json
{"taskId":"1767694317261","timestamp":1767694317262,"level":"info","message":"Resolving dependencies for axios@1.6.0..."}
{"taskId":"1767694317261","timestamp":1767694324521,"level":"info","message":"Resolved 23 packages"}
{"taskId":"1767694317261","timestamp":1767694324921,"level":"info","message":"✓ Downloaded form-data@4.0.5"}
```

## 🔒 数据安全

### 原子写入
历史记录使用原子写入机制：
1. 先写入临时文件 `history.json.tmp`
2. 写入成功后重命名为 `history.json`
3. 避免写入过程中服务器崩溃导致文件损坏

### 日志追加
日志文件使用追加模式：
- 每条日志单独追加，不影响已有数据
- 即使写入失败，已有日志也不会丢失

## 🗑️ 数据清理

### 手动清理
```bash
# 清理所有历史数据
rm -rf packages/server/temp/*

# 只清理日志文件
rm -rf packages/server/temp/logs/*

# 清理特定任务
rm packages/server/temp/logs/{taskId}.log
rm packages/server/temp/{taskId}.zip
rm -rf packages/server/temp/{taskId}/
```

### 自动清理
服务器已配置自动清理任务（每小时运行）：
- 删除超过 1 小时的临时目录和 ZIP 文件
- **注意**: 日志文件和 history.json 不会自动删除

## 📝 最佳实践

### 1. 定期备份
建议定期备份 `history.json`：
```bash
cp packages/server/temp/history.json packages/server/temp/history.json.backup
```

### 2. 监控磁盘空间
日志文件会随时间增长，建议监控磁盘使用：
```bash
du -sh packages/server/temp/
```

### 3. 日志轮转
对于生产环境，建议实现日志轮转：
- 压缩旧日志文件
- 删除超过 7 天的日志
- 限制日志总大小

## ⚠️ 注意事项

1. **并发安全**: 当前实现不支持多进程并发写入，适合单实例部署
2. **文件锁**: 没有实现文件锁机制，避免同时运行多个服务器实例
3. **性能**: 历史记录较多时（接近50条），加载速度可能略慢
4. **容量**: 每个任务的日志文件大小取决于包数量，大型项目可能产生较大日志文件

## 🔧 故障排查

### 服务器启动时没有加载历史记录
```bash
# 检查文件是否存在
ls -la packages/server/temp/history.json

# 检查文件格式是否正确
cat packages/server/temp/history.json | python3 -m json.tool

# 查看服务器日志
tail -f /tmp/server.log
```

### 日志无法读取
```bash
# 检查日志目录权限
ls -la packages/server/temp/logs/

# 检查日志文件格式
head packages/server/temp/logs/{taskId}.log
```

### 文件写入失败
```bash
# 检查磁盘空间
df -h

# 检查目录权限
ls -la packages/server/temp/
```

## 📚 相关文档
- [PERSISTENCE_IMPLEMENTATION.md](./PERSISTENCE_IMPLEMENTATION.md) - 技术实现细节
- [TODO.md](./TODO.md) - 项目进度和规划
- [README.md](./README.md) - 项目概述
