import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useTaskManager } from '../src/composables/useTaskManager'
import { mockFetch, createMockFile } from './test-utils'

describe('useTaskManager', () => {
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
      const manager = useTaskManager(serverBaseUrl)

      expect(manager.uploading.value).toBe(false)
      expect(manager.downloadingPackage.value).toBe(false)
      expect(manager.file.value).toBeNull()
      expect(manager.taskId.value).toBeNull()
      expect(manager.taskProgress.value).toBeNull()
      expect(manager.packageName.value).toBe('')
      expect(manager.packageTaskId.value).toBeNull()
    })

    it('should compute correct downloadUrl', () => {
      const manager = useTaskManager(serverBaseUrl)
      manager.taskId.value = 'test-task-123'

      expect(manager.downloadUrl.value).toBe('http://localhost:3002/api/download/test-task-123')
    })

    it('should compute correct packageDownloadUrl', () => {
      const manager = useTaskManager(serverBaseUrl)
      manager.packageTaskId.value = 'pkg-task-456'

      expect(manager.packageDownloadUrl.value).toBe('http://localhost:3002/api/download/pkg-task-456')
    })
  })

  describe('handleFileUpload', () => {
    it('should set file when input has files', () => {
      const manager = useTaskManager(serverBaseUrl)
      const file = createMockFile('test content', 'test.yaml')
      const event = {
        target: { files: [file] }
      } as unknown as Event

      manager.handleFileUpload(event)

      expect(manager.file.value).toBe(file)
    })

    it('should not set file when input has no files', () => {
      const manager = useTaskManager(serverBaseUrl)
      const event = {
        target: { files: [] }
      } as unknown as Event

      manager.handleFileUpload(event)

      expect(manager.file.value).toBeNull()
    })
  })

  describe('uploadFile', () => {
    it('should not upload if no file is set', async () => {
      const manager = useTaskManager(serverBaseUrl)
      const fetchSpy = vi.spyOn(global, 'fetch')

      await manager.uploadFile()

      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('should upload file and set taskId', async () => {
      const manager = useTaskManager(serverBaseUrl)
      manager.file.value = createMockFile('lockfile content', 'pnpm-lock.yaml')

      mockFetch({ taskId: 'task-123', zipUrl: '/api/download/task-123' })

      // Mock the status polling
      mockFetch({ status: 'completed', progress: { current: 1, total: 1 } })

      const onProgress = vi.fn()
      const onComplete = vi.fn()

      manager.uploadFile(onProgress, onComplete)

      // Wait for initial fetch
      await vi.runAllTimersAsync()

      expect(manager.uploading.value).toBe(false)
      expect(onComplete).toHaveBeenCalled()
    })

    it('should handle upload error', async () => {
      const manager = useTaskManager(serverBaseUrl)
      manager.file.value = createMockFile('content', 'pnpm-lock.yaml')

      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))

      const onError = vi.fn()

      manager.uploadFile(undefined, undefined, onError)

      await vi.runAllTimersAsync()

      expect(manager.uploading.value).toBe(false)
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('downloadSinglePackage', () => {
    it('should not download if packageName is empty', async () => {
      const manager = useTaskManager(serverBaseUrl)
      const fetchSpy = vi.spyOn(global, 'fetch')

      await manager.downloadSinglePackage()

      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('should download package and poll for completion', async () => {
      const manager = useTaskManager(serverBaseUrl)
      manager.packageName.value = 'lodash'

      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ taskId: 'pkg-123' })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'completed', message: 'Done' })
        } as Response)

      const onComplete = vi.fn()

      manager.downloadSinglePackage(undefined, onComplete)

      await vi.runAllTimersAsync()

      expect(manager.packageTaskId.value).toBe('pkg-123')
      expect(onComplete).toHaveBeenCalled()
    })

    it('should handle failed status', async () => {
      const manager = useTaskManager(serverBaseUrl)
      manager.packageName.value = 'nonexistent-package'

      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ taskId: 'pkg-fail' })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'failed', message: 'Package not found' })
        } as Response)

      const onError = vi.fn()

      manager.downloadSinglePackage(undefined, undefined, onError)

      await vi.runAllTimersAsync()

      expect(manager.downloadingPackage.value).toBe(false)
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(onError.mock.calls[0][0].message).toBe('Package not found')
    })
  })

  describe('deleteHistoryItem', () => {
    it('should return true on successful delete', async () => {
      const manager = useTaskManager(serverBaseUrl)

      mockFetch({}, { status: 200, ok: true })

      const result = await manager.deleteHistoryItem('task-to-delete')

      expect(result).toBe(true)
    })

    it('should return false on failed delete', async () => {
      const manager = useTaskManager(serverBaseUrl)

      mockFetch({}, { status: 404, ok: false })

      const result = await manager.deleteHistoryItem('nonexistent-task')

      expect(result).toBe(false)
    })

    it('should return false on network error', async () => {
      const manager = useTaskManager(serverBaseUrl)

      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))

      const result = await manager.deleteHistoryItem('task-123')

      expect(result).toBe(false)
    })
  })
})
