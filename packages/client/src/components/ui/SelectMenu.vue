<template>
  <div class="relative">
    <button
      ref="triggerRef"
      type="button"
      :class="triggerClasses"
      @click="toggle"
    >
      <slot name="label">
        <span>{{ displayLabel }}</span>
      </slot>
      <Icon name="i-heroicons-chevron-down" size="xs" class="ml-1.5 shrink-0" />
    </button>

    <Teleport to="body">
      <Transition
        enter-active-class="transition ease-out duration-200"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition ease-in duration-150"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-if="open"
          ref="dropdownRef"
          class="fixed z-[100] bg-base-900 border border-base-700 rounded-lg shadow-soft-lg overflow-hidden"
          :style="dropdownStyle"
        >
          <div class="max-h-64 overflow-y-auto p-1 scrollbar-thin">
            <label
              v-for="option in options"
              :key="option.value"
              class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-base-800 rounded-md transition-colors"
            >
              <input
                v-if="multiple"
                type="checkbox"
                :checked="isSelected(option.value)"
                @change="toggleOption(option.value)"
                class="rounded border-base-600 text-accent focus:ring-accent bg-base-800"
              />
              <span class="flex-1 text-sm text-base-300">{{ option.label }}</span>
              <Icon
                v-if="!multiple && isSelected(option.value)"
                name="i-heroicons-check"
                size="sm"
                class="text-accent"
              />
            </label>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import Icon from './Icon.vue'

interface Option {
  label: string
  value: string
}

const props = withDefaults(
  defineProps<{
    options: Option[]
    modelValue?: string | string[]
    multiple?: boolean
    size?: 'xs' | 'sm' | 'md' | 'lg'
    placeholder?: string
  }>(),
  {
    multiple: false,
    size: 'sm',
    placeholder: '请选择...',
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | string[]): void
}>()

const open = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const dropdownPosition = ref<{ top: number; left: number; width: number } | null>(null)

const sizeClasses: Record<string, string> = {
  xs: 'text-xs px-2 py-1',
  sm: 'text-xs px-2.5 py-1.5',
  md: 'text-sm px-3 py-2',
  lg: 'text-base px-4 py-2',
}

const triggerClasses = computed(() => {
  return [
    'inline-flex items-center justify-between gap-1',
    'bg-base-900 border border-base-700',
    'rounded-md shadow-sm hover:bg-base-800',
    'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50',
    'transition-all duration-150',
    'text-base-300',
    sizeClasses[props.size],
    props.multiple ? 'min-w-[160px]' : 'min-w-[120px]',
  ].join(' ')
})

const displayLabel = computed(() => {
  const value = props.modelValue

  if (props.multiple) {
    if (Array.isArray(value) && value.length > 0) {
      return props.options
        .filter((opt) => value.includes(opt.value))
        .map((opt) => opt.label)
        .join(', ')
    }
    return props.placeholder
  } else {
    const option = props.options.find((opt) => opt.value === value)
    return option?.label || props.placeholder
  }
})

const dropdownStyle = computed(() => {
  if (!dropdownPosition.value) return {}
  return {
    top: `${dropdownPosition.value.top}px`,
    left: `${dropdownPosition.value.left}px`,
    width: `${dropdownPosition.value.width}px`,
  }
})

const isSelected = (value: string) => {
  if (props.multiple) {
    return Array.isArray(props.modelValue) && props.modelValue.includes(value)
  }
  return props.modelValue === value
}

const toggleOption = (value: string) => {
  if (props.multiple) {
    const current = Array.isArray(props.modelValue) ? props.modelValue : []
    if (current.includes(value)) {
      emit('update:modelValue', current.filter((v) => v !== value))
    } else {
      emit('update:modelValue', [...current, value])
    }
  } else {
    emit('update:modelValue', value)
    open.value = false
  }
}

const updateDropdownPosition = () => {
  if (triggerRef.value) {
    const rect = triggerRef.value.getBoundingClientRect()
    dropdownPosition.value = {
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    }
  }
}

const toggle = () => {
  open.value = !open.value
  if (open.value) {
    nextTick(() => {
      updateDropdownPosition()
    })
  }
}

const close = (e: MouseEvent) => {
  if (
    triggerRef.value &&
    dropdownRef.value &&
    !triggerRef.value.contains(e.target as Node) &&
    !dropdownRef.value.contains(e.target as Node)
  ) {
    open.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', close)
  window.addEventListener('resize', updateDropdownPosition)
  window.addEventListener('scroll', updateDropdownPosition)
})

onUnmounted(() => {
  document.removeEventListener('click', close)
  window.removeEventListener('resize', updateDropdownPosition)
  window.removeEventListener('scroll', updateDropdownPosition)
})
</script>
