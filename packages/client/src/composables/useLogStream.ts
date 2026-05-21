import type { TaskLog } from "@npm-downloader/types";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "ended";

export function useLogStream(serverBaseUrl: string) {
  const logs = ref<TaskLog[]>([]);
  const status = ref<ConnectionStatus>("disconnected");
  const error = ref("");
  const eventSource = ref<EventSource | null>(null);

  // 重连配置
  const reconnectAttempts = ref(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 1000; // 初始重连延迟 1s
  const reconnectTimeout = ref<ReturnType<typeof setTimeout> | null>(null);

  // 清理连接
  const disconnect = () => {
    if (eventSource.value) {
      eventSource.value.close();
      eventSource.value = null;
    }
    if (reconnectTimeout.value) {
      clearTimeout(reconnectTimeout.value);
      reconnectTimeout.value = null;
    }
    status.value = "disconnected";
    reconnectAttempts.value = 0;
  };

  // 连接到 SSE 流
  const connect = (taskId: string) => {
    disconnect();
    status.value = "connecting";
    error.value = "";

    try {
      const url = `${serverBaseUrl}/api/logs/${taskId}/stream`;
      eventSource.value = new EventSource(url);

      // 连接成功
      eventSource.value.onopen = () => {
        status.value = "connected";
        reconnectAttempts.value = 0;
      };

      // 接收历史日志
      eventSource.value.addEventListener("history", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (Array.isArray(data.logs)) {
            logs.value = data.logs;
          }
        } catch (err) {
          console.error("Failed to parse history event:", err);
        }
      });

      // 接收新日志
      eventSource.value.addEventListener("log", (e) => {
        try {
          const log = JSON.parse(e.data) as TaskLog;
          logs.value.push(log);
        } catch (err) {
          console.error("Failed to parse log event:", err);
        }
      });

      // 接收状态更新
      eventSource.value.addEventListener("status", (e) => {
        try {
          const data = JSON.parse(e.data);
          // 可以在这里处理状态更新
        } catch (err) {
          console.error("Failed to parse status event:", err);
        }
      });

      // 连接结束
      eventSource.value.addEventListener("end", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.done) {
            status.value = "ended";
            disconnect();
          }
        } catch (err) {
          console.error("Failed to parse end event:", err);
        }
      });

      // 错误处理
      eventSource.value.onerror = (err) => {
        console.error("SSE error:", err);

        if (status.value === "ended") {
          return;
        }

        // 尝试重连
        if (reconnectAttempts.value < maxReconnectAttempts) {
          reconnectAttempts.value++;
          const delay = reconnectDelay * Math.pow(2, reconnectAttempts.value - 1);
          status.value = "connecting";
          error.value = `连接断开，${delay / 1000}秒后重连... (${reconnectAttempts.value}/${maxReconnectAttempts})`;

          reconnectTimeout.value = setTimeout(() => {
            if (status.value !== "disconnected") {
              connect(taskId);
            }
          }, delay);
        } else {
          status.value = "error";
          error.value = "连接失败，请刷新页面。";
          disconnect();
        }
      };
    } catch (err) {
      status.value = "error";
      error.value = "无法建立连接。";
      console.error("Failed to create EventSource:", err);
    }
  };

  // 组件卸载时清理
  onUnmounted(() => {
    disconnect();
  });

  return {
    logs,
    status,
    error,
    connect,
    disconnect,
  };
}
