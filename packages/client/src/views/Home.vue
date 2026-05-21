<template>
  <div class="flex gap-6 h-full min-h-0">
    <!-- Left Sidebar - Download Operations -->
    <div
      class="w-80 flex-shrink-0 flex flex-col gap-4 overflow-y-auto scrollbar-thin pr-1 py-1"
    >
      <!-- Lockfile Upload -->
      <Card>
        <template #header>
          <div class="flex items-center gap-2">
            <Icon
              name="i-heroicons-document"
              class="w-5 h-5 text-accent"
            />
            <h3 class="font-semibold">Lockfile 上传</h3>
          </div>
        </template>
        <UploadPanel
          :selected-file="file"
          :uploading="uploading"
          :busy="busy"
          :task-id="taskId"
          :progress="taskProgress"
          :download-url="downloadUrl"
          @select-file="file = $event"
          @upload="handleUpload"
          @view-logs="openLogViewer"
        />
      </Card>

      <!-- Single Package Download -->
      <Card>
        <template #header>
          <div class="flex items-center gap-2">
            <Icon name="i-heroicons-cube" class="w-5 h-5 text-accent" />
            <h3 class="font-semibold">单个包下载</h3>
          </div>
        </template>
        <PackageDownload
          :package-name="packageName"
          :downloading="downloadingPackage"
          :busy="busy"
          :task-id="packageTaskId"
          :status-message="packageStatusMessage"
          :progress="packageProgress"
          :download-url="packageDownloadUrl"
          @update:package-name="packageName = $event"
          @download="handleDownloadPackage"
          @view-logs="openLogViewer"
        />
      </Card>

      <!-- Current Active Task -->
      <Card v-if="activeTask">
        <template #header>
          <div class="flex items-center gap-2">
            <Icon
              name="i-heroicons-arrow-path"
              class="w-5 h-5 text-accent animate-spin"
            />
            <h3 class="font-semibold">当前任务</h3>
          </div>
        </template>
        <CurrentTask
          :task-id="activeTask.taskId"
          :type="activeTask.type"
          :is-auditing="activeTask.isAuditing"
          :progress="activeTask.progress"
          :download-url="activeTask.downloadUrl"
          :server-base-url="serverBaseUrl"
          @view-logs="openLogViewer"
          @reopen-audit="reopenAudit"
        />
      </Card>
    </div>

    <!-- Right Main Area - History -->
    <div class="flex-1 min-w-0 flex flex-col">
      <TaskHistory
        :items="historyItems"
        :loading="historyLoading"
        :error="historyError"
        :server-base-url="serverBaseUrl"
        :format-time="formatTime"
        :delete-item="handleDeleteItem"
        :clear-all="handleClearAll"
        @refresh="refreshHistory"
        @view-logs="openLogViewer"
        @view-audit="handleViewHistoryAudit"
        @deleted="handleDeleted"
        @clear-all="refreshHistory"
      />
    </div>
  </div>

  <!-- Log Viewer Modal -->
  <LogsLogViewer
    :open="logViewerOpen"
    :task-id="currentLogTaskId"
    :server-base-url="serverBaseUrl"
    @close="closeLogViewer"
  />

  <!-- Audit Report Panel -->
  <AuditReport
    :open="showingAuditReport"
    :report="auditReport"
    @confirm="handleAuditConfirm"
    @cancel="handleAuditCancel"
  />
</template>

<script setup lang="ts">
import type { HistoryItem } from "@npm-downloader/types";
import Card from '../components/ui/Card.vue';
import Icon from '../components/ui/Icon.vue';
import UploadPanel from '../components/UploadPanel.vue';
import PackageDownload from '../components/PackageDownload.vue';
import CurrentTask from '../components/CurrentTask.vue';
import TaskHistory from '../components/TaskHistory.vue';
import LogsLogViewer from '../components/logs/LogViewer.vue';
import AuditReport from '../components/AuditReport.vue';
import { useToast } from '../composables/useToast';
import { useTaskManager } from '../composables/useTaskManager';
import { usePolling } from '../composables/usePolling';

// 动态获取服务器地址：使用当前访问的主机名 + 后端端口
const serverBaseUrl = `http://${window.location.hostname}:3002`;
const toast = useToast();

// Task Manager
const {
  uploading,
  downloadingPackage,
  file,
  taskId,
  taskProgress,
  taskStatusText,
  packageName,
  packageTaskId,
  packageStatusMessage,
  packageProgress,
  downloadUrl,
  packageDownloadUrl,
  uploadFile,
  downloadSinglePackage,
  deleteHistoryItem,
  auditReport,
  showingAuditReport,
  isAwaitingAudit,
  confirmAudit,
  resumePolling,
  reopenAudit,
} = useTaskManager(serverBaseUrl);

