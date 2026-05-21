<template>
  <div class="flex items-center gap-2">
    <!-- 级别筛选 -->
    <SelectMenu
      v-model="selectedLevels"
      :options="levelOptions"
      multiple
      size="xs"
    >
      <template #label>
        <span class="text-base-500 text-[11px]">级别</span>
        <span class="ml-1 text-base-200 text-[11px] font-medium">{{ levelLabel }}</span>
      </template>
    </SelectMenu>

    <!-- 搜索 -->
    <div class="relative">
      <Input
        v-model="searchValue"
        icon="i-heroicons-magnifying-glass"
        placeholder="搜索日志..."
        size="xs"
        class="w-44"
      />
    </div>

    <!-- 自动滚动 -->
    <button
      class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors duration-150"
      :class="autoScroll
        ? 'bg-accent/10 text-accent'
        : 'text-base-500 hover:text-base-300 hover:bg-base-800/50'
      "
      @click="toggleAutoScroll"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="w-3 h-3"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 5v14" />
        <path d="m19 12-7 7-7-7" />
      </svg>
      自动滚动
    </button>
  </div>
</template>

<script setup lang="ts">
import Input from '../ui/Input.vue';
import SelectMenu from '../ui/SelectMenu.vue';

interface LogFilters {
  level: ("info" | "warn" | "error" | "all")[];
  search: string;
  autoScroll: boolean;
}

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
