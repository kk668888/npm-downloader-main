<template>
  <div class="log-line py-0.5 px-2 hover:bg-gray-800/50 dark:hover:bg-obsidian-800/50 rounded">
    <span class="text-gray-500 dark:text-stone-600">{{ formatLogTime(log.timestamp) }}</span>
    <span
      :class="{
        'text-red-400 dark:text-red-300 font-bold': log.level === 'error',
        'text-yellow-400 dark:text-amber-400': log.level === 'warn',
        'text-green-400 dark:text-emerald-400': log.level === 'info',
      }"
    >
      [{{ log.level.toUpperCase() }}]
    </span>
    <span class="text-gray-900 dark:text-stone-300">{{ log.message }}</span>
  </div>
</template>

<script setup lang="ts">
import type { TaskLog } from "@npm-downloader/types";

const props = defineProps<{
  log: TaskLog;
}>();

const formatLogTime = (ts: number) => {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return String(ts);
  }
};
</script>
