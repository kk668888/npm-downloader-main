<template>
  <div
    class="group flex items-start gap-3 px-3 py-1.5 rounded-md transition-colors duration-100"
    :class="lineClasses"
  >
    <!-- 时间戳 -->
    <span class="text-[10px] font-mono text-base-500 shrink-0 pt-0.5 select-none tabular-nums w-16 text-right">
      {{ formatLogTime(log.timestamp) }}
    </span>

    <!-- 级别指示条 -->
    <div class="flex items-center gap-2 shrink-0">
      <span
        class="inline-block w-1 h-1 rounded-full"
        :class="dotClass"
      />
      <span
        class="text-[10px] font-mono font-semibold uppercase tracking-wider w-10"
        :class="levelTextClass"
      >
        {{ log.level }}
      </span>
    </div>

    <!-- 日志内容 -->
    <span class="text-xs font-mono leading-relaxed break-all flex-1" :class="messageClass">
      {{ log.message }}
    </span>
  </div>
</template>

<script setup lang="ts">
import type { TaskLog } from "@npm-downloader/types";

const props = defineProps<{
  log: TaskLog;
}>();

// 根据日志级别计算行样式
const lineClasses = computed(() => {
  switch (props.log.level) {
    case 'error':
      return 'bg-danger/5 hover:bg-danger/10 border-l-2 border-danger/40';
    case 'warn':
      return 'bg-accent/5 hover:bg-accent/10 border-l-2 border-accent/40';
    default:
      return 'hover:bg-base-800/40 border-l-2 border-transparent';
  }
});

// 级别指示点颜色
const dotClass = computed(() => {
  switch (props.log.level) {
    case 'error': return 'bg-danger';
    case 'warn': return 'bg-accent';
    case 'info': return 'bg-success';
    default: return 'bg-base-500';
  }
});

// 级别文字颜色
const levelTextClass = computed(() => {
  switch (props.log.level) {
    case 'error': return 'text-danger';
    case 'warn': return 'text-accent';
    case 'info': return 'text-success/80';
    default: return 'text-base-500';
  }
});

// 日志内容颜色
const messageClass = computed(() => {
  switch (props.log.level) {
    case 'error': return 'text-danger/90';
    case 'warn': return 'text-accent/90';
    default: return 'text-base-300';
  }
});

const formatLogTime = (ts: number) => {
  try {
    const d = new Date(ts);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
  } catch {
    return String(ts);
  }
};
</script>
