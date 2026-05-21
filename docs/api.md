# API 文档

服务端使用 `routing-controllers`，并在 `packages/server/src/app.ts` 里配置了 `routePrefix: "/api"`。

## 基础信息

- **Base URL**: `http://localhost:3002`
- **路由前缀**: `/api`
- **CORS**: 已启用

## 接口列表

### 下载相关

#### POST /api/upload

上传 `pnpm-lock.yaml` 文件，解析依赖并下载所有包，最后打包成 zip。

**请求：**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: `lockfile` 字段包含 pnpm-lock.yaml 文件

**响应：**
```json
{
  "taskId": "1234567890",
  "message": "Download and compression complete",
  "zipUrl": "/api/download/1234567890"
}
```

**错误响应：**
```json
{
  "error": "No file uploaded"
}
```

```json
{
  "error": "Failed to parse lockfile"
}
```

#### POST /api/download-package

指定包名下载，解析依赖并打包成 zip。

**请求：**
- Method: `POST`
- Content-Type: `application/json`
- Body:
```json
{
  "packageName": "react@18"
}
```

**响应：**
```json
{
  "taskId": "1234567890",
  "message": "Download started",
  "zipUrl": "/api/download/1234567890"
}
```

#### GET /api/task/:taskId

查询任务状态和下载进度。

**响应：**
```json
{
  "status": "processing",
  "message": "Downloading packages... (5/10)",
  "progress": {
    "current": 5,
    "total": 10
  }
}
```

状态值：
- `pending`: 等待中
- `processing`: 处理中
- `completed`: 已完成
- `failed`: 失败

#### GET /api/download/:taskId

下载生成的 zip 文件。

**响应：**
- Content-Type: `application/zip`
- Body: zip 文件二进制数据

### 历史记录

#### GET /api/history

获取历史下载列表。

**响应：**
```json
{
  "items": [
    {
      "taskId": "1234567890",
      "type": "package",
      "status": "completed",
      "message": "Download complete",
      "createdAt": 1234567890000,
      "updatedAt": 1234567890000,
      "zipUrl": "/api/download/1234567890",
      "packageName": "react",
      "packagesCount": 23,
      "packageVersion": "18.2.0"
    }
  ]
}
```

#### DELETE /api/history/:taskId

删除指定的历史记录项。

**响应：**
```json
{
  "success": true
}
```

### 日志流（SSE）

#### GET /api/logs/:taskId/stream

实时日志流，使用 Server-Sent Events (SSE)。

**事件类型：**

| 事件 | 描述 | 数据格式 |
|------|------|----------|
| `history` | 发送历史日志 | `{ logs: TaskLog[] }` |
| `log` | 新日志 | `{ log: TaskLog }` |
| `status` | 任务状态变化 | `{ status: string, message?: string }` |
| `end` | 任务结束 | `{}` |
| `heartbeat` | 心跳（每 15 秒） | `{}` |

**TaskLog 格式：**
```typescript
{
  taskId: string;
  timestamp: number;
  level: "info" | "warn" | "error";
  message: string;
}
```

**示例：**

```javascript
const eventSource = new EventSource('http://localhost:3002/api/logs/1234567890/stream');

eventSource.addEventListener('history', (e) => {
  const data = JSON.parse(e.data);
  console.log('History logs:', data.logs);
});

eventSource.addEventListener('log', (e) => {
  const data = JSON.parse(e.data);
  console.log('New log:', data.log);
});

eventSource.addEventListener('status', (e) => {
  const data = JSON.parse(e.data);
  console.log('Status:', data.status);
});

eventSource.addEventListener('end', () => {
  console.log('Task completed');
  eventSource.close();
});
```

### 健康检查

#### GET /health

检查服务健康状态。

**响应：**
```json
{
  "status": "ok"
}
```

## 错误处理

所有错误响应格式：

```json
{
  "error": "错误描述信息"
}
```

常见 HTTP 状态码：
- `200`: 成功
- `400`: 请求参数错误
- `404`: 资源不存在
- `500`: 服务器内部错误

## 数据持久化

- 历史记录存储位置：`packages/server/data/history.json`
- 任务日志存储位置：`packages/server/data/logs/:taskId.json`

详见 [持久化使用指南](guides/persistence.md)。
