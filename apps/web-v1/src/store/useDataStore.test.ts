import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FileSlice, FocusData, Task, TasksData } from '@/lib/schemas'

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

function slice<T>(data: T, sha: string | null, dirty = true): FileSlice<T> {
  return { data, sha, dirty, loading: false, saving: false, revision: 1, error: null }
}
function seedTasks(data: TasksData, sha: string | null, dirty = true) {
  useDataStore.setState(s => { s.tasks = slice(data, sha, dirty) })
}
function seedFocus(data: FocusData, sha: string | null) {
  useDataStore.setState(s => { s.focus = slice(data, sha) })
}

function task(id: string, title: string): Task {
  return {
    id, title, note: null, tags: [], priority: null, blockedSince: null,
    createdAt: '2026-11-04T00:00:00.000Z', updatedAt: '2026-11-04T00:00:00.000Z',
  }
}
function board(...tasks: Task[]): TasksData {
  return { columns: [{ id: 'todo', name: 'To Do', tasks }] }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('setData', () => {
  it('marks the slice dirty and bumps revision on every edit', () => {
    seedTasks(board(), 'sha', false)
    const before = useDataStore.getState().tasks.revision

    useDataStore.getState().setData('tasks', d => { d.columns[0].name = 'A' })
    useDataStore.getState().setData('tasks', d => { d.columns[0].name = 'B' })

    const s = useDataStore.getState().tasks
    expect(s.dirty).toBe(true)
    expect(s.revision).toBe(before + 2)
  })
})

describe('saveFile — happy path', () => {
  it('clears dirty and stores the new sha on success', async () => {
    seedTasks(board(), 'old')
    putFileMock.mockResolvedValue('newsha')

    await expect(useDataStore.getState().saveFile('tasks')).resolves.toBe('saved')

    const s = useDataStore.getState().tasks
    expect(s.dirty).toBe(false)
    expect(s.saving).toBe(false)
    expect(s.sha).toBe('newsha')
    expect(putFileMock).toHaveBeenCalledTimes(1)
  })

  it('uses `saving`, not `loading`, while the PUT is in flight (no skeleton flash)', async () => {
    seedTasks(board(), 'old')
    let during: FileSlice<TasksData> | undefined
    putFileMock.mockImplementation(async () => {
      during = useDataStore.getState().tasks
      return 'newsha'
    })

    await useDataStore.getState().saveFile('tasks')

    expect(during?.saving).toBe(true)
    expect(during?.loading).toBe(false)
  })

  it('skips the PUT when the file is not dirty', async () => {
    seedTasks(board(), 'sha', false)
    await expect(useDataStore.getState().saveFile('tasks')).resolves.toBe('skipped')
    expect(putFileMock).not.toHaveBeenCalled()
  })
})

describe('saveFile — concurrent edit during in-flight PUT', () => {
  it('keeps dirty=true when an edit lands while the save is in flight', async () => {
    seedTasks(board(), 'old')

    // Simulate the user mutating the slice mid-request: setData runs while
    // putFile is "in flight", bumping revision past the one the save captured.
    putFileMock.mockImplementation(async () => {
      useDataStore.getState().setData('tasks', d => {
        d.columns.push({ id: 'c-new', name: 'New', tasks: [] })
      })
      return 'newsha'
    })

    await useDataStore.getState().saveFile('tasks')

    const s = useDataStore.getState().tasks
    expect(s.sha).toBe('newsha')        // sha still advances
    expect(s.dirty).toBe(true)          // but the new edit is preserved for re-save
  })
})

describe('saveFile — serialised per file', () => {
  it('runs one PUT at a time; a queued save of a now-clean file is skipped', async () => {
    seedTasks(board(), 'old')
    let release!: () => void
    putFileMock.mockImplementation(() => new Promise<string>(r => { release = () => r('newsha') }))

    const first  = useDataStore.getState().saveFile('tasks')
    const second = useDataStore.getState().saveFile('tasks')   // e.g. a second hook instance
    await Promise.resolve()
    expect(putFileMock).toHaveBeenCalledTimes(1)

    release()
    await expect(first).resolves.toBe('saved')
    await expect(second).resolves.toBe('skipped')
    expect(putFileMock).toHaveBeenCalledTimes(1)
  })

  it('a queued save writes the newer edit on top of the sha the first save returned', async () => {
    seedTasks(board(), 'sha-0')
    putFileMock
      .mockImplementationOnce(async () => {
        useDataStore.getState().setData('tasks', d => { d.columns[0].name = 'edited mid-flight' })
        return 'sha-1'
      })
      .mockResolvedValueOnce('sha-2')

    const first  = useDataStore.getState().saveFile('tasks')
    const second = useDataStore.getState().saveFile('tasks')

    await expect(first).resolves.toBe('saved')
    await expect(second).resolves.toBe('saved')
    expect(putFileMock).toHaveBeenCalledTimes(2)
    expect(putFileMock.mock.calls[1][3]).toBe('sha-1')   // never two PUTs on the same sha
    expect((putFileMock.mock.calls[1][2] as TasksData).columns[0].name).toBe('edited mid-flight')
    expect(useDataStore.getState().tasks.dirty).toBe(false)
  })
})

describe('saveFile — non-conflict failure', () => {
  it('keeps the edit (dirty) and reports the error, so autosave can retry', async () => {
    seedTasks(board(task('t-1', 'mine')), 'sha')
    putFileMock.mockRejectedValue({ status: 500, message: 'Server Error' })

    await expect(useDataStore.getState().saveFile('tasks')).rejects.toMatchObject({ status: 500 })

    const s = useDataStore.getState().tasks
    expect(s.dirty).toBe(true)
    expect(s.saving).toBe(false)
    expect(s.error).toBe('Server Error')
    expect(getFileMock).not.toHaveBeenCalled()
  })
})

describe('saveFile — stale-SHA 409', () => {
  it('never re-PUTs the local copy: a task added elsewhere (e.g. over MCP) survives', async () => {
    // Local: the user renamed a task. Remote: Claude added a task via MCP.
    seedTasks(board(task('t-1', 'renamed locally')), 'stale')
    const remote = board(task('t-1', 'original'), task('t-2', 'added over MCP'))

    putFileMock.mockRejectedValueOnce({ status: 409, message: 'sha mismatch' })
    getFileMock.mockResolvedValue({ data: remote, sha: 'fresh', path: 'ws/tasks.json' })

    await expect(useDataStore.getState().saveFile('tasks')).resolves.toBe('conflict')

    expect(putFileMock).toHaveBeenCalledTimes(1)     // the failed PUT only — no overwrite
    const s = useDataStore.getState().tasks
    expect(s.data?.columns[0].tasks.map(t => t.id)).toEqual(['t-1', 't-2'])
    expect(s.data?.columns[0].tasks[1].title).toBe('added over MCP')
    expect(s.sha).toBe('fresh')
    expect(s.dirty).toBe(false)
    expect(s.saving).toBe(false)
    expect(s.error).toBeNull()
  })

  it('keeps bot-written calendar events on focus (the remote copy is adopted whole)', async () => {
    const local: FocusData = {
      weekOf: '2026-06-08', sprintLabel: 'S1', updatedAt: 'x',
      sections: [{ id: 'today', title: 'Today', content: 'edited locally' }],
      calendarEvents: [],
    }
    seedFocus(local, 'stale')
    const remoteEvents = [{
      id: 'evt-1', date: '2026-06-09', startTime: '10:00', endTime: '11:00',
      title: 'Standup', type: 'meeting' as const, isAllDay: false, isRecurring: true,
    }]
    putFileMock.mockRejectedValueOnce({ status: 409, message: 'conflict' })
    getFileMock.mockResolvedValue({
      data: { ...local, sections: [], calendarEvents: remoteEvents },
      sha: 'fresh', path: 'ws/focus.json',
    })

    await expect(useDataStore.getState().saveFile('focus')).resolves.toBe('conflict')

    expect(putFileMock).toHaveBeenCalledTimes(1)
    expect(useDataStore.getState().focus.data?.calendarEvents).toEqual(remoteEvents)
  })

  it('applies the future-schema guard on the 409 path: a newer file is refused, local kept', async () => {
    const local = board(task('t-1', 'mine'))
    seedTasks(local, 'stale')
    putFileMock.mockRejectedValueOnce({ status: 409, message: 'sha mismatch' })
    getFileMock.mockResolvedValue({
      data: { schemaVersion: 999, columns: [] }, sha: 'fresh', path: 'ws/tasks.json',
    })

    await expect(useDataStore.getState().saveFile('tasks')).rejects.toMatchObject({ status: 409 })

    expect(putFileMock).toHaveBeenCalledTimes(1)
    const s = useDataStore.getState().tasks
    expect(s.data).toEqual(local)          // not replaced by the unreadable remote
    expect(s.dirty).toBe(true)
    expect(s.error).toMatch(/conflict/i)
  })

  it('surfaces an error, without retry loops, when the refetch fails', async () => {
    seedTasks(board(), 'stale')
    putFileMock.mockRejectedValue({ status: 409, message: 'still conflicting' })
    getFileMock.mockRejectedValue({ status: 0, message: 'offline' })

    await expect(useDataStore.getState().saveFile('tasks')).rejects.toMatchObject({ status: 409 })
    expect(putFileMock).toHaveBeenCalledTimes(1)
    expect(useDataStore.getState().tasks.error).toMatch(/conflict/i)
  })
})
