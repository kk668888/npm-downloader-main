<template>
  <div :class="containerClasses">
    <div v-if="$slots.prefix || icon || (prefix && prefixModel)" class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
      <slot name="prefix">
        <Icon v-if="icon" :name="icon" size="sm" class="text-base-500" />
        <span v-if="prefix && prefixModel" class="text-base-500 text-sm">{{ prefix }}</span>
      </slot>
    </div>

    <input
      :id="id"
      ref="inputRef"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :maxlength="maxlength"
      :class="inputClasses"
      @input="handleInput"
      @blur="handleBlur"
      @focus="handleFocus"
      @keydown="handleKeydown"
    />

    <div v-if="$slots.suffix || (suffix && suffixModel)" class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
      <slot name="suffix">
        <span v-if="suffix && suffixModel" class="text-base-500 text-sm">{{ suffix }}</span>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from './Icon.vue'

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
type Color = 'gray' | 'primary' | 'red' | 'green'

const props = withDefaults(
  defineProps<{
    id?: string
    type?: string
    modelValue?: string | number
    placeholder?: string
    disabled?: boolean
    readonly?: boolean
    maxlength?: number
    size?: Size
    color?: Color
    icon?: string
    prefix?: string
    suffix?: string
  }>(),
  {
    type: 'text',
    disabled: false,
    readonly: false,
    size: 'md',
    color: 'gray',
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number): void
  (e: 'blur', event: FocusEvent): void
  (e: 'focus', event: FocusEvent): void
  (e: 'keydown', event: KeyboardEvent): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const focused = ref(false)
const slots = useSlots()

const prefixModel = computed(() => props.prefix)
const suffixModel = computed(() => props.suffix)
const hasPrefixSlot = computed(() => !!slots.prefix)
const hasSuffixSlot = computed(() => !!slots.suffix)

const sizeClasses: Record<Size, string> = {
  xs: 'text-xs px-2 py-1',
  sm: 'text-xs px-2.5 py-1.5',
  md: 'text-sm px-3 py-2',
  lg: 'text-base px-4 py-2.5',
  xl: 'text-lg px-5 py-3',
}

const colorClasses: Record<Color, { base: string; focus: string; error: string }> = {
  gray: {
    base: 'bg-base-900 border-base-700 text-base-200 placeholder:text-base-500',
    focus: 'border-accent/50 ring-1 ring-accent/30',
    error: '',
  },
  primary: {
    base: 'bg-base-900 border-accent/30 text-base-200 placeholder:text-base-500',
    focus: 'border-accent ring-1 ring-accent/50',
    error: '',
  },
  red: {
    base: 'bg-base-900 border-danger/30 text-base-200 placeholder:text-base-500',
    focus: 'border-danger ring-1 ring-danger/50',
    error: '',
  },
  green: {
    base: 'bg-base-900 border-success/30 text-base-200 placeholder:text-base-500',
    focus: 'border-success ring-1 ring-success/50',
    error: '',
  },
}

const inputClasses = computed(() => {
  const classes = [
    'block w-full rounded-md border shadow-sm transition-all duration-150',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'focus:outline-none',
    sizeClasses[props.size],
    colorClasses[props.color].base,
  ]

  if (focused.value) {
    classes.push(colorClasses[props.color].focus)
  }

  if (props.icon || props.prefix || hasPrefixSlot.value) {
    classes.push('pl-10')
  }

  if (props.suffix || hasSuffixSlot.value) {
    classes.push('pr-10')
  }

  return classes.join(' ')
})

const containerClasses = computed(() => {
  return 'relative'
})

const handleInput = (e: Event) => {
  const target = e.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

const handleBlur = (e: FocusEvent) => {
  focused.value = false
  emit('blur', e)
}

const handleFocus = (e: FocusEvent) => {
  focused.value = true
  emit('focus', e)
}

const handleKeydown = (e: KeyboardEvent) => {
  emit('keydown', e)
}

defineExpose({
  inputRef,
})
</script>
