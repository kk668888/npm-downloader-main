<template>
  <div class="flex items-center gap-3 flex-wrap">
    <!-- Level Filter -->
    <USelectMenu
      v-model="selectedLevels"
      :options="levelOptions"
      multiple
      size="xs"
      class="w-40"
      :ui-menu="{ 'container': 'dark:bg-obsidian-800 dark:border-obsidian-700' }"
    >
      <template #label>
        <span class="text-gray-400 dark:text-stone-500">级别:</span>
        <span class="ml-1 text-gray-700 dark:text-stone-300">{{ levelLabel }}</span>
      </template>
    </USelectMenu>

    <!-- Search -->
    <UInput
      v-model="searchValue"
      icon="i-heroicons-magnifying-glass"
      placeholder="搜索日志..."
      size="xs"
      class="w-48"
    />

    <!-- Auto-scroll Toggle -->
    <UButton
      :icon="autoScroll ? 'i-heroicons-arrow-down' : 'i-heroicons-arrow-down-tray'"
      size="xs"
      :color="autoScroll ? 'primary' : 'gray'"
      variant="soft"
      @click="toggleAutoScroll"
      class="dark:hover:bg-primary-600 dark:hover:text-white"
    >
      自动滚动
    </UButton>
  </div>
</template>

<script setup lang="ts">
import type { LogFilters } from "~/composables/useLogs";

const props = defineProps<{
  filters: LogFilters;
}>();

const emit = defineEmits<{
  (e: "update:filters", value: LogFilters): void;
}>();

const levelOptions = [
  { label: "全部", value: "all" },
  { label: "信息", value: "info" },
  { label: "警告", value: "warn" },
  { label: "错误", value: "error" },
];

const selectedLevels = computed({
  get: () => props.filters.level,
  set: (value) => emit("update:filters", { ...props.filters, level: value }),
});

const searchValue = computed({
  get: () => props.filters.search,
  set: (value) => emit("update:filters", { ...props.filters, search: value }),
});

const autoScroll = computed({
  get: () => props.filters.autoScroll,
  set: (value) => emit("update:filters", { ...props.filters, autoScroll: value }),
});

const levelLabel = computed(() => {
  if (props.filters.level.includes("all")) return "全部";
  return props.filters.level.map((l) => l.toUpperCase()).join(", ");
});

const toggleAutoScroll = () => {
  emit("update:filters", { ...props.filters, autoScroll: !props.filters.autoScroll });
};
</script>
