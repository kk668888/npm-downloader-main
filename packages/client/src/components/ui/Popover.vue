<template>
  <div ref="containerRef" class="relative inline-block">
    <Popover v-model="open" as="div" class="relative">
      <PopoverButton
        as="button"
        type="button"
        @click.prevent="toggle"
      >
        <slot name="trigger" :open="open" :close="close" :toggle="toggle" />
      </PopoverButton>

      <Teleport to="body">
        <Transition
          enter-active-class="transition ease-out duration-200"
          enter-from-class="opacity-0 translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition ease-in duration-150"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 translate-y-1"
        >
          <PopoverPanel
            v-if="open"
            class="absolute z-50 bg-base-900 border border-base-700 rounded-lg shadow-soft-lg mt-2 w-56"
            v-bind="popper"
          >
            <slot name="panel" :open="open" :close="close" />
          </PopoverPanel>
        </Transition>
      </Teleport>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/vue'
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = withDefaults(
  defineProps<{
    open?: boolean
    mode?: 'click' | 'hover'
    placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
    popper?: any
    ui?: any
  }>(),
  {
    mode: 'click',
    placement: 'bottom',
  }
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'open'): void
  (e: 'close'): void
}>()

const containerRef = ref<HTMLElement | null>(null)
const internalOpen = ref(false)

const open = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value) => {
    internalOpen.value = value
    emit('update:open', value)
    if (value) {
      emit('open')
    } else {
      emit('close')
    }
  },
})

const close = () => {
  open.value = false
}

const toggle = () => {
  open.value = !open.value
}

defineExpose({
  open,
  close,
  toggle,
})
</script>
