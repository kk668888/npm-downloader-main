<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2 text-xs">
      <span class="text-base-500">任务 ID:</span>
      <span class="font-mono text-[10px] text-base-300">{{ taskId }}</span>
    </div>

    <!-- 审计等待提示 -->
    <div v-if="isAuditing" class="px-3 py-2 rounded-md bg-blue-400/10 border border-blue-400/20">
      <div class="flex items-center justify-between">
        <span class="text-[11px] text-blue-400">正在等待安全审计确认...</span>
        <button
          class="text-[10px] font-medium text-accent hover:underline"
          @click="$emit('reopenAudit', taskId)"
        >
          查看审计报告
        </button>
      </div>
    </div>

    <!-- Progress -->
    <div v-if="progress">
      <div class="flex justify-between text-[10px] mb-1">
        <span class="text-base-500">进度</span>
        <span class="font-mono text-base-300">{{ progress.current }} / {{ progress.total }}</span>
      </div>
      <Progress
        :value="(progress.current / progress.total) * 100"
        size="xs"
      />
    </div>

    <!-- Actions -->
    <div class="flex gap-2">
      <Button
        size="xs"
        color="green"
        variant="soft"
        :to="downloadUrl ? `${serverBaseUrl}${downloadUrl}` : undefined"
        :disabled="!progress || progress.current < progress.total"
        class="flex-1"
      >
        下载
      </Button>
      <Button
        size="xs"
        color="gray"
        variant="ghost"
        @click="$emit('viewLogs', taskId)"
      >
        日志
      </Button>
      <!-- 取消任务按钮：仅在任务进行中（非终态）时显示 -->
      <Button
        size="xs"
        color="red"
        variant="soft"
        @click="$emit('cancel', taskId)"
      >
        取消
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from './ui/Button.vue';
import Progress from './ui/Progress.vue';

const props = defineProps<{
  taskId: string;
  type: "lockfile" | "package";
  isAuditing?: boolean;
  progress: { current: number; total: number } | null;
  downloadUrl: string;
  serverBaseUrl: string;
}>();

defineEmits<{
  (e: "viewLogs", taskId: string): void;
  (e: "reopenAudit", taskId: string): void;
  /** 用户点击取消任务按钮时触发 */
  (e: "cancel", taskId: string): void;
}>();
</script>
