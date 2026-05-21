import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { usePolling } from '../src/composables/usePolling'
import { mockFetch } from './test-utils'
import type { HistoryItem } from '@npm-downloader/types'

describe('usePolling', () => {
  const serverBaseUrl = 'http://localhost:3002'

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const polling = usePolling(serverBaseUrl)

      expect(polling.historyItems.value).toEqual([])
      expect(polling.historyLoading.value).toBe(false)
      expect(polling.historyError.value).toBe('')
    })
  })

  describe('formatTime', () => {
    it('should format timestamp to locale string', () => {
      const polling = usePolling(serverBaseUrl)
      const timestamp = 1699999999000

      const result = polling.formatTime(timestamp)

      expect(result).toBe(new Date(timestamp).toLocaleString())
    })

    it('should return string representation for invalid date', () => {
      const polling = usePolling(serverBaseUrl)

      const result = polling.formatTime('invalid')

      expect(typeof result).toBe('string')
    })
  })

  describe('refreshHistory', () => {
    it('should fetch and update history items', async () => {
      const polling = usePolling(serverBaseUrl)
      const mockItems: HistoryItem[] = [
        { taskId: '1', type: 'package', status: 'completed', createdAt: Date.now(), updatedAt: Date.now() }
      ]

      mockFetch({ items: mockItems })

      await polling.refreshHistory()
      await vi.runAllTimersAsync()

      expect(polling.historyItems.value).toEqual(mockItems)
    })

    it('should set loading state during fetch', async () => {
      const polling = usePolling(serverBaseUrl)

      mockFetch({ items: [] })

      const promise = polling.refreshHistory()

      expect(polling.historyLoading.value).toBe(true)

      await promise
      await vi.runAllTimersAsync()

      expect(polling.historyLoading.value).toBe(false)
    })

    it('should handle fetch error', async () => {
      const polling = usePolling(serverBaseUrl)

      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))

      await polling.refreshHistory()
      await vi.runAllTimersAsync()

      expect(polling.historyError.value).toBe('Failed to load history')
      expect(polling.historyLoading.value).toBe(false)
    })

    it('should handle malformed response', async () => {
      const polling = usePolling(serverBaseUrl)

      mockFetch({ items: null })

      await polling.refreshHistory()
      await vi.runAllTimersAsync()

      expect(polling.historyItems.value).toEqual([])
    })
  })

  describe('startPolling', () => {
    it('should start polling at specified interval', async () => {
      const polling = usePolling(serverBaseUrl)
      const fetchSpy = vi.spyOn(global, 'fetch')
        .mockResolvedValue({ json: () => Promise.resolve({ items: [] }) } as Response)

      polling.startPolling(1000)

      // Initial call
      expect(fetchSpy).toHaveBeenCalledTimes(0)

      // After interval
      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      // After another interval
      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('should use default interval of 3000ms', async () => {
      const polling = usePolling(serverBaseUrl)
      const fetchSpy = vi.spyOn(global, 'fetch')
        .mockResolvedValue({ json: () => Promise.resolve({ items: [] }) } as Response)

      polling.startPolling()

      vi.advanceTimersByTime(2999)
      await vi.runAllTimersAsync()
      expect(fetchSpy).toHaveBeenCalledTimes(0)

      vi.advanceTimersByTime(1)
      await vi.runAllTimersAsync()
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('should stop previous polling before starting new', async () => {
      const polling = usePolling(serverBaseUrl)
      const fetchSpy = vi.spyOn(global, 'fetch')
        .mockResolvedValue({ json: () => Promise.resolve({ items: [] }) } as Response)

      polling.startPolling(1000)
      polling.startPolling(5000)

      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()

      // Should not have called at 1000ms since we restarted with 5000ms
      expect(fetchSpy).toHaveBeenCalledTimes(0)
    })
  })

  describe('stopPolling', () => {
    it('should stop polling', async () => {
      const polling = usePolling(serverBaseUrl)
      const fetchSpy = vi.spyOn(global, 'fetch')
        .mockResolvedValue({ json: () => Promise.resolve({ items: [] }) } as Response)

      polling.startPolling(1000)

      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      polling.stopPolling()

      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()
      expect(fetchSpy).toHaveBeenCalledTimes(1) // Still 1, not 2
    })

    it('should be safe to call when not polling', () => {
      const polling = usePolling(serverBaseUrl)

      expect(() => polling.stopPolling()).not.toThrow()
    })
  })
})
