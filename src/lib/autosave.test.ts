import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { TasksData } from '@/lib/schemas'

vi.mock('@/lib/github', () => ({
  loadCredentials: vi.fn(() => ({ token: 't', owner: 'o', repo: 'r', workspace: 'ws' })),
  getFile: vi.fn(),
  putFile: vi.fn(),
}))

import { putFile } from '@/lib/github'
import { useDataStore, type SaveOutcome } from '@/store/useDataStore'
import { scheduleAutosave, retryDelayMs, AUTOSAVE_MAX_RETRIES } from './autosave'

const putFileMock = vi.mocked(putFile)

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('retryDelayMs', () => {
  it('backs off exponentially from the debounce and caps at 60s', () => {
    expect(retryDelayMs(1, 2000)).toBe(4000)
    expect(retryDelayMs(2, 2000)).toBe(8000)
    expect(retryDelayMs(10, 2000)).toBe(60_000)
  })
})

describe('scheduleAutosave', () => {
  it('saves once after the delay', async () => {
    const save = vi.fn<() => Promise<SaveOutcome>>().mockResolvedValue('saved')
    scheduleAutosave({ save, delayMs: 2000 })

    await vi.advanceTimersByTimeAsync(1999)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('is a trailing debounce: cancelling and rescheduling on each edit saves once, after the last', async () => {
    const save = vi.fn<() => Promise<SaveOutcome>>().mockResolvedValue('saved')
    let cancel = scheduleAutosave({ save, delayMs: 2000 })
    await vi.advanceTimersByTimeAsync(1500)
    cancel()                                         // edit → effect re-runs
    cancel = scheduleAutosave({ save, delayMs: 2000 })
    await vi.advanceTimersByTimeAsync(1500)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    expect(save).toHaveBeenCalledTimes(1)
    cancel()
  })

  it('resumes after a failed save: retries with backoff until it succeeds (the v1 stall)', async () => {
    const save = vi.fn<() => Promise<SaveOutcome>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue('saved')
    const onFailure = vi.fn()
    scheduleAutosave({ save, delayMs: 1000, onFailure })

    await vi.advanceTimersByTimeAsync(1000)          // first attempt fails
    expect(save).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(retryDelayMs(1, 1000))
    expect(save).toHaveBeenCalledTimes(2)            // retry 1 fails
    await vi.advanceTimersByTimeAsync(retryDelayMs(2, 1000))
    expect(save).toHaveBeenCalledTimes(3)            // retry 2 succeeds
    expect(onFailure).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(120_000)
    expect(save).toHaveBeenCalledTimes(3)            // nothing further once saved
  })

  it('gives up after the retry cap', async () => {
    const save = vi.fn<() => Promise<SaveOutcome>>().mockRejectedValue(new Error('down'))
    scheduleAutosave({ save, delayMs: 1000 })
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(save).toHaveBeenCalledTimes(AUTOSAVE_MAX_RETRIES)
  })

  it('a cancelled schedule does not retry (a newer edit owns the next save)', async () => {
    const save = vi.fn<() => Promise<SaveOutcome>>().mockRejectedValue(new Error('down'))
    const cancel = scheduleAutosave({ save, delayMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    cancel()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('reports a conflict outcome', async () => {
    const onConflict = vi.fn()
    scheduleAutosave({ save: async () => 'conflict', delayMs: 10, onConflict })
    await vi.advanceTimersByTimeAsync(10)
    expect(onConflict).toHaveBeenCalledTimes(1)
  })
})

describe('autosave against the real store', () => {
  function seed(data: TasksData) {
    useDataStore.setState(s => {
      s.tasks = { data, sha: 'sha-0', dirty: true, loading: false, saving: false, revision: 1, error: null }
    })
  }

  it('an edit made during an in-flight save is written by the next scheduled save', async () => {
    seed({ columns: [{ id: 'c', name: 'Before', tasks: [] }] })
    const save = () => useDataStore.getState().saveFile('tasks')

    let releaseFirst!: () => void
    putFileMock
      .mockImplementationOnce(() => new Promise<string>(r => { releaseFirst = () => r('sha-1') }))
      .mockResolvedValueOnce('sha-2')

    // Effect run #1: debounce elapses, PUT #1 goes out and hangs.
    const cancelFirst = scheduleAutosave({ save, delayMs: 2000 })
    await vi.advanceTimersByTimeAsync(2000)
    expect(putFileMock).toHaveBeenCalledTimes(1)

    // The user edits while PUT #1 is in flight → revision bumps → effect re-runs.
    useDataStore.getState().setData('tasks', d => { d.columns[0].name = 'After' })
    cancelFirst()
    const cancelSecond = scheduleAutosave({ save, delayMs: 2000 })

    releaseFirst()
    await vi.advanceTimersByTimeAsync(2000)

    expect(putFileMock).toHaveBeenCalledTimes(2)
    expect(putFileMock.mock.calls[1][3]).toBe('sha-1')
    expect((putFileMock.mock.calls[1][2] as TasksData).columns[0].name).toBe('After')
    expect(useDataStore.getState().tasks.dirty).toBe(false)
    cancelSecond()
  })

  it('a failed save followed by recovery leaves the store clean, with no stall', async () => {
    seed({ columns: [] })
    putFileMock
      .mockRejectedValueOnce({ status: 502, message: 'Bad Gateway' })
      .mockResolvedValueOnce('sha-1')

    scheduleAutosave({ save: () => useDataStore.getState().saveFile('tasks'), delayMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(useDataStore.getState().tasks.error).toBe('Bad Gateway')
    expect(useDataStore.getState().tasks.dirty).toBe(true)

    await vi.advanceTimersByTimeAsync(retryDelayMs(1, 1000))
    const s = useDataStore.getState().tasks
    expect(s.dirty).toBe(false)
    expect(s.error).toBeNull()
    expect(s.sha).toBe('sha-1')
  })
})
