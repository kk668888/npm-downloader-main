<template>
  <div class="space-y-3">
    <!-- File Upload -->
    <div
      class="relative border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-4 text-center hover:border-primary dark:hover:border-primary/70 transition-colors cursor-pointer"
      :class="{ 'border-primary bg-primary/5 dark:bg-primary/10': isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
      @click="triggerFileInput"
    >
      <input
        ref="fileInputRef"
        type="file"
        class="hidden"
        accept=".yaml,.yml"
        @change="handleFileSelect"
      />

      <div class="flex flex-col items-center gap-1">
        <UIcon
          name="i-heroicons-cloud-arrow-up"
          class="w-8 h-8 text-slate-400 dark:text-slate-500"
        />
        <p v-if="!selectedFile" class="text-sm text-slate-500 dark:text-slate-400">
          拖拽 <span class="font-medium text-primary">pnpm-lock.yaml</span> 文件到此处
        </p>
        <p v-else class="text-sm font-medium text-slate-700 dark:text-slate-200">
          {{ selectedFile.name }}
        </p>
      </div>
    </div>

    <!-- Upload Button -->
    <UButton
      block
      size="md"
      color="primary"
      :loading="uploading"
      :disabled="!selectedFile"
      @click="$emit('upload')"
    >
      上传并下载
    </UButton>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  selectedFile: File | null;
  uploading: boolean;
  taskId: string | null;
  progress: { current: number; total: number } | null;
  downloadUrl: string;
}>();

const emit = defineEmits<{
  (e: "selectFile", file: File): void;
  (e: "upload"): void;
  (e: "viewLogs", taskId: string): void;
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
