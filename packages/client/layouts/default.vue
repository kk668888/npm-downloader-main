<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 flex flex-col">
    <UCard class="flex-1 flex flex-col overflow-hidden">
      <template #header>
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-3">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-cube" class="w-6 h-6 text-primary-500" />
              <h1 class="text-xl font-bold">NPM 依赖下载器</h1>
            </div>
          </div>
          <UButton
            :icon="isDark ? 'i-heroicons-sun' : 'i-heroicons-moon'"
            color="gray"
            variant="ghost"
            @click="toggleDark"
          />
        </div>
      </template>

      <div class="flex-1 overflow-hidden min-h-0">
        <slot />
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const colorMode = useColorMode();

const isDark = computed({
  get() {
    return colorMode.value === "dark";
  },
  set() {
    colorMode.preference = colorMode.value === "dark" ? "light" : "dark";
  },
});

const toggleDark = () => {
  isDark.value = !isDark.value;
};
</script>
