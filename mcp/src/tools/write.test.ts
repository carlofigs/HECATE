import { describe, it, expect, beforeEach } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../server'
import type { StorageAdapter } from '../storage/types'
import type { McpConfig } from '../config'
import type { FocusData, Task, TasksData, WeeklyLogData } from '../../../src/lib/schemas'

const config: McpConfig = {
  token: 'ghp_test', owner: 'carlofigs', repo: 'HECATE_Data', workspace: 'kickball',
}

function task(id: string, title: string): Task {
  return {
    id, title, note: null, tags: ['old'], priority: 'low', blockedSince: null,
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
  }
}

function seed() {
  return {
    tasks: {
      columns: [
        { id: 'c1', name: 'Backlog', columnType: 'backlog', tasks: [task('t-a1', 'First'), task('t-a2', 'Second')] },
        { id: 'c2', name: 'Done', columnType: 'done', tasks: [] },
      ],
    } as TasksData,
    focus: {
      weekOf: '2026-09-07', sprintLabel: 'Sprint 1', updatedAt: '2026-09-01T00:00:00Z',
      sections: [
        { id: 'today', title: 'Today', content: 'existing line' },
        { id: 'waiting-on', title: 'Waiting On', content: '' },
      ],
    } as FocusData,
    weekly_log: {
      weeks: [
        { weekOf: '2026-08-31', dateRange: 'older', generatedAt: '', updatedAt: '',
          completed: [], carriedForward: [], delayed: [], nextWeek: [],
          narrative: { meetingsAndDiscussions: 'old', decisionsMade: '', frustrations: '', oneOnOnePrep: { people: [], sections: {} } } },
        { weekOf: '2026-09-07', dateRange: 'current', generatedAt: '', updatedAt: '',
          completed: [], carriedForward: [], delayed: [], nextWeek: [],
          narrative: { meetingsAndDiscussions: '', decisionsMade: '', frustrations: '', oneOnOnePrep: { people: [], sections: {} } } },
      ],
    } as WeeklyLogData,
  }
}

let docs: ReturnType<typeof seed>
let commits: string[]

const storage: StorageAdapter = {
  async listWorkspaces() { return ['kickball'] },
  async readFile(_ws, name) { return { data: docs[name as keyof typeof docs] as never, sha: 's' } },
  async mutateFile(_ws, name, mutate, message) {
    mutate(docs[name as keyof typeof docs] as never)
    commits.push(message)
    return { data: docs[name as keyof typeof docs] as never, sha: 's2' }
  },
}

async function connect(): Promise<Client> {
  const [a, b] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0.0.0' })
  await Promise.all([client.connect(a), createServer(storage, config).connect(b)])
  return client
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await (await connect()).callTool({ name, arguments: args })
  const content = result.content as { type: string; text: string }[]
  return { ok: !result.isError, body: result.isError ? content[0].text : JSON.parse(content[0].text) }
}

beforeEach(() => { docs = seed(); commits = [] })

describe('registration', () => {
  it('exposes the read and write tools together', async () => {
    const { tools } = await (await connect()).listTools()
    expect(tools.map(t => t.name).sort()).toEqual([
      'add_task', 'append_log_entry', 'list_tasks', 'list_workspaces',
      'move_task', 'read_data_file', 'update_focus_section', 'update_task',
    ])
  })
})

describe('add_task', () => {
  it('appends a task with an app-format id and both timestamps set', async () => {
    const { body } = await call('add_task', { title: 'New thing', column: 'Backlog' })
    expect(body.created.id).toMatch(/^t-custom-[a-z0-9]+$/)
    expect(body.created.createdAt).toBe(body.created.updatedAt)
    expect(docs.tasks.columns[0].tasks.map(t => t.title)).toEqual(['First', 'Second', 'New thing'])
  })

  it('defaults note, tags, priority and blockedSince rather than omitting them', async () => {
    await call('add_task', { title: 'Bare', column: 'Backlog' })
    const created = docs.tasks.columns[0].tasks.at(-1)!
    expect(created).toMatchObject({ note: null, tags: [], priority: null, blockedSince: null })
  })

  it('accepts a column by id as well as by name', async () => {
    await call('add_task', { title: 'By id', column: 'c2' })
    expect(docs.tasks.columns[1].tasks.map(t => t.title)).toEqual(['By id'])
  })

  it('matches column names case-insensitively', async () => {
    await call('add_task', { title: 'Shouty', column: 'BACKLOG' })
    expect(docs.tasks.columns[0].tasks).toHaveLength(3)
  })

  it('names the available columns when the target does not exist', async () => {
    const { ok, body } = await call('add_task', { title: 'x', column: 'Nope' })
    expect(ok).toBe(false)
    expect(body).toContain('Backlog, Done')
  })

  it('writes a descriptive commit message', async () => {
    await call('add_task', { title: 'Ship it', column: 'Backlog' })
    expect(commits).toEqual(['feat(tasks): add "Ship it"'])
  })
})

