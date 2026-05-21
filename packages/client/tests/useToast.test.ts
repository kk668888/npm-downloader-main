import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useToast } from '../src/composables/useToast'

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    // Clear any existing toasts
    const { clear } = useToast()
    clear()
  })

  describe('add', () => {
    it('should add a toast with default values', () => {
      const { add, toasts } = useToast()

      add('Test message')

      expect(toasts.value).toHaveLength(1)
      expect(toasts.value[0].title).toBe('Test message')
      expect(toasts.value[0].color).toBe('gray')
      expect(toasts.value[0].timeout).toBe(3000)
    })

    it('should add a toast with custom options', () => {
      const { add, toasts } = useToast()

      add('Error occurred', {
        color: 'red',
        description: 'Something went wrong',
        icon: 'i-heroicons-x-circle',
        timeout: 5000
      })

      expect(toasts.value[0]).toMatchObject({
        title: 'Error occurred',
        color: 'red',
        description: 'Something went wrong',
        icon: 'i-heroicons-x-circle',
        timeout: 5000
      })
    })

    it('should return unique toast id', () => {
      const { add } = useToast()

      const id1 = add('First')
      const id2 = add('Second')

      expect(id1).not.toBe(id2)
    })

    it('should auto-remove toast after timeout', async () => {
      const { add, toasts } = useToast()

      add('Auto remove', { timeout: 1000 })

      expect(toasts.value).toHaveLength(1)

      vi.advanceTimersByTime(1000)

      expect(toasts.value).toHaveLength(0)
    })

    it('should not auto-remove toast when timeout is 0', async () => {
      const { add, toasts } = useToast()

      add('Permanent', { timeout: 0 })

      vi.advanceTimersByTime(10000)

      expect(toasts.value).toHaveLength(1)
    })

    it('should not auto-remove toast when timeout is negative', async () => {
      const { add, toasts } = useToast()

      add('Permanent', { timeout: -1 })

      vi.advanceTimersByTime(10000)

      expect(toasts.value).toHaveLength(1)
    })
  })

  describe('remove', () => {
    it('should remove toast by id', () => {
      const { add, remove, toasts } = useToast()

      const id = add('To remove')
      add('To keep')

      remove(id)

      expect(toasts.value).toHaveLength(1)
      expect(toasts.value[0].title).toBe('To keep')
    })

    it('should do nothing if toast not found', () => {
      const { add, remove, toasts } = useToast()

      add('Test')

      remove(99999)

      expect(toasts.value).toHaveLength(1)
    })
  })

  describe('clear', () => {
    it('should remove all toasts', () => {
      const { add, clear, toasts } = useToast()

      add('First')
      add('Second')
      add('Third')

      expect(toasts.value).toHaveLength(3)

      clear()

      expect(toasts.value).toHaveLength(0)
    })

    it('should be safe to call when no toasts exist', () => {
      const { clear, toasts } = useToast()

      clear()

      expect(toasts.value).toHaveLength(0)
    })
  })

  describe('toasts reactivity', () => {
    it('should share toasts across useToast calls', () => {
      const { add, toasts: toasts1 } = useToast()
      const { toasts: toasts2 } = useToast()

      add('Shared toast')

      expect(toasts1.value).toHaveLength(1)
      expect(toasts2.value).toHaveLength(1)
      expect(toasts1.value[0].title).toBe('Shared toast')
    })
  })
})
