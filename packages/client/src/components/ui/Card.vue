<template>
  <div
    class="card bg-base-900/40 border border-base-800 rounded-lg text-base-200 transition-colors duration-200"
    :class="[hoverable && 'hover:bg-base-900/70 hover:border-base-700']"
  >
    <div v-if="$slots.header" class="px-4 py-3 sm:px-5 sm:py-3.5 border-b border-base-800/60">
      <slot name="header" />
    </div>
    <div class="p-4 sm:p-5" :class="ui.bodyClass">
      <slot />
    </div>
    <div v-if="$slots.footer" class="px-4 py-3 sm:px-5 sm:py-3.5 border-t border-base-800/60 bg-base-900/30">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
interface CardUi {
  class?: string;
  bodyClass?: string;
}

const props = defineProps<{
  ui?: CardUi;
  hoverable?: boolean;
}>()

const ui = computed(() => ({
  class: props.ui?.class || '',
  bodyClass: props.ui?.bodyClass || '',
}))
</script>