describe('update_task', () => {
  it('changes only the fields passed', async () => {
    await call('update_task', { id: 't-a1', title: 'Renamed' })
    const t = docs.tasks.columns[0].tasks[0]
    expect(t.title).toBe('Renamed')
    expect(t.tags).toEqual(['old'])
    expect(t.priority).toBe('low')
  })

  it('clears priority when explicitly given null', async () => {
    await call('update_task', { id: 't-a1', priority: null })
    expect(docs.tasks.columns[0].tasks[0].priority).toBeNull()
  })

  it('replaces tags wholesale rather than merging', async () => {
    await call('update_task', { id: 't-a1', tags: ['new'] })
    expect(docs.tasks.columns[0].tasks[0].tags).toEqual(['new'])
  })

  it('bumps updatedAt but leaves createdAt alone', async () => {
    await call('update_task', { id: 't-a1', title: 'x' })
    const t = docs.tasks.columns[0].tasks[0]
    expect(t.createdAt).toBe('2026-09-01T00:00:00Z')
    expect(t.updatedAt).not.toBe('2026-09-01T00:00:00Z')
  })

  it('refuses a call that would change nothing', async () => {
    const { ok, body } = await call('update_task', { id: 't-a1' })
    expect(ok).toBe(false)
    expect(body).toContain('at least one field')
  })

  it('points at list_tasks when the id is unknown', async () => {
    const { ok, body } = await call('update_task', { id: 't-nope', title: 'x' })
    expect(ok).toBe(false)
    expect(body).toContain('list_tasks')
  })
})

describe('move_task', () => {
  it('moves the task between columns and reports both ends', async () => {
    const { body } = await call('move_task', { id: 't-a1', toColumn: 'Done' })
    expect(body).toMatchObject({ from: 'Backlog', to: 'Done' })
    expect(docs.tasks.columns[0].tasks.map(t => t.id)).toEqual(['t-a2'])
    expect(docs.tasks.columns[1].tasks.map(t => t.id)).toEqual(['t-a1'])
  })

  it('honours an explicit position', async () => {
    await call('move_task', { id: 't-a2', toColumn: 'Done' })
    await call('move_task', { id: 't-a1', toColumn: 'Done', position: 0 })
    expect(docs.tasks.columns[1].tasks.map(t => t.id)).toEqual(['t-a1', 't-a2'])
  })

  it('clamps a position past the end instead of failing the move', async () => {
    await call('move_task', { id: 't-a1', toColumn: 'Done', position: 99 })
    expect(docs.tasks.columns[1].tasks.map(t => t.id)).toEqual(['t-a1'])
  })

  it('can reorder within the same column', async () => {
    await call('move_task', { id: 't-a2', toColumn: 'Backlog', position: 0 })
    expect(docs.tasks.columns[0].tasks.map(t => t.id)).toEqual(['t-a2', 't-a1'])
  })
})

describe('update_focus_section', () => {
  it('replaces content by default', async () => {
    await call('update_focus_section', { section: 'today', content: 'fresh' })
    expect(docs.focus.sections[0].content).toBe('fresh')
  })

  it('appends onto existing content on a new line', async () => {
    await call('update_focus_section', { section: 'Today', content: 'added', mode: 'append' })
    expect(docs.focus.sections[0].content).toBe('existing line\nadded')
  })

  it('appends cleanly into an empty section, without a leading blank line', async () => {
    await call('update_focus_section', { section: 'waiting-on', content: 'first', mode: 'append' })
    expect(docs.focus.sections[1].content).toBe('first')
  })

  it('bumps the file-level updatedAt', async () => {
    await call('update_focus_section', { section: 'today', content: 'x' })
    expect(docs.focus.updatedAt).not.toBe('2026-09-01T00:00:00Z')
  })

  it('names the available sections when the target does not exist', async () => {
    const { ok, body } = await call('update_focus_section', { section: 'nope', content: 'x' })
    expect(ok).toBe(false)
    expect(body).toContain('Today, Waiting On')
  })
})

describe('append_log_entry', () => {
  it('defaults to the most recent week, not the last in the array', async () => {
    const { body } = await call('append_log_entry', { field: 'decisionsMade', content: 'chose scoped verbs' })
    expect(body.weekOf).toBe('2026-09-07')
    expect(docs.weekly_log.weeks[1].narrative.decisionsMade).toBe('chose scoped verbs')
  })

  it('appends to an explicitly named week', async () => {
    await call('append_log_entry', { field: 'meetingsAndDiscussions', content: 'later', weekOf: '2026-08-31' })
    expect(docs.weekly_log.weeks[0].narrative.meetingsAndDiscussions).toBe('old\nlater')
  })

  it('bumps that week\'s updatedAt', async () => {
    await call('append_log_entry', { field: 'frustrations', content: 'x' })
    expect(docs.weekly_log.weeks[1].updatedAt).not.toBe('')
  })

  it('names the available weeks when the requested one is absent', async () => {
    const { ok, body } = await call('append_log_entry', { field: 'frustrations', content: 'x', weekOf: '2020-01-01' })
    expect(ok).toBe(false)
    expect(body).toContain('2026-08-31, 2026-09-07')
  })
})
