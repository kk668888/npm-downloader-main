import { vi } from 'vitest'

/**
 * Mock localStorage for tests
 */
export function mockLocalStorage() {
  const store: Record<string, string> = {}

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(key => delete store[key])
    }),
  }
}

/**
 * Mock fetch for API calls
 */
export function mockFetch(response: unknown, options?: { status?: number; ok?: boolean }) {
  const mockResponse = {
    ok: options?.ok ?? true,
    status: options?.status ?? 200,
    json: vi.fn().mockResolvedValue(response),
    text: vi.fn().mockResolvedValue(JSON.stringify(response)),
  }

  global.fetch = vi.fn().mockResolvedValue(mockResponse)
  return mockResponse
}

/**
 * Mock EventSource for SSE tests
 */
export function mockEventSource() {
  const listeners: Map<string, EventListener[]> = new Map()
  let url = ''

  const mock = {
    url: '',
    readyState: 0,
    onopen: null as (() => void) | null,
    onerror: null as ((err: Event) => void) | null,
    onmessage: null as ((event: MessageEvent) => void) | null,
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      const existing = listeners.get(type) || []
      existing.push(listener)
      listeners.set(type, existing)
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      const existing = listeners.get(type) || []
      const index = existing.indexOf(listener)
      if (index > -1) existing.splice(index, 1)
    }),
    close: vi.fn(() => {
      mock.readyState = 2
    }),
    // Helper to simulate events in tests
    _simulateEvent: (type: string, data: unknown) => {
      const eventListeners = listeners.get(type) || []
      const event = new CustomEvent(type, { detail: data })
      eventListeners.forEach(listener => listener(event as Event))
    },
    _simulateOpen: () => {
      mock.readyState = 1
      mock.onopen?.()
    },
    _simulateError: () => {
      mock.onerror?.(new Event('error'))
    },
  }

  // @ts-expect-error Mocking EventSource
  global.EventSource = vi.fn().mockImplementation((inputUrl: string) => {
    mock.url = inputUrl
    return mock
  })

  return mock
}

/**
 * Create a mock file for testing file uploads
 */
export function createMockFile(content: string, name: string, type = 'text/plain'): File {
  return new File([content], name, { type })
}

/**
 * Wait for a specified time (useful for async testing)
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Setup common mocks for component tests
 */
export function setupComponentMocks() {
  // Mock IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))

  // Mock ResizeObserver
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))

  // Mock matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}
