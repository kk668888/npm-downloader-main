# @npm-downloader/types

Shared TypeScript type definitions for npm-downloader monorepo.

## Types

### TaskType
Task type: `"lockfile" | "package"`

### TaskStatus
Task status: `"pending" | "processing" | "completed" | "failed"`

### HistoryItem
```typescript
interface HistoryItem {
  taskId: string;
  type: TaskType;
  status: TaskStatus;
  message?: string;
  createdAt: number;
  updatedAt: number;
  zipUrl?: string;
  packageName?: string;
  packagesCount?: number;
}
```

### TaskLog
```typescript
interface TaskLog {
  taskId: string;
  timestamp: number;
  level: "info" | "error" | "warn";
  message: string;
}
```

### TaskStatusInfo
```typescript
interface TaskStatusInfo {
  status: TaskStatus;
  message: string;
}
```

## Usage

```typescript
import { HistoryItem, TaskLog, TaskStatus, TaskType } from '@npm-downloader/types';
```
