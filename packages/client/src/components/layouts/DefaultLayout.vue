<template>
  <div class="h-screen flex flex-col bg-base-950 overflow-hidden">
    <!-- Header -->
    <header class="px-6 py-3.5 border-b border-base-800/60 flex-shrink-0">
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-3">
          <div class="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-accent" />
          <span class="font-mono text-sm font-medium text-base-100 tracking-tight">NPM 依赖下载器</span>
          <span class="text-[10px] text-base-600 font-mono">v1.0</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-[10px] text-base-600 font-mono">{{ currentTime }}</span>
          <!-- 主题切换按钮 -->
          <button
            class="p-1.5 rounded-md text-base-400 hover:text-base-200 hover:bg-base-800 transition-colors duration-150"
            :title="isDark ? '切换到亮色模式' : '切换到暗色模式'"
            @click="toggleTheme"
          >
            <!-- 太阳图标 (暗色模式下显示，点击切换到亮色) -->
            <svg
              v-if="isDark"
              xmlns="http://www.w3.org/2000/svg"
              class="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
            <!-- 月亮图标 (亮色模式下显示，点击切换到暗色) -->
            <svg
              v-else
              xmlns="http://www.w3.org/2000/svg"
              class="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>
        </div>
      </div>
    </header>
    <!-- Content -->
    <slot />
  </div>
</template>

<script setup lang="ts">
import { useColorMode } from '../../composables/useColorMode';

const colorMode = useColorMode();

const isDark = computed(() => colorMode.value === 'dark');

const toggleTheme = () => {
  colorMode.value = isDark.value ? 'light' : 'dark';
};

const currentTime = ref('');

const updateTime = () => {
  const now = new Date();
  currentTime.value = now.toLocaleTimeString('en-US', { hour12: false });
};

let timer: ReturnType<typeof setInterval>;

onMounted(() => {
  updateTime();
  timer = setInterval(updateTime, 1000);
});

onUnmounted(() => {
  clearInterval(timer);
});
</script>