// Polling (History)
const {
  historyItems,
  historyLoading,
  historyError,
  formatTime,
  refreshHistory,
  startPolling,
} = usePolling(serverBaseUrl);

// Log Viewer
const logViewerOpen = ref(false);
const currentLogTaskId = ref("");

// 任意任务进行中时禁用两个入口（互斥）
const busy = computed(() => uploading.value || downloadingPackage.value);

// Active Task (computed from current downloads)
const activeTask = computed(() => {
  // Lockfile upload task
  if (taskId.value && uploading.value) {
    return {
      taskId: taskId.value,
      type: "lockfile" as const,
      status: taskStatusText.value,
      isAuditing: isAwaitingAudit.value,
      progress: taskProgress.value,
      downloadUrl: downloadUrl.value,
    };
  }
  // Package download task
  if (packageTaskId.value && downloadingPackage.value) {
    return {
      taskId: packageTaskId.value,
      type: "package" as const,
      status: packageStatusMessage.value,
      isAuditing: isAwaitingAudit.value,
      progress: packageProgress.value,
      downloadUrl: packageDownloadUrl.value,
    };
  }
  return null;
});

const openLogViewer = (taskId: string) => {
  currentLogTaskId.value = taskId;
  logViewerOpen.value = true;
};

const closeLogViewer = () => {
  logViewerOpen.value = false;
};

// 审计报告确认处理 — 确认成功才关闭弹窗并恢复轮询，失败提示用户
const handleAuditConfirm = async () => {
  const tid = taskId.value || packageTaskId.value;
  if (tid) {
    const success = await confirmAudit(tid);
    if (success) {
      showingAuditReport.value = false;
      // 确认成功后恢复轮询，继续跟踪任务进度
      resumePolling();
    } else {
      toast.add("确认失败", {
        description: "审计确认失败，请重试或刷新页面",
        color: "red",
        icon: "i-heroicons-x-circle",
      });
    }
  }
};

const handleAuditCancel = () => {
  showingAuditReport.value = false;
  // 不放弃任务 — 只关闭弹窗，恢复轮询继续跟踪
  resumePolling();
};

// Handle delete (called from TaskCard via TaskHistory)
const handleDeleteItem = async (taskId: string) => {
  try {
    const success = await deleteHistoryItem(taskId);
    if (success) {
      toast.add("成功", {
        description: "历史记录已成功删除",
        color: "green",
        icon: "i-heroicons-check-circle",
      });
      refreshHistory();
    } else {
      toast.add("错误", {
        description: "删除历史记录失败",
        color: "red",
        icon: "i-heroicons-x-circle",
      });
    }
    return success;
  } catch (error) {
    toast.add("错误", {
      description: error instanceof Error ? error.message : "发生了意外错误",
      color: "red",
      icon: "i-heroicons-x-circle",
    });
    return false;
  }
};

// Handle deleted event (refresh history after delete)
const handleDeleted = () => {
  refreshHistory();
};

// 从历史记录中打开审计报告
const handleViewHistoryAudit = (taskId: string) => {
  const item = historyItems.value.find((h) => h.taskId === taskId);
  if (item?.auditReport) {
    auditReport.value = item.auditReport;
    showingAuditReport.value = true;
  }
};

// 清空所有历史记录
const handleClearAll = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${serverBaseUrl}/api/history`, {
      method: "DELETE",
    });
    if (response.ok) {
      toast.add("成功", {
        description: "历史记录已全部清空",
        color: "green",
        icon: "i-heroicons-check-circle",
      });
      return true;
    } else {
      toast.add("错误", {
        description: "清空历史记录失败",
        color: "red",
        icon: "i-heroicons-x-circle",
      });
      return false;
    }
  } catch (error) {
    toast.add("错误", {
      description: error instanceof Error ? error.message : "发生了意外错误",
      color: "red",
      icon: "i-heroicons-x-circle",
    });
    return false;
  }
};


// Task handlers
const handleUpload = () => {
  uploadFile(
    () => {},
    () => refreshHistory(),
    (error: Error) => {
      toast.add("上传失败", {
        description: error.message,
        color: "red",
        icon: "i-heroicons-x-circle",
      });
    }
  );
};

const handleDownloadPackage = () => {
  downloadSinglePackage(
    () => {},
    () => refreshHistory(),
    (error: Error) => {
      toast.add("下载失败", {
        description: error.message,
        color: "red",
        icon: "i-heroicons-x-circle",
      });
      refreshHistory();
    }
  );
};

// Initialize
onMounted(() => {
  refreshHistory();
  startPolling(5000);
});
</script>
