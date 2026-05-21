<template>
  <div :class="alertClasses">
    <div class="flex items-start gap-3">
      <div v-if="icon" class="shrink-0">
        <Icon :name="icon" :size="iconSize" />
      </div>
      <div class="flex-1 min-w-0">
        <div v-if="title" class="font-medium" :class="titleClasses">{{ title }}</div>
        <div v-if="$slots.default" class="text-sm mt-1" :class="descriptionClasses">
          <slot />
        </div>
      </div>
      <div v-if="$slots.close" class="shrink-0">
        <slot name="close" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from './Icon.vue'

type Color = 'gray' | 'red' | 'yellow' | 'green' | 'blue'
type Variant = 'solid' | 'outline' | 'soft'
type Size = 'xs' | 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    title?: string
    color?: Color
    variant?: Variant
    icon?: string
    iconSize?: Size
    ui?: any
  }>(),
  {
    color: 'gray',
    variant: 'soft',
    iconSize: 'sm',
  }
)

const defaultIcons: Record<Color, string> = {
  gray: 'i-heroicons-information-circle',
  red: 'i-heroicons-exclamation-circle',
  yellow: 'i-heroicons-exclamation-triangle',
  green: 'i-heroicons-check-circle',
  blue: 'i-heroicons-information-circle',
}

const icon = computed(() => props.icon || defaultIcons[props.color])

const colorClasses: Record<Color, Record<Variant, { container: string; title: string; description: string }>> = {
  gray: {
    solid: {
      container: 'bg-base-800 text-base-200',
      title: 'text-base-100',
      description: 'text-base-400',
    },
    outline: {
      container: 'border border-base-700 bg-transparent',
      title: 'text-base-200',
      description: 'text-base-400',
    },
    soft: {
      container: 'bg-base-800/50 border border-base-800',
      title: 'text-base-200',
      description: 'text-base-400',
    },
  },
  red: {
    solid: {
      container: 'bg-danger/10 text-danger',
      title: 'text-danger',
      description: 'text-danger/80',
    },
    outline: {
      container: 'border border-danger/30 bg-transparent',
      title: 'text-danger',
      description: 'text-danger/80',
    },
    soft: {
      container: 'bg-danger/5 border border-danger/20',
      title: 'text-danger',
      description: 'text-danger/80',
    },
  },
  yellow: {
    solid: {
      container: 'bg-accent/10 text-accent',
      title: 'text-accent',
      description: 'text-accent/80',
    },
    outline: {
      container: 'border border-accent/30 bg-transparent',
      title: 'text-accent',
      description: 'text-accent/80',
    },
    soft: {
      container: 'bg-accent/5 border border-accent/20',
      title: 'text-accent',
      description: 'text-accent/80',
    },
  },
  green: {
    solid: {
      container: 'bg-success/10 text-success',
      title: 'text-success',
      description: 'text-success/80',
    },
    outline: {
      container: 'border border-success/30 bg-transparent',
      title: 'text-success',
      description: 'text-success/80',
    },
    soft: {
      container: 'bg-success/5 border border-success/20',
      title: 'text-success',
      description: 'text-success/80',
    },
  },
  blue: {
    solid: {
      container: 'bg-accent/10 text-accent',
      title: 'text-accent',
      description: 'text-accent/80',
    },
    outline: {
      container: 'border border-accent/30 bg-transparent',
      title: 'text-accent',
      description: 'text-accent/80',
    },
    soft: {
      container: 'bg-accent/5 border border-accent/20',
      title: 'text-accent',
      description: 'text-accent/80',
    },
  },
}

const alertClasses = computed(() => {
  const classes = [
    'rounded-lg p-4',
    colorClasses[props.color][props.variant].container,
  ]
  return classes.join(' ')
})

const titleClasses = computed(() => {
  return colorClasses[props.color][props.variant].title
})

const descriptionClasses = computed(() => {
  return colorClasses[props.color][props.variant].description
})
</script>
