import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useLogStream } from '../src/composables/useLogStream'
import { mockEventSource } from './test-utils'
import type { TaskLog } from '@npm-downloader/types'

describe('useLogStream', () => {
  const serverBaseUrl = 'http://localhost:3002'
  let esMock: ReturnType<typeof mockEventSource>

  beforeEach(() => {
    vi.useFakeTimers()
    esMock = mockEventSource()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const stream = useLogStream(serverBaseUrl)

      expect(stream.logs.value).toEqual([])
      expect(stream.status.value).toBe('disconnected')
      expect(stream.error.value).toBe('')
    })
  })

  describe('connect', () => {
    it('should create EventSource with correct URL', () => {
      const stream = useLogStream(serverBaseUrl)

      stream.connect('task-123')

      expect(global.EventSource).toHaveBeenCalledWith('http://localhost:3002/api/logs/task-123/stream')
    })

    it('should set status to connecting', () => {
      const stream = useLogStream(serverBaseUrl)

      stream.connect('task-123')

      expect(stream.status.value).toBe('connecting')
    })

    it('should set status to connected on open', () => {
      const stream = useLogStream(serverBaseUrl)

      stream.connect('task-123')
      esMock._simulateOpen()

      expect(stream.status.value).toBe('connected')
    })

    it('should clear previous connection on new connect', () => {
      const stream = useLogStream(serverBaseUrl)

      stream.connect('task-1')
      stream.connect('task-2')

      expect(esMock.close).toHaveBeenCalled()
    })
  })

  describe('history event', () => {
    it('should parse and set logs from history event', () => {
      const stream = useLogStream(serverBaseUrl)
      const historyLogs: TaskLog[] = [
        { level: 'info', message: 'Starting', timestamp: Date.now() }
      ]

      stream.connect('task-123')
      esMock._simulateOpen()

      // Simulate history event
      const event = new CustomEvent('history', {
        detail: JSON.stringify({ logs: historyLogs })
      })
      Object.defineProperty(event, 'data', { value: JSON.stringify({ logs: historyLogs }) })
      esMock.addEventListener.mock.calls
        .filter(call => call[0] === 'history')
        .forEach(call => call[1](event as Event))

      expect(stream.logs.value).toEqual(historyLogs)
    })
  })

  describe('log event', () => {
    it('should append log to logs array', () => {
      const stream = useLogStream(serverBaseUrl)
      const newLog: TaskLog = { level: 'info', message: 'Progress 50%', timestamp: Date.now() }

      stream.connect('task-123')
      esMock._simulateOpen()

      // Simulate log event
      const event = new CustomEvent('log')
      Object.defineProperty(event, 'data', { value: JSON.stringify(newLog) })
      esMock.addEventListener.mock.calls
        .filter(call => call[0] === 'log')
        .forEach(call => call[1](event as Event))

      expect(stream.logs.value).toContainEqual(newLog)
    })
  })

  describe('end event', () => {
    it('should set status to ended and disconnect', () => {
      const stream = useLogStream(serverBaseUrl)

      stream.connect('task-123')
      esMock._simulateOpen()

      // Simulate end event
      const event = new CustomEvent('end')
      Object.defineProperty(event, 'data', { value: JSON.stringify({ done: true }) })
      esMock.addEventListener.mock.calls
        .filter(call => call[0] === 'end')
        .forEach(call => call[1](event as Event))

      expect(stream.status.value).toBe('ended')
    })
  })

  describe('error handling and reconnection', () => {
    it('should attempt reconnection on error', async () => {
      const stream = useLogStream(serverBaseUrl)

      stream.connect('task-123')
      esMock._simulateOpen()
      esMock._simulateError()

      expect(stream.status.value).toBe('connecting')
      expect(stream.error.value).toContain('reconnecting')
    })

    it('should stop reconnecting after max attempts', async () => {
      const stream = useLogStream(serverBaseUrl)

      stream.connect('task-123')
      esMock._simulateOpen()

      // Simulate 5 failed reconnection attempts
      for (let i = 0; i < 6; i++) {
        esMock._simulateError()
        vi.advanceTimersByTime(10000)
      }

      expect(stream.status.value).toBe('error')
      expect(stream.error.value).toContain('Failed to connect')
    })

    it('should use exponential backoff for reconnection delay', async () => {
      const stream = useLogStream(serverBaseUrl)

      stream.connect('task-123')
      esMock._simulateOpen()

      esMock._simulateError()
      expect(stream.error.value).toContain('1s') // First attempt: 1s

      vi.advanceTimersByTime(2000)
      esMock._simulateError()
      expect(stream.error.value).toContain('2s') // Second attempt: 2s
    })
  })

  describe('disconnect', () => {
    it('should close EventSource and reset state', () => {
      const stream = useLogStream(serverBaseUrl)

      stream.connect('task-123')
      esMock._simulateOpen()

      stream.disconnect()

      expect(esMock.close).toHaveBeenCalled()
      expect(stream.status.value).toBe('disconnected')
    })

    it('should clear reconnect timeout', () => {
      const stream = useLogStream(serverBaseUrl)

      stream.connect('task-123')
      esMock._simulateOpen()
      esMock._simulateError()

      stream.disconnect()

      // Should not attempt reconnection after disconnect
      vi.advanceTimersByTime(10000)
      expect(global.EventSource).toHaveBeenCalledTimes(1)
    })
  })
})
