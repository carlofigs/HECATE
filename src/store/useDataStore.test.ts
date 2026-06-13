import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FocusData, TasksData } from '@/lib/schemas'

// Mock the GitHub I/O layer — these tests exercise store logic, not the network.
vi.mock('@/lib/github', () => ({
  loadCredentials: vi.fn(() => ({ token: 't', owner: 'o', repo: 'r', workspace: 'ws' })),
  getFile: vi.fn(),
  putFile: vi.fn(),
}))

import { getFile, putFile } from '@/lib/github'
import { useDataStore } from './useDataStore'

const getFileMock = vi.mocked(getFile)
const putFileMock = vi.mocked(putFile)

function seedTasks(data: TasksData, sha: string | null) {
  useDataStore.setState(s => {
    s.tasks = { data, sha, dirty: true, loading: false, error: null }
  })
}
function seedFocus(data: FocusData, sha: string | null) {
  useDataStore.setState(s => {
    s.focus = { data, sha, dirty: true, loading: false, error: null }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('saveFile — happy path', () => {
  it('clears dirty and stores the new sha on success', async () => {
    seedTasks({ columns: [] }, 'old')
    putFileMock.mockResolvedValue('newsha')

    await useDataStore.getState().saveFile('tasks')

    const slice = useDataStore.getState().tasks
    expect(slice.dirty).toBe(false)
    expect(slice.sha).toBe('newsha')
    expect(putFileMock).toHaveBeenCalledTimes(1)
  })
})

describe('saveFile — concurrent edit during in-flight PUT', () => {
  it('keeps dirty=true when an edit lands while the save is in flight', async () => {
    seedTasks({ columns: [] }, 'old')

    // Simulate the user mutating the slice mid-request: setData runs while putFile
    // is "in flight", producing a new immer reference that the post-await check sees.
    putFileMock.mockImplementation(async () => {
      useDataStore.getState().setData('tasks', d => {
        d.columns.push({ id: 'c-new', name: 'New', tasks: [] })
      })
      return 'newsha'
    })

    await useDataStore.getState().saveFile('tasks')

    const slice = useDataStore.getState().tasks
    expect(slice.sha).toBe('newsha')        // sha still advances
    expect(slice.dirty).toBe(true)          // but the new edit is preserved for re-save
  })
})

describe('saveFile — stale-SHA 409 recovery', () => {
  it('refetches the fresh sha and retries the PUT once, then succeeds', async () => {
    seedTasks({ columns: [] }, 'stale')

    putFileMock
      .mockRejectedValueOnce({ status: 409, message: 'sha mismatch' })
      .mockResolvedValueOnce('sha-after-retry')
    getFileMock.mockResolvedValue({ data: { columns: [] }, sha: 'fresh', path: 'ws/tasks.json' })

    await useDataStore.getState().saveFile('tasks')

    expect(getFileMock).toHaveBeenCalledTimes(1)
    expect(putFileMock).toHaveBeenCalledTimes(2)
    // The retry must use the freshly-fetched sha, not the stale one
    expect(putFileMock.mock.calls[1][3]).toBe('fresh')

    const slice = useDataStore.getState().tasks
    expect(slice.sha).toBe('sha-after-retry')
    expect(slice.dirty).toBe(false)
    expect(slice.error).toBeNull()
  })

  it('does not loop: a second 409 surfaces as an error', async () => {
    seedTasks({ columns: [] }, 'stale')
    putFileMock.mockRejectedValue({ status: 409, message: 'still conflicting' })
    getFileMock.mockResolvedValue({ data: { columns: [] }, sha: 'fresh', path: 'p' })

    await expect(useDataStore.getState().saveFile('tasks')).rejects.toMatchObject({ status: 409 })
    expect(putFileMock).toHaveBeenCalledTimes(2)   // original + one retry, no more
    expect(useDataStore.getState().tasks.error).toMatch(/conflict/i)
  })

  it('adopts remote calendarEvents before retrying focus, so bot events are not dropped', async () => {
    const localFocus: FocusData = {
      weekOf: '2026-06-08', sprintLabel: 'S1', updatedAt: 'x',
      sections: [{ id: 'today', title: 'Today', content: 'edited locally' }],
      calendarEvents: [],
    }
    seedFocus(localFocus, 'stale')

    const remoteEvents = [{
      id: 'evt-1', date: '2026-06-09', startTime: '10:00', endTime: '11:00',
      title: 'Standup', type: 'meeting' as const, isAllDay: false, isRecurring: true,
    }]
    putFileMock
      .mockRejectedValueOnce({ status: 409, message: 'conflict' })
      .mockResolvedValueOnce('sha2')
    getFileMock.mockResolvedValue({
      data: { ...localFocus, sections: [], calendarEvents: remoteEvents },
      sha: 'fresh', path: 'ws/focus.json',
    })

    await useDataStore.getState().saveFile('focus')

    // Local section edit kept; remote calendar events adopted
    const slice = useDataStore.getState().focus
    expect(slice.data?.sections[0].content).toBe('edited locally')
    expect(slice.data?.calendarEvents).toEqual(remoteEvents)

    // The retried PUT carried the merged data (events included)
    const retriedData = putFileMock.mock.calls[1][2] as FocusData
    expect(retriedData.calendarEvents).toEqual(remoteEvents)
    expect(slice.dirty).toBe(false)
  })
})
