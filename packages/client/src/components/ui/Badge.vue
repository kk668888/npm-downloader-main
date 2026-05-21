<template>
  <span :class="badgeClasses">
    <Icon v-if="icon" :name="icon" :size="iconSize" class="shrink-0" />
    <span v-if="$slots.default" :class="{ 'ml-1': icon }">
      <slot />
    </span>
  </span>
</template>

<script setup lang="ts">
import Icon from './Icon.vue'

type Color = 'gray' | 'red' | 'green' | 'yellow' | 'blue' | 'primary'
type Variant = 'solid' | 'outline' | 'soft' | 'subtle'
type Size = 'xs' | 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    color?: Color
    variant?: Variant
    size?: Size
    icon?: string
    iconSize?: Size
  }>(),
  {
    color: 'gray',
    variant: 'soft',
    size: 'sm',
    iconSize: 'xs',
  }
)

const colorClasses: Record<Color, Record<Variant, string>> = {
  gray: {
    solid: 'bg-base-800 text-base-300',
    outline: 'border border-base-700 text-base-400',
    soft: 'bg-base-800/60 text-base-400',
    subtle: 'text-base-500',
  },
  red: {
    solid: 'bg-danger/15 text-danger',
    outline: 'border border-danger/30 text-danger',
    soft: 'bg-danger/10 text-danger',
    subtle: 'text-danger',
  },
  green: {
    solid: 'bg-success/15 text-success',
    outline: 'border border-success/30 text-success',
    soft: 'bg-success/10 text-success',
    subtle: 'text-success',
  },
  yellow: {
    solid: 'bg-accent/15 text-accent',
    outline: 'border border-accent/30 text-accent',
    soft: 'bg-accent/10 text-accent',
    subtle: 'text-accent',
  },
  blue: {
    solid: 'bg-accent/15 text-accent',
    outline: 'border border-accent/30 text-accent',
    soft: 'bg-accent/10 text-accent',
    subtle: 'text-accent',
  },
  primary: {
    solid: 'bg-accent/15 text-accent',
    outline: 'border border-accent/30 text-accent',
    soft: 'bg-accent/10 text-accent',
    subtle: 'text-accent',
  },
}

const sizeClasses: Record<Size, string> = {
  xs: 'text-[9px] px-1 py-0.5 rounded font-medium',
  sm: 'text-xs px-1.5 py-0.5 rounded-md font-medium',
  md: 'text-sm px-2 py-0.5 rounded-md font-medium',
  lg: 'text-base px-3 py-1 rounded-md font-medium',
}

const badgeClasses = computed(() => {
  return [
    'badge inline-flex items-center',
    colorClasses[props.color][props.variant],
    sizeClasses[props.size],
  ].join(' ')
})
</script>
