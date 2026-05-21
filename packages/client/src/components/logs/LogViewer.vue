<template>
  <Teleport to="body">
    <!-- 遮罩 -->
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 bg-base-950/60 backdrop-blur-sm z-40"
        @click="close"
      />
    </Transition>

    <!-- 弹层主体 -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-[0.97] translate-y-2"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-[0.97] translate-y-2"
    >
      <div
        v-if="open"
        class="fixed inset-6 z-50 flex flex-col rounded-xl shadow-2xl border border-base-800/80 overflow-hidden bg-base-950"
      >
        <!-- 头部 -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-base-800/60 bg-base-900/30 flex-shrink-0">
          <div class="flex items-center gap-3">
            <!-- 终端装饰圆点 -->
            <div class="flex items-center gap-1.5 mr-1">
              <div class="w-2.5 h-2.5 rounded-full bg-danger/70 hover:bg-danger transition-colors" />
              <div class="w-2.5 h-2.5 rounded-full bg-accent/70 hover:bg-accent transition-colors" />
              <div class="w-2.5 h-2.5 rounded-full bg-success/70 hover:bg-success transition-colors" />
            </div>

            <div class="w-px h-4 bg-base-700" />

            <!-- 标题 -->
            <span class="text-sm font-medium text-base-200">控制台日志</span>

            <!-- 任务 ID -->
            <span class="text-[11px] font-mono text-base-500 bg-base-800/50 px-2 py-0.5 rounded">
              {{ taskId }}
            </span>

            <!-- 连接状态 -->
            <Badge
              :color="statusColor"
              variant="soft"
              size="xs"
              :icon="statusIcon"
            >
              {{ statusText }}
            </Badge>
          </div>

          <!-- 关闭按钮 -->
          <button
            class="p-1.5 rounded-md text-base-500 hover:text-base-200 hover:bg-base-800/50 transition-colors"
            @click="close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <!-- 工具栏：筛选 + 统计 -->
        <div class="flex items-center justify-between px-5 py-2.5 border-b border-base-800/40 bg-base-900/20 flex-shrink-0">
          <LogsLogFilters
            :filters="filters"
            @update:filters="updateFilters"
          />
          <LogsLogStats v-if="stats.total > 0" :stats="stats" />
        </div>

        <!-- 日志内容区域 -->
        <div
          ref="logsContainer"
          class="flex-1 overflow-y-auto font-mono text-xs p-2 space-y-0.5 scrollbar-thin"
        >
          <!-- 连接中 -->
          <div
            v-if="status === 'connecting'"
            class="flex items-center justify-center gap-2 py-16 text-base-500"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-4 h-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span class="text-sm">正在连接日志流...</span>
          </div>

          <!-- 空状态 -->
          <div
            v-else-if="filteredLogs.length === 0"
            class="flex flex-col items-center justify-center py-16 text-base-500"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-10 h-10 mb-3 opacity-30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span class="text-sm">
              {{ status === "connected" || status === "ended" ? "暂无日志记录" : "等待日志中..." }}
            </span>
          </div>

          <!-- 日志行列表 -->
          <LogsLogLine
            v-for="log in filteredLogs"
            :key="log.timestamp"
            :log="log"
          />
        </div>

        <!-- 底部状态栏 -->
        <div
          v-if="filteredLogs.length > 0"
          class="flex items-center justify-between px-5 py-2 border-t border-base-800/40 bg-base-900/20 text-[10px] font-mono text-base-600 flex-shrink-0"
        >
          <span>共 {{ filteredLogs.length }} 条日志</span>
          <span v-if="stats.firstTime">
            {{ new Date(stats.firstTime).toLocaleTimeString() }} — {{ stats.lastTime ? new Date(stats.lastTime).toLocaleTimeString() : '' }}
          </span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { TaskLog } from "@npm-downloader/types";
import type { ConnectionStatus } from "../../composables/useLogStream";
import Badge from '../ui/Badge.vue';
import LogsLogFilters from './LogFilters.vue';
import LogsLogStats from './LogStats.vue';
import LogsLogLine from './LogLine.vue';
import { useLogStream } from '../../composables/useLogStream';

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

// 统计信息
const stats = computed<LogStats>(() => {
  const allLogs = logs.value;
  return {
    total: allLogs.length,
    info: allLogs.filter((l) => l.level === "info").length,
    warn: allLogs.filter((l) => l.level === "warn").length,
    error: allLogs.filter((l) => l.level === "error").length,
    firstTime: allLogs[0]?.timestamp ?? null,
    lastTime: allLogs[allLogs.length - 1]?.timestamp ?? null,
  };
});

// 筛选日志
const filteredLogs = computed(() => {
  let result = logs.value;

  if (!filters.value.level.includes("all")) {
    result = result.filter((log) =>
      filters.value.level.includes(log.level as "info" | "warn" | "error")
    );
  }

  if (filters.value.search) {
    const searchLower = filters.value.search.toLowerCase();
    result = result.filter((log) =>
      log.message.toLowerCase().includes(searchLower)
    );
  }

  return result;
});

// 状态配置
type BadgeColor = 'gray' | 'red' | 'green' | 'yellow' | 'blue' | 'primary';

const statusConfig = computed(() => {
  const configs: Record<ConnectionStatus, { color: BadgeColor; icon: string; text: string }> = {
    disconnected: { color: "gray", icon: "i-heroicons-x-circle", text: "已断开" },
    connecting: { color: "yellow", icon: "i-heroicons-arrow-path", text: "连接中" },
    connected: { color: "green", icon: "i-heroicons-check-circle", text: "实时" },
    error: { color: "red", icon: "i-heroicons-x-circle", text: "错误" },
    ended: { color: "blue", icon: "i-heroicons-check-badge", text: "已完成" },
  };
  return configs[status.value];
});

const statusColor = computed(() => statusConfig.value.color);
const statusIcon = computed(() => statusConfig.value.icon);
const statusText = computed(() => statusConfig.value.text);

// 监听打开/关闭和 taskId 变化
watch(
  () => [props.open, props.taskId],
  ([open, taskId]) => {
    if (open && taskId) {
      connect(taskId as string);
    } else {
      disconnect();
    }
  },
  { immediate: true }
);

// 自动滚动
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

const updateFilters = (newFilters: Partial<LogFilters>) => {
  filters.value = { ...filters.value, ...newFilters };
};

const close = () => {
  disconnect();
  emit("close");
};

// Esc 关闭
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

onUnmounted(() => {
  disconnect();
});
</script>
