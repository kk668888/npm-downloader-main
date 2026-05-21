<template>
  <div class="flex items-center gap-4 text-xs">
    <div class="flex items-center gap-1">
      <span class="text-gray-400 dark:text-stone-500">总计:</span>
      <span class="font-mono text-gray-700 dark:text-stone-300">{{ stats.total }}</span>
    </div>
    <div class="flex items-center gap-1">
      <span class="text-green-400 dark:text-emerald-400">信息:</span>
      <span class="font-mono text-gray-700 dark:text-stone-300">{{ stats.info }}</span>
    </div>
    <div class="flex items-center gap-1">
      <span class="text-yellow-400 dark:text-amber-400">警告:</span>
      <span class="font-mono text-gray-700 dark:text-stone-300">{{ stats.warn }}</span>
    </div>
    <div class="flex items-center gap-1">
      <span class="text-red-400">错误:</span>
      <span class="font-mono text-gray-700 dark:text-stone-300">{{ stats.error }}</span>
    </div>
    <div v-if="stats.firstTime && stats.lastTime" class="ml-auto text-gray-500 dark:text-stone-600">
      {{ formatDuration(stats.firstTime, stats.lastTime) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LogStats } from "~/composables/useLogs";

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
