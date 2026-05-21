<template>
  <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:shadow-soft-md hover:border-primary/50 dark:hover:border-primary/50 transition-all">
    <!-- Header -->
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-1.5 flex-wrap">
        <UBadge size="xs" color="gray" variant="soft">{{ item.type }}</UBadge>
        <UBadge
          size="xs"
          :color="
            item.status === 'completed'
              ? 'green'
              : item.status === 'failed'
              ? 'red'
              : 'amber'
          "
          variant="soft"
        >
          {{ item.status }}
        </UBadge>
      </div>
    </div>

    <!-- Package Name with Version -->
    <div class="mb-1">
      <div v-if="item.packageName" class="font-medium text-sm truncate text-slate-900 dark:text-slate-100" :title="fullPackageName">
        {{ displayPackageName }}
      </div>
      <div v-if="item.packageVersion" class="text-xs text-slate-500 dark:text-slate-400">
        v{{ item.packageVersion }}
      </div>
    </div>

    <!-- Meta Info -->
    <div class="text-xs text-slate-500 dark:text-slate-400 mb-2">
      <span>{{ formatTime(item.createdAt) }}</span>
      <span v-if="typeof item.packagesCount === 'number'" class="ml-1">
        · {{ item.packagesCount }} 个包
      </span>
    </div>

    <!-- Progress -->
    <div
      v-if="item.progress && item.status === 'processing'"
      class="mb-2"
    >
      <UProgress
        :value="(item.progress.current / item.progress.total) * 100"
        size="xs"
        :color="item.status === 'completed' ? 'green' : 'amber'"
      />
      <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 text-right">
        {{ item.progress.current }} / {{ item.progress.total }}
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-1.5">
      <UButton
        size="xs"
        color="primary"
        variant="soft"
        :to="item.zipUrl ? `${serverBaseUrl}${item.zipUrl}` : undefined"
        :disabled="item.status !== 'completed' || !item.zipUrl"
        class="flex-1"
      >
        下载
      </UButton>
      <UButton
        size="xs"
        color="gray"
        variant="ghost"
        @click="$emit('viewLogs', item.taskId)"
      >
        日志
      </UButton>
      <UPopover>
        <UButton
          size="xs"
          color="red"
          variant="ghost"
          icon="i-heroicons-trash"
        />
        <template #panel>
          <div class="p-3 min-w-[160px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
            <p class="text-sm text-slate-700 dark:text-slate-200 mb-3">
              确定删除此项？
            </p>
            <div class="flex gap-2 justify-end">
              <UButton
                size="xs"
                color="gray"
                variant="ghost"
                @click="closePopover"
              >
                取消
              </UButton>
              <UButton
                size="xs"
                color="red"
                :loading="deleting"
                @click="handleDelete"
              >
                删除
              </UButton>
            </div>
          </div>
        </template>
      </UPopover>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HistoryItem } from "@npm-downloader/types";

const props = defineProps<{
  item: HistoryItem;
  serverBaseUrl: string;
  formatTime: (ts: number) => string;
  deleteItem: (taskId: string) => Promise<boolean>;
}>();

const emit = defineEmits<{
  (e: "viewLogs", taskId: string): void;
  (e: "deleted"): void;
}>();

// Popover state
const popoverOpen = ref(false);
const deleting = ref(false);

const closePopover = () => {
  popoverOpen.value = false;
};

const handleDelete = async () => {
  deleting.value = true;
  try {
    const success = await props.deleteItem(props.item.taskId);
    if (success) {
      emit("deleted");
    }
  } finally {
    deleting.value = false;
    closePopover();
  }
};

// Display package name (without version if already shown separately)
const displayPackageName = computed(() => {
  if (!props.item.packageName) return "";
  const name = props.item.packageName;
  if (name.includes("@") && !name.startsWith("@")) {
    const atIndex = name.lastIndexOf("@");
    return name.substring(0, atIndex);
  }
  return name;
});

// Full package name for title attribute
const fullPackageName = computed(() => {
  const name = props.item.packageName;
  const version = props.item.packageVersion;
  if (name && version) {
    return `${name}@${version}`;
  }
  return name || "";
});
</script>
