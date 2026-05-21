<template>
  <div class="flex items-center gap-3 text-[11px] font-mono">
    <!-- 总计 -->
    <div class="flex items-center gap-1.5">
      <span class="w-1.5 h-1.5 rounded-full bg-base-400" />
      <span class="text-base-500">总计</span>
      <span class="text-base-200 font-semibold">{{ stats.total }}</span>
    </div>

    <!-- 分隔线 -->
    <div class="w-px h-3 bg-base-700" />

    <!-- 信息 -->
    <div class="flex items-center gap-1.5">
      <span class="w-1.5 h-1.5 rounded-full bg-success" />
      <span class="text-base-500">信息</span>
      <span class="text-base-200 font-semibold">{{ stats.info }}</span>
    </div>

    <!-- 警告 -->
    <div class="flex items-center gap-1.5">
      <span class="w-1.5 h-1.5 rounded-full bg-accent" />
      <span class="text-base-500">警告</span>
      <span class="text-base-200 font-semibold">{{ stats.warn }}</span>
    </div>

    <!-- 错误 -->
    <div class="flex items-center gap-1.5">
      <span class="w-1.5 h-1.5 rounded-full bg-danger" />
      <span class="text-base-500">错误</span>
      <span class="text-base-200 font-semibold">{{ stats.error }}</span>
    </div>

    <!-- 耗时 -->
    <div v-if="stats.firstTime && stats.lastTime" class="ml-auto text-base-500">
      {{ formatDuration(stats.firstTime, stats.lastTime) }}
    </div>
  </div>
</template>

<script setup lang="ts">
interface LogStats {
  total: number;
  info: number;
  warn: number;
  error: number;
  firstTime: number | null;
  lastTime: number | null;
}

const props = defineProps<{
  stats: LogStats;
}>();

const formatDuration = (start: number, end: number) => {
  const diff = end - start;
  if (diff < 1000) return `${diff}ms`;
  if (diff < 60000) return `${(diff / 1000).toFixed(1)}s`;
  return `${(diff / 60000).toFixed(1)}m`;
};
</script>
