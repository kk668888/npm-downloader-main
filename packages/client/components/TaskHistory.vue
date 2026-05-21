<template>
  <UCard class="h-full flex flex-col">
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <UIcon name="i-heroicons-clock" class="w-5 h-5" />
          下载历史
          <span v-if="itemCount > 0" class="text-sm font-normal text-slate-500 dark:text-slate-400">
            ({{ itemCount }})
          </span>
        </h2>
        <UButton
          size="sm"
          color="gray"
          variant="ghost"
          :icon="isRefreshing ? 'i-heroicons-arrow-path' : undefined"
          :loading="isRefreshing"
          @click="handleRefresh"
        >
          刷新
        </UButton>
      </div>
    </template>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto -mx-1">
      <!-- Error -->
      <UAlert
        v-if="error"
        icon="i-heroicons-exclamation-triangle"
        color="red"
        variant="soft"
        :title="error"
        class="mb-4"
      />

      <!-- Empty State -->
      <div
        v-if="items.length === 0 && !loading && !isRefreshing"
        class="flex flex-col items-center justify-center py-12 text-slate-500 dark:text-slate-400"
      >
        <UIcon name="i-heroicons-inbox" class="w-12 h-12 mb-2 opacity-50" />
        <p>暂无下载历史记录。</p>
      </div>

      <!-- History Grid with fade animation -->
      <Transition
        name="fade"
        mode="out-in"
      >
        <div v-if="items.length > 0" :key="items.length" class="grid grid-cols-3 gap-3">
          <TaskCard
            v-for="item in items"
            :key="item.taskId"
            :item="item"
            :server-base-url="serverBaseUrl"
            :format-time="formatTime"
            :delete-item="deleteItem"
            @view-logs="$emit('viewLogs', $event)"
            @deleted="$emit('deleted')"
          />
        </div>
      </Transition>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { HistoryItem } from "@npm-downloader/types";

const props = defineProps<{
  items: HistoryItem[];
  loading: boolean;
  error: string;
  serverBaseUrl: string;
  formatTime: (ts: number) => string;
  deleteItem: (taskId: string) => Promise<boolean>;
}>();

const emit = defineEmits<{
  (e: "refresh"): void;
  (e: "viewLogs", taskId: string): void;
  (e: "deleted"): void;
}>();

// Local refresh state for UI feedback
const isRefreshing = ref(false);
const MIN_REFRESH_DURATION = 600; // ms

const itemCount = computed(() => props.items.length);

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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-to,
.fade-leave-from {
  opacity: 1;
}
</style>
