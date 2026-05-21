<template>
  <div class="flex gap-6 h-full min-h-0">
    <!-- Left Sidebar - Download Operations -->
    <div
      class="w-80 flex-shrink-0 flex flex-col gap-4 overflow-y-auto pr-1 py-1"
    >
      <!-- Lockfile Upload -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-heroicons-document"
              class="w-5 h-5 text-primary-500"
            />
            <h3 class="font-semibold">Lockfile 上传</h3>
          </div>
        </template>
        <UploadPanel
          :selected-file="file"
          :uploading="uploading"
          :task-id="taskId"
          :progress="taskProgress"
          :download-url="downloadUrl"
          @select-file="file = $event"
          @upload="handleUpload"
          @view-logs="openLogViewer"
        />
      </UCard>

      <!-- Single Package Download -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-cube" class="w-5 h-5 text-primary-500" />
            <h3 class="font-semibold">单个包下载</h3>
          </div>
        </template>
        <PackageDownload
          :package-name="packageName"
          :downloading="downloadingPackage"
          :task-id="packageTaskId"
          :status-message="packageStatusMessage"
          :progress="packageProgress"
          :download-url="packageDownloadUrl"
          @update:package-name="packageName = $event"
          @download="handleDownloadPackage"
          @view-logs="openLogViewer"
        />
      </UCard>

      <!-- Current Active Task -->
      <UCard v-if="activeTask">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-heroicons-arrow-path"
              class="w-5 h-5 text-primary-500 animate-spin"
            />
            <h3 class="font-semibold">当前任务</h3>
          </div>
        </template>
        <CurrentTask
          :task-id="activeTask.taskId"
          :type="activeTask.type"
          :progress="activeTask.progress"
          :download-url="activeTask.downloadUrl"
          :server-base-url="serverBaseUrl"
          @view-logs="openLogViewer"
        />
      </UCard>
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
        @refresh="refreshHistory"
        @view-logs="openLogViewer"
        @deleted="handleDeleted"
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
</template>

<script setup lang="ts">
import type { HistoryItem } from "@npm-downloader/types";

const config = useRuntimeConfig();
const serverBaseUrl = config.public?.serverBaseUrl ?? "http://localhost:3002";
const toast = useToast();

// Task Manager
const {
  uploading,
  downloadingPackage,
  file,
  taskId,
  taskProgress,
  packageName,
  packageTaskId,
  packageStatusMessage,
  packageProgress,
  downloadUrl,
  packageDownloadUrl,
  uploadFile,
  downloadSinglePackage,
  deleteHistoryItem,
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

// Active Task (computed from current downloads)
const activeTask = computed(() => {
  // Lockfile upload task
  if (taskId.value && uploading.value) {
    return {
      taskId: taskId.value,
      type: "lockfile" as const,
      progress: taskProgress.value,
      downloadUrl: downloadUrl.value,
    };
  }
  // Package download task
  if (packageTaskId.value && downloadingPackage.value) {
    return {
      taskId: packageTaskId.value,
      type: "package" as const,
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

// Handle delete (called from TaskCard via TaskHistory)
const handleDeleteItem = async (taskId: string) => {
  try {
    const success = await deleteHistoryItem(taskId);
    if (success) {
      toast.add({
        title: "成功",
        description: "历史记录已成功删除",
        color: "green",
        icon: "i-heroicons-check-circle",
      });
      refreshHistory();
    } else {
      toast.add({
        title: "错误",
        description: "删除历史记录失败",
        color: "red",
        icon: "i-heroicons-x-circle",
      });
    }
    return success;
  } catch (error) {
    toast.add({
      title: "错误",
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


// Task handlers
const handleUpload = () => {
  uploadFile(
    () => {},
    () => refreshHistory(),
    (error) => {
      toast.add({
        title: "上传失败",
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
    (error) => {
      toast.add({
        title: "下载失败",
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
