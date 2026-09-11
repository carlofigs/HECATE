import { describe, it, expect, beforeEach } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../server'
import { NotFoundError, type StorageAdapter } from '../storage/types'
import type { McpConfig } from '../config'
import type { Task, TasksData } from '../../../src/lib/schemas'

const config: McpConfig = {
  token: 'ghp_test', owner: 'carlofigs', repo: 'HECATE_Data', workspace: 'kickball',
}

function task(id: string, title: string, tags: string[] = []): Task {
  return {
    id, title, note: null, tags, priority: null, blockedSince: null,
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
  }
}

const tasksFixture: TasksData = {
  columns: [
    { id: 'c1', name: 'Backlog', columnType: 'backlog', tasks: [
      task('t-a1', 'Draft the sync config', ['infra']),
      task('t-a2', 'Review the schema guard', ['Infra', 'review']),
    ] },
    { id: 'c2', name: 'Doing', columnType: 'in-progress', tasks: [task('t-b1', 'Ship the MCP server')] },
    { id: 'c3', name: 'Parked', tasks: [task('t-c1', 'Rethink storage')] },
  ],
}

/** Records what the tools asked for, so we can assert on workspace defaulting. */
let asked: { workspace: string; name: string }[] = []

const storage: StorageAdapter = {
  async listWorkspaces() { return ['kickball', 'woolworths'] },
  async readFile(workspace, name) {
    asked.push({ workspace, name })
    if (name === 'tasks') return { data: tasksFixture as never, sha: 'sha-tasks' }
    if (name === 'archive') throw new NotFoundError(workspace, name)
    return { data: { schemaVersion: 1 } as never, sha: 'sha-other' }
  },
}

async function connect(): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0.0.0' })
  await Promise.all([
    client.connect(clientSide),
    createServer(storage, config).connect(serverSide),
  ])
  return client
}

/** Tool results come back as a JSON text block; parse it for assertions. */
async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args })
  const content = result.content as { type: string; text: string }[]
  return JSON.parse(content[0].text)
}

beforeEach(() => { asked = [] })

describe('tool registration', () => {
  it('exposes exactly the read tools — phase 1 must not offer a write path', async () => {
    const { tools } = await (await connect()).listTools()
    expect(tools.map(t => t.name).sort()).toEqual(['list_tasks', 'list_workspaces', 'read_data_file'])
  })

  it('describes every tool, so a client can tell them apart', async () => {
    const { tools } = await (await connect()).listTools()
    for (const t of tools) expect(t.description?.length ?? 0).toBeGreaterThan(20)
  })
})

describe('list_workspaces', () => {
  it('returns the workspaces and names the configured default', async () => {
    const out = await call(await connect(), 'list_workspaces')
    expect(out).toEqual({ workspaces: ['kickball', 'woolworths'], default: 'kickball' })
  })
})

describe('read_data_file', () => {
  it('returns the file with its sha and workspace', async () => {
    const out = await call(await connect(), 'read_data_file', { name: 'tasks' })
    expect(out.sha).toBe('sha-tasks')
    expect(out.workspace).toBe('kickball')
    expect(out.data.columns).toHaveLength(3)
  })

  it('falls back to the configured workspace when none is given', async () => {
    await call(await connect(), 'read_data_file', { name: 'settings' })
    expect(asked).toEqual([{ workspace: 'kickball', name: 'settings' }])
  })

  it('honours an explicit workspace over the default', async () => {
    await call(await connect(), 'read_data_file', { name: 'settings', workspace: 'woolworths' })
    expect(asked).toEqual([{ workspace: 'woolworths', name: 'settings' }])
  })

  it('rejects a file name that is not part of the schema', async () => {
    const result = await (await connect()).callTool({ name: 'read_data_file', arguments: { name: 'secrets' } })
    expect(result.isError).toBe(true)
  })

  it('surfaces a missing file as an error rather than empty data', async () => {
    const result = await (await connect()).callTool({ name: 'read_data_file', arguments: { name: 'archive' } })
    expect(result.isError).toBe(true)
  })
})

describe('list_tasks', () => {
  it('flattens every column and attaches the column name and type', async () => {
    const out = await call(await connect(), 'list_tasks')
    expect(out.count).toBe(4)
    expect(out.tasks.map((t: { id: string }) => t.id)).toEqual(['t-a1', 't-a2', 't-b1', 't-c1'])
    expect(out.tasks[0]).toMatchObject({ column: 'Backlog', columnType: 'backlog' })
  })

  it('reports a column without a type as null rather than dropping it', async () => {
    const out = await call(await connect(), 'list_tasks')
    expect(out.tasks.find((t: { id: string }) => t.id === 't-c1')).toMatchObject({
      column: 'Parked', columnType: null,
    })
  })

  it('filters by column type', async () => {
    const out = await call(await connect(), 'list_tasks', { columnType: 'in-progress' })
    expect(out.tasks.map((t: { id: string }) => t.id)).toEqual(['t-b1'])
  })

  it('matches tags case-insensitively, since tags are typed by hand', async () => {
    const out = await call(await connect(), 'list_tasks', { tag: 'INFRA' })
    expect(out.tasks.map((t: { id: string }) => t.id)).toEqual(['t-a1', 't-a2'])
  })

  it('matches titles case-insensitively on a substring', async () => {
    const out = await call(await connect(), 'list_tasks', { titleContains: 'schema' })
    expect(out.tasks.map((t: { id: string }) => t.id)).toEqual(['t-a2'])
  })

  it('combines filters conjunctively', async () => {
    const out = await call(await connect(), 'list_tasks', { columnType: 'backlog', tag: 'review' })
    expect(out.tasks.map((t: { id: string }) => t.id)).toEqual(['t-a2'])
  })

  it('returns an empty list, not an error, when nothing matches', async () => {
    const out = await call(await connect(), 'list_tasks', { tag: 'nonexistent' })
    expect(out).toMatchObject({ count: 0, tasks: [] })
  })
})
