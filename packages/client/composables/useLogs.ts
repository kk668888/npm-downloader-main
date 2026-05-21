import type { TaskLog } from "@npm-downloader/types";

export interface LogFilters {
  level: ("info" | "warn" | "error" | "all")[];
  search: string;
  autoScroll: boolean;
}

export interface LogStats {
  total: number;
  info: number;
  warn: number;
  error: number;
  firstTime: number | null;
  lastTime: number | null;
}

export function useLogs(serverBaseUrl: string) {
  const logs = ref<TaskLog[]>([]);
  const loading = ref(false);
  const error = ref("");

  const filters = ref<LogFilters>({
    level: ["all"],
    search: "",
    autoScroll: true,
  });

  const filteredLogs = computed(() => {
    let result = logs.value;

    // Filter by level
    if (!filters.value.level.includes("all")) {
      result = result.filter((log) => filters.value.level.includes(log.level));
    }

    // Filter by search
    if (filters.value.search) {
      const searchLower = filters.value.search.toLowerCase();
      result = result.filter((log) =>
        log.message.toLowerCase().includes(searchLower)
      );
    }

    return result;
  });

  const stats = computed((): LogStats => {
    const result: LogStats = {
      total: logs.value.length,
      info: 0,
      warn: 0,
      error: 0,
      firstTime: null,
      lastTime: null,
    };

    if (logs.value.length > 0) {
      result.firstTime = logs.value[0].timestamp;
      result.lastTime = logs.value[logs.value.length - 1].timestamp;
    }

    for (const log of logs.value) {
      if (log.level === "info") result.info++;
      else if (log.level === "warn") result.warn++;
      else if (log.level === "error") result.error++;
    }

    return result;
  });

  const fetchLogs = async (taskId: string) => {
    loading.value = true;
    error.value = "";
    try {
      const res = await fetch(`${serverBaseUrl}/api/logs/${taskId}`);
      const data = await res.json();
      logs.value = Array.isArray(data?.logs) ? data.logs : [];
    } catch (e) {
      console.error(e);
      error.value = "获取日志失败";
      logs.value = [];
    } finally {
      loading.value = false;
    }
  };

  const clearLogs = () => {
    logs.value = [];
  };

  const setFilterLevel = (level: ("info" | "warn" | "error" | "all")[]) => {
    filters.value.level = level;
  };

  const setSearch = (search: string) => {
    filters.value.search = search;
  };

  const setAutoScroll = (enabled: boolean) => {
    filters.value.autoScroll = enabled;
  };

  return {
    // State
    logs,
    loading,
    error,
    filters,
    // Computed
    filteredLogs,
    stats,
    // Methods
    fetchLogs,
    clearLogs,
    setFilterLevel,
    setSearch,
    setAutoScroll,
  };
}
