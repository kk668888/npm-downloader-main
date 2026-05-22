import type { HistoryItem, AuditReport } from "@npm-downloader/types";

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
  // 跟踪 lockfile 上传任务的当前状态（用于 activeTask 展示 auditing 等）
  const taskStatusText = ref<string>("");
  const packageName = ref("");
  const packageTaskId = ref<string | null>(null);
  const packageStatusMessage = ref("");
  const packageProgress = ref<TaskProgress | null>(null);

  // 用户自定义文件夹名称（可选，为空时后端使用 taskId）
  const folderName = ref("");

  // 审计相关状态
  const auditReport = ref<AuditReport | null>(null);
  const showingAuditReport = ref(false);
  // 当前是否有任务在等待审计确认（用于 activeTask 展示"查看审计报告"按钮）
  const isAwaitingAudit = ref(false);

  // 按 taskId 存储 token，避免并发任务互相覆盖
  const tokenStore = new Map<string, string>();

  const downloadUrl = computed(
    () => `${serverBaseUrl}/api/download/${taskId.value}`
  );
  const packageDownloadUrl = computed(
    () => `${serverBaseUrl}/api/download/${packageTaskId.value}`
  );

  // 轮询控制：保存 poll 函数引用，确认后可恢复
  let activePollFn: (() => void) | null = null;

  /**
   * 删除历史记录项
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

  /**
   * 确认审计报告，携带对应 taskId 的 token
   * 成功后标记 auditConfirmedForTask，防止轮询再次被审计状态拦截
   */
  const confirmAudit = async (tid: string): Promise<boolean> => {
    const token = tokenStore.get(tid);
    if (!token) return false;
    try {
      const response = await fetch(`${serverBaseUrl}/api/task/${tid}/confirm-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      const ok = response.ok && data.ok === true;
      if (ok) {
        auditConfirmedForTask = tid;
        isAwaitingAudit.value = false;
      }
      return ok;
    } catch {
      return false;
    }
  };

  const handleFileUpload = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      file.value = target.files[0];
    }
  };

  // 标记是否已经对当前任务自动弹出过审计报告（防止关闭后反复弹出）
  let auditAutoShownForTask: string | null = null;
  // 标记用户已确认审计（确认后不再拦截轮询，让状态自然过渡）
  let auditConfirmedForTask: string | null = null;

  /**
   * 处理轮询中的审计状态
   * - safe：自动继续轮询
   * - blocked：弹窗展示漏洞（禁止确认），服务端会直接标记 failed，轮询继续
   * - risky / unavailable：首次自动弹窗，用户确认后不再拦截
   *
   * 返回 true 表示"需要暂停轮询等待用户操作"，false 表示继续正常轮询
   */
  const handleAuditStatus = (
    statusData: any,
    currentTaskId: string | null
  ): boolean => {
    if (
      statusData.status === "auditing" &&
      statusData.auditReport &&
      statusData.auditReport.auditStatus !== "safe"
    ) {
      // blocked 状态：弹窗展示但继续轮询（服务端会自动标记 failed）
      if (statusData.auditReport.auditStatus === "blocked") {
        auditReport.value = statusData.auditReport;
        if (auditAutoShownForTask !== currentTaskId) {
          auditAutoShownForTask = currentTaskId;
          showingAuditReport.value = true;
        }
        // 不暂停轮询，让状态自然过渡到 failed
        return false;
      }

      // 用户已确认 → 不拦截，让轮询继续直到服务端状态变为 processing
      if (auditConfirmedForTask === currentTaskId) {
        return false;
      }

      auditReport.value = statusData.auditReport;
      isAwaitingAudit.value = true;
      // 只在首次遇到时自动弹出，避免关闭后反复弹出
      if (auditAutoShownForTask !== currentTaskId) {
        auditAutoShownForTask = currentTaskId;
        showingAuditReport.value = true;
      }
      return true;
    }
    return false;
  };

  /**
   * 确认审计后恢复轮询
   */
  const resumePolling = () => {
    if (activePollFn) {
      setTimeout(activePollFn, 1000);
    }
  };

  /**
   * 重新打开审计报告弹窗
   * 从服务端状态接口重新获取报告数据
   */
  const reopenAudit = async (tid: string) => {
    try {
      const res = await fetch(`${serverBaseUrl}/api/task/${tid}`);
      if (res.ok) {
        const data = await res.json();
        if (data.auditReport) {
          auditReport.value = data.auditReport;
          showingAuditReport.value = true;
        }
      }
    } catch {
      // 静默失败
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
    // 如果用户填写了自定义文件夹名称，附加到 FormData
    if (folderName.value.trim()) {
      formData.append("folderName", folderName.value.trim());
    }

    try {
      const response = await fetch(`${serverBaseUrl}/api/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      taskId.value = data.taskId;

      // 从创建响应获取 token，按 taskId 存储
      if (data.token && data.taskId) {
        tokenStore.set(data.taskId, data.token);
      }

      const poll = async () => {
        if (!taskId.value) return;
        try {
          const statusRes = await fetch(
            `${serverBaseUrl}/api/task/${taskId.value}`
          );
          const statusData = await statusRes.json();
          taskProgress.value = statusData.progress || null;
          taskStatusText.value = statusData.status || "";

          onProgress?.(statusData.progress);

          // 检查审计状态
          const isAuditing = handleAuditStatus(statusData, taskId.value);
          if (isAuditing) {
            // 保存 poll 引用，确认后可恢复
            activePollFn = poll;
            return;
          }

          if (
            statusData.status === "completed" ||
            statusData.status === "failed" ||
            statusData.status === "cancelled"
          ) {
            uploading.value = false;
            activePollFn = null;
            isAwaitingAudit.value = false;
            auditAutoShownForTask = null;
            auditConfirmedForTask = null;
            // cancelled 状态需要额外清理进度显示
            if (statusData.status === "cancelled") {
              taskProgress.value = null;
            }
            onComplete?.();
          } else {
            setTimeout(poll, 1000);
          }
        } catch (e) {
          console.error(e);
          uploading.value = false;
          taskProgress.value = null;
          activePollFn = null;
          onError?.(e as Error);
        }
      };

      activePollFn = poll;
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
        body: JSON.stringify({
          packageName: packageName.value,
          // 如果用户填写了自定义文件夹名称，一并传递
          ...(folderName.value.trim() ? { folderName: folderName.value.trim() } : {}),
        }),
      });
      const data = await response.json();
      packageTaskId.value = data.taskId;

      // 从创建响应获取 token，按 taskId 存储
      if (data.token && data.taskId) {
        tokenStore.set(data.taskId, data.token);
      }

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

          // 检查审计状态
          const isAuditing = handleAuditStatus(statusData, packageTaskId.value);
          if (isAuditing) {
            activePollFn = poll;
            return;
          }

          if (statusData.status === "completed") {
            downloadingPackage.value = false;
            activePollFn = null;
            isAwaitingAudit.value = false;
            auditAutoShownForTask = null;
            auditConfirmedForTask = null;
            onComplete?.();
          } else if (statusData.status === "failed") {
            downloadingPackage.value = false;
            packageProgress.value = null;
            activePollFn = null;
            isAwaitingAudit.value = false;
            auditAutoShownForTask = null;
            auditConfirmedForTask = null;
            onError?.(new Error(statusData.message || "未知错误"));
          } else if (statusData.status === "cancelled") {
            // 任务已被用户取消，清理所有状态
            downloadingPackage.value = false;
            packageProgress.value = null;
            activePollFn = null;
            isAwaitingAudit.value = false;
            auditAutoShownForTask = null;
            auditConfirmedForTask = null;
            onComplete?.();
          } else {
            setTimeout(poll, 1000);
          }
        } catch (e) {
          console.error(e);
          downloadingPackage.value = false;
          packageProgress.value = null;
          activePollFn = null;
          onError?.(e as Error);
        }
      };

      activePollFn = poll;
      poll();
    } catch (error) {
      console.error(error);
      downloadingPackage.value = false;
      onError?.(error as Error);
    }
  };

  /**
   * 取消指定的下载任务
   * 调用后端 POST /api/task/:taskId/cancel 接口
   * 需要携带该任务对应的 token 进行身份校验
   *
   * @param tid - 要取消的任务 ID
   * @returns 是否取消成功
   */
  const cancelTask = async (tid: string): Promise<boolean> => {
    const token = tokenStore.get(tid);
    if (!token) return false;
    try {
      const response = await fetch(`${serverBaseUrl}/api/task/${tid}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      return response.ok && data.ok === true;
    } catch {
      return false;
    }
  };

  return {
    // State
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
    folderName,
    auditReport,
    showingAuditReport,
    isAwaitingAudit,
    // Computed
    downloadUrl,
    packageDownloadUrl,
    // Methods
    handleFileUpload,
    uploadFile,
    downloadSinglePackage,
    deleteHistoryItem,
    confirmAudit,
    cancelTask,
    resumePolling,
    reopenAudit,
  };
}
