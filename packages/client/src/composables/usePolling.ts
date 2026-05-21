import type { HistoryItem } from "@npm-downloader/types";

export function usePolling(serverBaseUrl: string) {
  const historyItems = ref<HistoryItem[]>([]);
  const historyLoading = ref(false);
  const historyError = ref("");
  let pollingTimer: ReturnType<typeof setTimeout> | null = null;

  const formatTime = (ts: number) => {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return String(ts);
    }
  };

  const refreshHistory = async () => {
    historyLoading.value = true;
    historyError.value = "";
    try {
      const res = await fetch(`${serverBaseUrl}/api/history`);
      const data = await res.json();
      historyItems.value = Array.isArray(data?.items) ? data.items : [];
    } catch (e) {
      console.error(e);
      historyError.value = "加载历史记录失败";
    } finally {
      historyLoading.value = false;
    }
  };

  const startPolling = (interval = 3000) => {
    stopPolling();
    pollingTimer = setInterval(() => {
      refreshHistory();
    }, interval);
  };

  const stopPolling = () => {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  };

  onUnmounted(() => {
    stopPolling();
  });

  return {
    historyItems,
    historyLoading,
    historyError,
    formatTime,
    refreshHistory,
    startPolling,
    stopPolling,
  };
}
