<template>
  <div class="p-3 rounded-lg bg-base-900/40 border border-base-800 hover:bg-base-900/60 hover:border-base-700 transition-all duration-150">
    <!-- Header -->
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-1.5 flex-wrap">
        <Badge size="xs" color="gray" variant="soft">{{ item.type }}</Badge>
        <Badge
          size="xs"
          :color="
            item.status === 'completed'
              ? 'green'
              : item.status === 'failed'
              ? 'red'
              : item.status === 'auditing'
              ? 'blue'
              : 'yellow'
          "
          variant="soft"
        >
          {{ statusLabel }}
        </Badge>
      </div>
    </div>

    <!-- 标题：优先显示 folderName，否则显示包名 -->
    <div class="mb-1">
      <div class="text-xs text-base-200 truncate font-medium" :title="cardTitle">
        {{ cardTitle }}
      </div>
      <div v-if="item.packageVersion" class="text-[10px] text-base-500 font-mono">
        v{{ item.packageVersion }}
      </div>
    </div>

    <!-- Meta Info -->
    <div class="text-[10px] text-base-600 mb-2 font-mono">
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
      <Progress
        :value="(item.progress.current / item.progress.total) * 100"
        size="xs"
      />
      <div class="text-[10px] text-base-600 mt-0.5 text-right font-mono">
        {{ item.progress.current }} / {{ item.progress.total }}
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-1.5">
      <Button
        size="xs"
        color="green"
        variant="soft"
        :to="item.zipUrl ? `${serverBaseUrl}${item.zipUrl}` : undefined"
        :disabled="item.status !== 'completed' || !item.zipUrl"
        class="flex-1"
      >
        下载
      </Button>
      <Button
        size="xs"
        color="gray"
        variant="ghost"
        icon="i-heroicons-folder-open"
        :loading="openingFolder"
        @click="handleOpenFolder"
      />
      <Button
        size="xs"
        color="gray"
        variant="ghost"
        @click="$emit('viewLogs', item.taskId)"
      >
        日志
      </Button>
      <Button
        v-if="item.auditReport"
        size="xs"
        :color="auditBadgeColor"
        variant="ghost"
        @click="$emit('viewAudit', item.taskId)"
      >
        审计
      </Button>
      <Popconfirm
        ref="popconfirmRef"
        title="确定删除此记录？此操作不可撤销。"
        confirm-text="删除"
        cancel-text="取消"
        placement="top"
        :loading="deleting"
        @confirm="handleDelete"
        @cancel="popconfirmRef?.close()"
      >
        <template #trigger>
          <Button
            size="xs"
            color="red"
            variant="ghost"
            icon="i-heroicons-trash"
            @click="popconfirmRef?.open()"
          />
        </template>
      </Popconfirm>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HistoryItem } from "@npm-downloader/types";
import Badge from './ui/Badge.vue';
import Button from './ui/Button.vue';
import Progress from './ui/Progress.vue';
import Popconfirm from './ui/Popconfirm.vue';

const props = defineProps<{
  item: HistoryItem;
  serverBaseUrl: string;
  formatTime: (ts: number) => string;
  deleteItem: (taskId: string) => Promise<boolean>;
}>();

const emit = defineEmits<{
  (e: "viewLogs", taskId: string): void;
  (e: "viewAudit", taskId: string): void;
  (e: "deleted"): void;
}>();

const deleting = ref(false);
const openingFolder = ref(false);
const popconfirmRef = ref<InstanceType<typeof Popconfirm> | null>(null);

/** 审计按钮颜色：根据审计状态区分 */
const auditBadgeColor = computed(() => {
  const status = props.item.auditReport?.auditStatus;
  if (status === "blocked") return "red";
  if (status === "risky") return "yellow";
  if (status === "unavailable") return "gray";
  return "green";
});

// 状态标签中文映射
const statusLabel = computed(() => {
  switch (props.item.status) {
    case "pending": return "等待中";
    case "auditing": return "审计中";
    case "processing": return "下载中";
    case "completed": return "已完成";
    case "failed": return "失败";
    default: return props.item.status;
  }
});

const handleDelete = async () => {
  deleting.value = true;
  try {
    const success = await props.deleteItem(props.item.taskId);
    if (success) {
      emit("deleted");
    }
  } finally {
    deleting.value = false;
    popconfirmRef.value?.close();
  }
};

const handleOpenFolder = async () => {
  openingFolder.value = true;
  try {
    await fetch(`${props.serverBaseUrl}/api/open-folder/${props.item.taskId}`);
  } catch {
    // 静默失败
  } finally {
    openingFolder.value = false;
  }
};

/** 卡片标题：优先用 folderName，其次用包名，最后用 taskId 前缀 */
const cardTitle = computed(() => {
  if (props.item.folderName) return props.item.folderName;
  if (props.item.packageName) {
    const name = props.item.packageName;
    if (name.includes("@") && !name.startsWith("@")) {
      return name.substring(0, name.lastIndexOf("@"));
    }
    return name;
  }
  return props.item.taskId.slice(0, 8);
});
</script>
