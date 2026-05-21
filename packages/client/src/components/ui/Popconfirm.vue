<template>
  <div ref="containerRef" class="relative inline-flex">
    <slot name="trigger" :open="isOpen" />
    <Teleport to="body">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-40"
        @click="cancel"
      />
      <Transition
        enter-active-class="transition ease-out duration-150"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition ease-in duration-100"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-if="isOpen"
          ref="panelRef"
          class="fixed z-50 w-56 rounded-lg border border-base-700 bg-base-900 shadow-2xl shadow-black/40"
          :style="panelStyle"
        >
          <!-- Arrow -->
          <div
            class="absolute h-2.5 w-2.5 rotate-45 border border-base-700 bg-base-900"
            :class="arrowClass"
            :style="arrowStyle"
          />

          <!-- Content -->
          <div class="p-3">
            <div class="flex items-start gap-2.5">
              <div
                class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                :class="iconBgClass"
              >
                <Icon :name="icon" size="xs" :class="iconClass" />
              </div>
              <p class="text-xs text-base-300 leading-relaxed">
                {{ title }}
              </p>
            </div>

            <!-- Actions -->
            <div class="mt-3 flex items-center justify-end gap-2">
              <Button
                size="xs"
                color="gray"
                variant="ghost"
                @click="cancel"
              >
                {{ cancelText }}
              </Button>
              <Button
                size="xs"
                :color="confirmColor"
                variant="solid"
                :loading="loading"
                @click="confirm"
              >
                {{ confirmText }}
              </Button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import Button from './Button.vue'
import Icon from './Icon.vue'

type Placement = 'top' | 'bottom'

const props = withDefaults(
  defineProps<{
    title: string
    icon?: string
    confirmText?: string
    cancelText?: string
    confirmColor?: 'red' | 'primary'
    placement?: Placement
    loading?: boolean
  }>(),
  {
    icon: 'i-heroicons-exclamation-triangle',
    confirmText: '确认',
    cancelText: '取消',
    confirmColor: 'red',
    placement: 'top',
    loading: false,
  }
)

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
  (e: 'update:open', value: boolean): void
}>()

const containerRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const panelStyle = ref<Record<string, string>>({})
const arrowStyle = ref<Record<string, string>>({})
const arrowClass = ref('')

const iconBgClass = computed(() => {
  if (props.confirmColor === 'red') {
    return 'bg-danger/10'
  }
  return 'bg-accent/10'
})

const iconClass = computed(() => {
  if (props.confirmColor === 'red') {
    return 'text-danger'
  }
  return 'text-accent'
})

function positionPanel() {
  if (!containerRef.value || !panelRef.value) return

  const triggerRect = containerRef.value.getBoundingClientRect()
  const panelRect = panelRef.value.getBoundingClientRect()
  const gap = 10

  let top: number
  let left = triggerRect.left + triggerRect.width / 2 - panelRect.width / 2

  // Clamp horizontal position to viewport
  left = Math.max(8, Math.min(left, window.innerWidth - panelRect.width - 8))

  if (props.placement === 'top') {
    top = triggerRect.top - panelRect.height - gap
    // If not enough space above, flip below
    if (top < 8) {
      top = triggerRect.bottom + gap
      setArrowPosition(triggerRect, left, 'bottom')
    } else {
      setArrowPosition(triggerRect, left, 'top')
    }
  } else {
    top = triggerRect.bottom + gap
    // If not enough space below, flip above
    if (top + panelRect.height > window.innerHeight - 8) {
      top = triggerRect.top - panelRect.height - gap
      setArrowPosition(triggerRect, left, 'top')
    } else {
      setArrowPosition(triggerRect, left, 'bottom')
    }
  }

  panelStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
  }
}

function setArrowPosition(triggerRect: DOMRect, panelLeft: number, side: 'top' | 'bottom') {
  const arrowOffset = triggerRect.left + triggerRect.width / 2 - panelLeft

  if (side === 'top') {
    // Arrow at bottom of panel, pointing down
    arrowClass.value = '-bottom-[5px] border-t-0 border-l-0'
    arrowStyle.value = { left: `${arrowOffset - 5}px` }
  } else {
    // Arrow at top of panel, pointing up
    arrowClass.value = '-top-[5px] border-b-0 border-r-0'
    arrowStyle.value = { left: `${arrowOffset - 5}px` }
  }
}

function open() {
  isOpen.value = true
  nextTick(() => positionPanel())
}

function close() {
  isOpen.value = false
}

function confirm() {
  emit('confirm')
}

function cancel() {
  isOpen.value = false
  emit('cancel')
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isOpen.value) {
    cancel()
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))

defineExpose({ open, close })
</script>
