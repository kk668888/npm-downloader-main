<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <div
      v-if="open"
      class="fixed inset-0 bg-black/50 z-40"
      @click="close"
    />

    <!-- Modal -->
    <Transition
      enter-active-class="transition ease-out duration-200"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition ease-in duration-150"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="open"
        class="fixed inset-4 z-50 flex flex-col bg-white dark:bg-obsidian-950 rounded-lg shadow-2xl border border-gray-200 dark:border-obsidian-700"
      >
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-obsidian-700">
      <div class="flex items-center gap-3">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <span class="text-gray-600 dark:text-stone-400">控制台日志</span>
          <span class="text-gray-400 dark:text-stone-600">—</span>
          <span class="font-mono text-sm text-gray-900 dark:text-stone-300">任务 {{ taskId }}</span>
        </h2>

        <!-- Connection Status Badge -->
        <UBadge
          :color="statusColor"
          variant="soft"
          size="xs"
          :icon="statusIcon"
        >
          {{ statusText }}
        </UBadge>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-heroicons-x-mark"
          size="sm"
          color="gray"
          variant="ghost"
          @click="close"
          class="dark:hover:bg-obsidian-700 dark:text-stone-300"
        />
      </div>
    </div>

    <!-- Filters & Stats -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-obsidian-700 bg-gray-50 dark:bg-obsidian-900/50">
      <LogsLogFilters
        :filters="filters"
        @update:filters="updateFilters"
      />
      <LogsLogStats v-if="stats.total > 0" :stats="stats" />
    </div>

    <!-- Error Message -->
    <div
      v-if="streamError"
      class="mx-4 mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-sm flex items-center justify-between"
    >
      <span class="dark:text-red-400">{{ streamError }}</span>
      <UButton
        size="xs"
        color="red"
        variant="ghost"
        icon="i-heroicons-arrow-path"
        @click="reconnect"
        class="dark:hover:bg-red-900/30 dark:text-red-400"
      >
        重试
      </UButton>
    </div>

    <!-- Logs Content -->
    <div
      ref="logsContainer"
      class="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-black text-gray-900 dark:text-emerald-400 font-mono text-sm"
    >
      <div v-if="status === 'connecting'" class="text-gray-500 dark:text-stone-500 p-4 flex items-center gap-2">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
        正在连接日志流...
      </div>
      <div v-else-if="filteredLogs.length === 0" class="text-gray-500 dark:text-stone-500 p-4">
        {{ status === "connected" || status === "ended" ? "暂无日志..." : "等待日志中..." }}
      </div>
      <LogsLogLine
        v-for="log in filteredLogs"
        :key="log.timestamp"
        :log="log"
      />
    </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { TaskLog } from "@npm-downloader/types";
import type { ConnectionStatus } from "~/composables/useLogStream";

interface LogFilters {
  level: ("info" | "warn" | "error" | "all")[];
  search: string;
  autoScroll: boolean;
}

interface LogStats {
  total: number;
  info: number;
  warn: number;
  error: number;
  firstTime: number | null;
  lastTime: number | null;
}

const props = defineProps<{
  open: boolean;
  taskId: string;
  serverBaseUrl: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const {
  logs,
  status,
  error: streamError,
  connect,
  disconnect,
} = useLogStream(props.serverBaseUrl);

const logsContainer = ref<HTMLElement | null>(null);
const filters = ref<LogFilters>({
  level: ["all"],
  search: "",
  autoScroll: true,
});

// Filter logs locally
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

// Calculate stats
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

// Status display
const statusConfig = computed(() => {
  const configs: Record<ConnectionStatus, { color: string; icon: string; text: string }> = {
    disconnected: { color: "gray", icon: "i-heroicons-x-circle", text: "已断开" },
    connecting: { color: "yellow", icon: "i-heroicons-arrow-path", text: "连接中..." },
    connected: { color: "green", icon: "i-heroicons-check-circle", text: "实时" },
    error: { color: "red", icon: "i-heroicons-x-circle", text: "错误" },
    ended: { color: "blue", icon: "i-heroicons-check-badge", text: "已完成" },
  };
  return configs[status.value];
});

const statusColor = computed(() => statusConfig.value.color);
const statusIcon = computed(() => statusConfig.value.icon);
const statusText = computed(() => statusConfig.value.text);

// Watch for open and taskId changes
watch(
  () => [props.open, props.taskId],
  ([open, taskId]) => {
    if (open && taskId) {
      connect(taskId);
    } else {
      disconnect();
    }
  },
  { immediate: true }
);

// Auto-scroll to bottom when new logs arrive
watch(
  logs,
  () => {
    if (filters.value.autoScroll && logsContainer.value) {
      nextTick(() => {
        logsContainer.value?.scrollTo({
          top: logsContainer.value.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  },
  { deep: true }
);

const updateFilters = (newFilters: LogFilters) => {
  filters.value = newFilters;
};

const reconnect = () => {
  if (props.taskId) {
    connect(props.taskId);
  }
};

const close = () => {
  disconnect();
  emit("close");
};

// Keyboard shortcut to close
onMounted(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && props.open) {
      close();
    }
  };
  window.addEventListener("keydown", handleKeyDown);
  onUnmounted(() => {
    window.removeEventListener("keydown", handleKeyDown);
  });
});

// Cleanup on unmount
onUnmounted(() => {
  disconnect();
});
</script>
