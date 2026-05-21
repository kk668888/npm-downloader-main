<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-base-800/60 flex-shrink-0">
      <h2 class="text-xs font-medium text-base-300 uppercase tracking-wider flex items-center gap-2">
        <Icon name="i-heroicons-clock" class="w-4 h-4 text-base-500" />
        下载历史
        <span v-if="itemCount > 0" class="text-[10px] font-mono text-base-600">
          {{ itemCount }}
        </span>
      </h2>
      <div class="flex items-center gap-1">
        <Button
          v-if="itemCount > 0"
          size="xs"
          color="red"
          variant="ghost"
          @click="clearAllRef?.open()"
        >
          <Icon name="i-heroicons-trash" class="w-3 h-3" />
        </Button>
        <Popconfirm
          ref="clearAllRef"
          title="确定清空所有历史记录？此操作不可撤销。"
          confirm-text="清空"
          cancel-text="取消"
          placement="top"
          :loading="isClearing"
          @confirm="handleClearAll"
          @cancel="clearAllRef?.close()"
        >
          <template #trigger>
            <span />
          </template>
        </Popconfirm>
        <Button
          size="xs"
          color="gray"
          variant="ghost"
          :loading="isRefreshing"
          @click="handleRefresh"
        >
          <Icon name="i-heroicons-arrow-path" class="w-3 h-3" />
        </Button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto scrollbar-thin p-4">
      <!-- Error -->
      <div
        v-if="error"
        class="flex items-center gap-2 px-3 py-2 mb-3 rounded-md bg-danger/5 border border-danger/20 text-danger text-xs"
      >
        <Icon name="i-heroicons-exclamation-triangle" class="w-4 h-4 shrink-0" />
        {{ error }}
      </div>

      <!-- Empty State -->
      <div
        v-if="items.length === 0 && !loading && !isRefreshing"
        class="flex flex-col items-center justify-center py-16 text-base-600"
      >
        <Icon name="i-heroicons-inbox" class="w-10 h-10 mb-2 opacity-30" />
        <p class="text-xs">暂无下载历史记录</p>
      </div>

      <!-- History Grid -->
      <TransitionGroup
        v-if="items.length > 0"
        name="history-card"
        tag="div"
        class="grid grid-cols-3 gap-2"
      >
        <TaskCard
          v-for="item in items"
          :key="item.taskId"
          :item="item"
          :server-base-url="serverBaseUrl"
          :format-time="formatTime"
          :delete-item="deleteItem"
          @view-logs="$emit('viewLogs', $event)"
          @view-audit="$emit('viewAudit', $event)"
          @deleted="$emit('deleted')"
        />
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HistoryItem } from "@npm-downloader/types";
import Button from './ui/Button.vue';
import Icon from './ui/Icon.vue';
import TaskCard from './TaskCard.vue';
import Popconfirm from './ui/Popconfirm.vue';

const props = defineProps<{
  items: HistoryItem[];
  loading: boolean;
  error: string;
  serverBaseUrl: string;
  formatTime: (ts: number) => string;
  deleteItem: (taskId: string) => Promise<boolean>;
  clearAll?: () => Promise<boolean>;
}>();

const emit = defineEmits<{
  (e: "refresh"): void;
  (e: "viewLogs", taskId: string): void;
  (e: "viewAudit", taskId: string): void;
  (e: "deleted"): void;
  (e: "clearAll"): void;
}>();

// Local refresh state for UI feedback
const isRefreshing = ref(false);
const isClearing = ref(false);
const clearAllRef = ref<InstanceType<typeof Popconfirm> | null>(null);
const MIN_REFRESH_DURATION = 600; // ms

const itemCount = computed(() => props.items.length);

const handleClearAll = async () => {
  if (isClearing.value) return;
  isClearing.value = true;
  try {
    if (props.clearAll) {
      const success = await props.clearAll();
      if (success) {
        emit("clearAll");
      }
    } else {
      emit("clearAll");
    }
  } finally {
    isClearing.value = false;
    clearAllRef.value?.close();
  }
};

const handleRefresh = async () => {
  if (isRefreshing.value) return;

  isRefreshing.value = true;
  const startTime = Date.now();

  emit("refresh");

  // Ensure minimum duration for visual feedback
  const elapsed = Date.now() - startTime;
  if (elapsed < MIN_REFRESH_DURATION) {
    await new Promise(resolve => setTimeout(resolve, MIN_REFRESH_DURATION - elapsed));
  }

  isRefreshing.value = false;
};
</script>

<style scoped>
/* Card enter: fade + slide up */
.history-card-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.history-card-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}
.history-card-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}

/* Card leave: fade + shrink, then collapse */
.history-card-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
  position: relative;
}
.history-card-leave-from {
  opacity: 1;
  transform: scale(1);
}
.history-card-leave-to {
  opacity: 0;
  transform: scale(0.92);
}

/* Remaining cards slide smoothly into new positions */
.history-card-move {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
