import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { useColorMode } from '../src/composables/useColorMode'
import { mockLocalStorage } from './test-utils'

describe('useColorMode', () => {
  let localStorageMock: ReturnType<typeof mockLocalStorage>

  beforeEach(() => {
    localStorageMock = mockLocalStorage()
    Object.defineProperty(window, 'localStorage', { value: localStorageMock })

    // Reset document classes
    document.documentElement.classList.remove('dark', 'light')
  })

  it('should default to light mode when no stored preference', () => {
    const mode = useColorMode()
    expect(mode.value).toBe('light')
  })

  it('should read stored preference from localStorage', () => {
    localStorageMock.getItem.mockReturnValue('dark')

    const mode = useColorMode()
    expect(mode.value).toBe('dark')
  })

  it('should add dark class to documentElement when mode is dark', async () => {
    localStorageMock.getItem.mockReturnValue('dark')

    useColorMode()
    await nextTick()

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  it('should add light class to documentElement when mode is light', async () => {
    localStorageMock.getItem.mockReturnValue('light')

    useColorMode()
    await nextTick()

    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('should save mode to localStorage on change', async () => {
    const mode = useColorMode()

    mode.value = 'dark'
    await nextTick()

    expect(localStorageMock.setItem).toHaveBeenCalledWith('color-mode', 'dark')
  })

  it('should update document classes on mode change', async () => {
    const mode = useColorMode()

    mode.value = 'dark'
    await nextTick()

    expect(document.documentElement.classList.contains('dark')).toBe(true)

    mode.value = 'light'
    await nextTick()

    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('should have preference property aliased to value', () => {
    const mode = useColorMode()

    expect(mode.preference).toBe(mode.value)
  })
})
