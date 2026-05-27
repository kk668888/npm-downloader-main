<template>
  <div class="space-y-3">
    <!-- File Upload Drop Zone -->
    <div
      class="relative border-2 border-dashed border-base-700 rounded-lg p-4 text-center transition-colors"
      :class="[
        busy ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-accent/50',
        { 'border-accent bg-accent/5 scale-[1.01]': isDragging && !busy },
      ]"
      @dragover.prevent="!busy && (isDragging = true)"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="!busy && handleDrop"
      @click="!busy && triggerFileInput()"
    >
      <input
        ref="fileInputRef"
        type="file"
        class="hidden"
        accept=".yaml,.yml"
        @change="handleFileSelect"
      />

      <div class="flex flex-col items-center gap-1">
        <Icon
          name="i-heroicons-cloud-arrow-up"
          class="w-8 h-8 text-base-500"
        />
        <p v-if="!selectedFile" class="text-xs text-base-500">
          拖拽 <span class="font-mono text-accent">pnpm-lock.yaml</span> 文件到此处
        </p>
        <p v-else class="text-xs font-mono text-base-200">
          {{ selectedFile.name }}
        </p>
      </div>
    </div>

    <!-- 自定义文件夹名称输入框（可选） -->
    <Input
      :model-value="folderName"
      :disabled="busy"
      placeholder="自定义文件夹名称（可选）"
      icon="i-heroicons-folder"
      size="md"
      @update:model-value="$emit('update:folderName', String($event))"
    />

    <!-- 超危停止开关 -->
    <div class="flex items-center justify-between">
      <Toggle
        :model-value="blockCritical"
        :disabled="busy"
        label="发现严重漏洞时阻止下载"
        @update:model-value="$emit('update:blockCritical', $event)"
      />
    </div>

    <!-- Upload Button -->
    <Button
      block
      size="md"
      :loading="uploading"
      :disabled="!selectedFile || busy"
      @click="$emit('upload')"
    >
      上传并下载
    </Button>
  </div>
</template>

<script setup lang="ts">
import Button from './ui/Button.vue';
import Icon from './ui/Icon.vue';
import Input from './ui/Input.vue';
import Toggle from './ui/Toggle.vue';

const props = defineProps<{
  selectedFile: File | null;
  uploading: boolean;
  /** 有任何任务进行中时为 true，禁用整个面板 */
  busy: boolean;
  taskId: string | null;
  progress: { current: number; total: number } | null;
  downloadUrl: string;
  /** 用户自定义的文件夹名称（双向绑定，可选） */
  folderName: string;
  /** 超危停止开关（双向绑定） */
  blockCritical: boolean;
}>();

const emit = defineEmits<{
  (e: "selectFile", file: File): void;
  (e: "upload"): void;
  (e: "viewLogs", taskId: string): void;
  /** 文件夹名称变更时向上传递 */
  (e: "update:folderName", value: string): void;
  /** 超危停止开关变更时向上传递 */
  (e: "update:blockCritical", value: boolean): void;
}>();

const isDragging = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

const triggerFileInput = () => {
  fileInputRef.value?.click();
};

const handleFileSelect = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    emit("selectFile", target.files[0]);
  }
};

const handleDrop = (e: DragEvent) => {
  isDragging.value = false;
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    if (file.name.endsWith(".yaml") || file.name.endsWith(".yml")) {
      emit("selectFile", file);
    }
  }
};
</script>
