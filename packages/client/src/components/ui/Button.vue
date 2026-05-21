<template>
  <component
    :is="to ? 'a' : 'button'"
    :href="to"
    :target="to && blank ? '_blank' : undefined"
    :disabled="disabled || loading"
    :class="buttonClasses"
    @click="handleClick"
  >
    <Icon v-if="icon && !loading" :name="icon" :size="iconSize" class="shrink-0" />
    <Icon v-if="loading" name="i-heroicons-arrow-path" :size="iconSize" class="animate-spin shrink-0" />
    <span v-if="$slots.default" :class="{ 'ml-2': icon || loading }">
      <slot />
    </span>
  </component>
</template>

<script setup lang="ts">
import Icon from './Icon.vue'

type Color = 'primary' | 'gray' | 'red' | 'green' | 'yellow' | 'blue'
type Variant = 'solid' | 'outline' | 'ghost' | 'soft' | 'subtle'
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const props = withDefaults(
  defineProps<{
    color?: Color
    variant?: Variant
    size?: Size
    icon?: string
    iconSize?: Size
    block?: boolean
    square?: boolean
    loading?: boolean
    disabled?: boolean
    to?: string
    blank?: boolean
  }>(),
  {
    color: 'primary',
    variant: 'solid',
    size: 'md',
    iconSize: 'sm',
    block: false,
    square: false,
    loading: false,
    disabled: false,
    to: undefined,
    blank: false,
  }
)

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const colorClasses: Record<Color, Record<Variant, string>> = {
  primary: {
    solid: 'bg-accent text-base-950 shadow hover:bg-accent/90 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base-950',
    outline: 'border border-accent/50 text-accent hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-accent',
    ghost: 'text-accent hover:bg-accent/10',
    soft: 'bg-accent/10 text-accent hover:bg-accent/20',
    subtle: 'text-accent hover:bg-accent/10',
  },
  gray: {
    solid: 'bg-base-700 hover:bg-base-600 text-base-200 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 focus-visible:ring-offset-base-950',
    outline: 'border border-base-700 text-base-300 hover:bg-base-800',
    ghost: 'text-base-400 hover:bg-base-800 hover:text-base-200',
    soft: 'bg-base-800 text-base-300 hover:bg-base-700',
    subtle: 'text-base-500 hover:bg-base-800',
  },
  red: {
    solid: 'bg-danger text-white shadow hover:bg-danger/90 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-base-950',
    outline: 'border border-danger/50 text-danger hover:bg-danger/10',
    ghost: 'text-danger hover:bg-danger/10',
    soft: 'bg-danger/10 text-danger hover:bg-danger/20',
    subtle: 'text-danger hover:bg-danger/10',
  },
  green: {
    solid: 'bg-success text-base-950 shadow hover:bg-success/90 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2 focus-visible:ring-offset-base-950',
    outline: 'border border-success/50 text-success hover:bg-success/10',
    ghost: 'text-success hover:bg-success/10',
    soft: 'bg-success/10 text-success hover:bg-success/20',
    subtle: 'text-success hover:bg-success/10',
  },
  yellow: {
    solid: 'bg-accent text-base-950 shadow hover:bg-accent/90 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base-950',
    outline: 'border border-accent/50 text-accent hover:bg-accent/10',
    ghost: 'text-accent hover:bg-accent/10',
    soft: 'bg-accent/10 text-accent hover:bg-accent/20',
    subtle: 'text-accent hover:bg-accent/10',
  },
  blue: {
    solid: 'bg-accent text-base-950 shadow hover:bg-accent/90 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base-950',
    outline: 'border border-accent/50 text-accent hover:bg-accent/10',
    ghost: 'text-accent hover:bg-accent/10',
    soft: 'bg-accent/10 text-accent hover:bg-accent/20',
    subtle: 'text-accent hover:bg-accent/10',
  },
}

const sizeClasses: Record<Size, string> = {
  xs: 'text-xs px-2 py-0.5 gap-1 rounded',
  sm: 'text-xs px-2.5 py-1 gap-1.5 rounded-md',
  md: 'text-sm px-3 py-1.5 gap-2 rounded-md',
  lg: 'text-base px-4 py-2 gap-2 rounded-lg',
  xl: 'text-lg px-5 py-2.5 gap-2.5 rounded-lg',
}

const iconSizeClasses: Record<Size, string> = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-7 h-7',
}

const buttonClasses = computed(() => {
  const classes = [
    'btn inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
    colorClasses[props.color][props.variant],
    sizeClasses[props.size],
  ]

  if (props.block) {
    classes.push('w-full')
  }

  if (props.square) {
    classes.push('p-0')
  }

  return classes.join(' ')
})

const handleClick = (e: MouseEvent) => {
  if (!props.disabled && !props.loading && !props.to) {
    emit('click', e)
  }
}
</script>
