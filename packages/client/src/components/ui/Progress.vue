<template>
  <div :class="containerClasses">
    <div
      class="h-full rounded-full bg-accent transition-all duration-300 ease-out shadow-sm shadow-accent/20"
      :style="{ width: `${normalizedValue}%` }"
    />
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    value: number
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
    max?: number
  }>(),
  {
    size: 'md',
    max: 100,
  }
)

const sizeClasses: Record<string, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-3',
  xl: 'h-4',
}

const containerClasses = computed(() => {
  return [
    'w-full bg-base-800 rounded-full overflow-hidden',
    sizeClasses[props.size],
  ].join(' ')
})

const normalizedValue = computed(() => {
  return Math.min(Math.max((props.value / props.max) * 100, 0), 100)
})
</script>
