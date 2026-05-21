import type { HistoryItem } from "@npm-downloader/types";

export interface TaskProgress {
  current: number;
  total: number;
}

export function useTaskManager(serverBaseUrl: string) {
  const uploading = ref(false);
  const downloadingPackage = ref(false);
  const file = ref<File | null>(null);
  const taskId = ref<string | null>(null);
  const taskProgress = ref<TaskProgress | null>(null);
  const packageName = ref("");
  const packageTaskId = ref<string | null>(null);
  const packageStatusMessage = ref("");
  const packageProgress = ref<TaskProgress | null>(null);

  const downloadUrl = computed(
    () => `${serverBaseUrl}/api/download/${taskId.value}`
  );
  const packageDownloadUrl = computed(
    () => `${serverBaseUrl}/api/download/${packageTaskId.value}`
  );

  /**
   * 删除历史记录项
   * @param taskId 任务ID
   * @returns 是否删除成功
   */
  const deleteHistoryItem = async (taskId: string): Promise<boolean> => {
    try {
      const response = await fetch(`${serverBaseUrl}/api/history/${taskId}`, {
        method: "DELETE",
      });
      return response.ok;
    } catch (error) {
      console.error("Failed to delete history item:", error);
      return false;
    }
  };

  const handleFileUpload = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      file.value = target.files[0];
    }
  };

  const uploadFile = async (
    onProgress?: (progress: TaskProgress) => void,
    onComplete?: () => void,
    onError?: (error: Error) => void
  ) => {
    if (!file.value) return;

    uploading.value = true;
    taskProgress.value = null;
    const formData = new FormData();
    formData.append("lockfile", file.value);

    try {
      const response = await fetch(`${serverBaseUrl}/api/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      taskId.value = data.taskId;

      const poll = async () => {
        if (!taskId.value) return;
        try {
          const statusRes = await fetch(
            `${serverBaseUrl}/api/task/${taskId.value}`
          );
          const statusData = await statusRes.json();
          taskProgress.value = statusData.progress || null;
          onProgress?.(statusData.progress);

          if (
            statusData.status === "completed" ||
            statusData.status === "failed"
          ) {
            uploading.value = false;
            onComplete?.();
          } else {
            setTimeout(poll, 1000);
          }
        } catch (e) {
          console.error(e);
          uploading.value = false;
          taskProgress.value = null;
          onError?.(e as Error);
        }
      };
      poll();
    } catch (error) {
      console.error(error);
      uploading.value = false;
      onError?.(error as Error);
    }
  };

  const downloadSinglePackage = async (
    onProgress?: (progress: TaskProgress) => void,
    onComplete?: () => void,
    onError?: (error: Error) => void
  ) => {
    if (!packageName.value) return;
    downloadingPackage.value = true;
    packageStatusMessage.value = "启动中...";
    packageTaskId.value = null;

    try {
      const response = await fetch(`${serverBaseUrl}/api/download-package`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ packageName: packageName.value }),
      });
      const data = await response.json();
      packageTaskId.value = data.taskId;

      const poll = async () => {
        if (!packageTaskId.value) return;
        try {
          const statusRes = await fetch(
            `${serverBaseUrl}/api/task/${packageTaskId.value}`
          );
          const statusData = await statusRes.json();
          packageStatusMessage.value = statusData.message || statusData.status;
          packageProgress.value = statusData.progress || null;
          onProgress?.(statusData.progress);

          if (statusData.status === "completed") {
            downloadingPackage.value = false;
            onComplete?.();
          } else if (statusData.status === "failed") {
            downloadingPackage.value = false;
            packageProgress.value = null;
            onError?.(new Error(statusData.message || "未知错误"));
          } else {
            setTimeout(poll, 1000);
          }
        } catch (e) {
          console.error(e);
          downloadingPackage.value = false;
          packageProgress.value = null;
          onError?.(e as Error);
        }
      };
      poll();
    } catch (error) {
      console.error(error);
      downloadingPackage.value = false;
      onError?.(error as Error);
    }
  };

  return {
    // State
    uploading,
    downloadingPackage,
    file,
    taskId,
    taskProgress,
    packageName,
    packageTaskId,
    packageStatusMessage,
    packageProgress,
    // Computed
    downloadUrl,
    packageDownloadUrl,
    // Methods
    handleFileUpload,
    uploadFile,
    downloadSinglePackage,
    deleteHistoryItem,
  };
}
