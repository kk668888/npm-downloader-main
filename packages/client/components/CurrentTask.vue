<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2 text-sm">
      <span class="text-slate-500 dark:text-slate-400">任务 ID:</span>
      <span class="font-mono text-xs text-slate-700 dark:text-slate-300">{{ taskId }}</span>
    </div>

    <!-- Progress -->
    <div v-if="progress">
      <div class="flex justify-between text-xs mb-1">
        <span class="text-slate-600 dark:text-slate-400">进度</span>
        <span class="font-medium text-slate-900 dark:text-slate-200">{{ progress.current }} / {{ progress.total }}</span>
      </div>
      <UProgress
        :value="(progress.current / progress.total) * 100"
        size="sm"
      />
    </div>

    <!-- Actions -->
    <div class="flex gap-2">
      <UButton
        size="sm"
        color="primary"
        variant="soft"
        :to="downloadUrl"
        target="_blank"
        :disabled="!progress || progress.current < progress.total"
        class="flex-1"
      >
        下载
      </UButton>
      <UButton
        size="sm"
        color="gray"
        variant="ghost"
        @click="$emit('viewLogs', taskId)"
      >
        日志
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  taskId: string;
  type: "lockfile" | "package";
  progress: { current: number; total: number } | null;
  downloadUrl: string;
  serverBaseUrl: string;
}>();

defineEmits<{
  (e: "viewLogs", taskId: string): void;
}>();
</script>
