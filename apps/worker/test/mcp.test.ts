/**
 * HECATE's MCP server end to end in Node: the real SDK client, the real
 * handler, and a real WorkspaceEngine over the fake GitHub. (The same server
 * runs in workerd behind OAuth in auth.e2e.test.ts.)
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { afterEach, describe, expect, it } from 'vitest'
import { stateFromFiles } from '@hecate/core'
import { createHecateServer, type McpDeps } from '../src/mcp/server.ts'
import { DIR, addTask, harness, rpcFor, type Harness } from './helpers.ts'

let client: Client | null = null

afterEach(async () => {
  await client?.close()
  client = null
})

async function connect(h: Harness, overrides: Partial<McpDeps> = {}): Promise<Client> {
  const deps: McpDeps = {
    listWorkspaces: () => Promise.resolve([
      { dir: DIR, hidden: false, name: 'Work', policy: 'open' },
      { dir: '_old', hidden: true, name: 'Old job', policy: 'sanitised' },
    ]),
    workspace: () => rpcFor(() => h.engine),
    defaultWorkspace: null,
    ...overrides,
  }
  const handler = createMcpHandler(() => createHecateServer(deps), { legacy: 'stateless' })
  client = new Client({ name: 'test', version: '0.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL('https://hecate.test/mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  }))
  return client
}

type CallResult = { content: { type: string; text?: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean }

async function call(c: Client, name: string, args: Record<string, unknown> = {}): Promise<{ text: string; data: Record<string, unknown> | undefined; isError: boolean }> {
  const result = (await c.callTool({ name, arguments: args })) as CallResult
  return { text: result.content.map(x => x.text ?? '').join(''), data: result.structuredContent, isError: result.isError === true }
}

describe('tools', () => {
  it('lists the nine tools, read-only ones marked as such, with instructions', async () => {
    const c = await connect(await harness())
    const { tools } = await c.listTools()
    expect(tools.map(t => t.name).sort()).toEqual([
      'ack_activity', 'apply_ops', 'find_tasks', 'get_activity', 'get_briefing', 'get_entity', 'list_workspaces', 'render_focus', 'search',
    ])
    expect(tools.filter(t => t.annotations?.readOnlyHint).map(t => t.name).sort()).toEqual([
      'find_tasks', 'get_activity', 'get_briefing', 'get_entity', 'list_workspaces', 'render_focus', 'search',
    ])
    expect(c.getInstructions()).toContain('apply_ops')
  })

  it('lists workspaces, uses the only visible one by default, and refuses unknown ones', async () => {
    const c = await connect(await harness())
    const listed = await call(c, 'list_workspaces')
    expect(listed.text).toBe('- **work** — Work (open, default)\n- **_old** — Old job (sanitised, archived)\n')
    expect((await call(c, 'get_briefing')).text).toMatch(/^# Work — /)
    const unknown = await call(c, 'get_briefing', { workspace: 'nope' })
    expect(unknown).toMatchObject({ isError: true, text: 'No workspace "nope". Available: work.' })
  })

  it('reads: briefing, tasks, one entity, search and the focus week', async () => {
    const c = await connect(await harness())
    const briefing = await call(c, 'get_briefing', { workspace: DIR })
    expect(briefing.data).toMatchObject({ version: 1, unread: 0, briefing: { workspace: { name: 'Work' } } })
    expect((await call(c, 'find_tasks', { kind: 'waiting' })).text).toBe('- **B1** Targets from finance — To Do · waiting on Finance\n')
    expect((await call(c, 'find_tasks', { text: 'scorecard' })).data).toMatchObject({ total: 2 })
    const entity = await call(c, 'get_entity', { ref: 'A1' })
    expect(entity.text).toMatch(/^`A1` \(task\)/)
    expect((await call(c, 'get_entity', { ref: 'project:nope' }))).toMatchObject({ isError: true })
    expect((await call(c, 'search', { query: 'finance' })).text).toContain('`B1`')
    expect((await call(c, 'render_focus')).text).toMatch(/^# Week of 2 Nov 2026/)
    expect((await call(c, 'render_focus', { date: 'soon' }))).toMatchObject({ isError: true })
  })

  it('writes only through apply_ops: dry run, then the same ops for real', async () => {
    const h = await harness()
    const c = await connect(h)
    const ops = [addTask('Draw the target view')]
    const dry = await call(c, 'apply_ops', { ops, dryRun: true })
    expect(dry.text).toMatch(/^\*\*Dry run — nothing has been written\.\*\*/)
    expect(dry.text).toContain('dryRun: false and ifVersion: 1')
    expect((await call(c, 'find_tasks', { text: 'target view' })).data).toMatchObject({ total: 0 })

    const done = await call(c, 'apply_ops', { ops, dryRun: false, ifVersion: 1, opId: 'mcp-1' })
    expect(done).toMatchObject({ isError: false, data: { status: 'applied', keyMap: { $1: 'A3' }, version: 2 } })
    expect((await call(c, 'apply_ops', { ops, dryRun: false, opId: 'mcp-1' })).text).toContain('Already applied earlier')
    expect((await call(c, 'apply_ops', { ops, dryRun: false, ifVersion: 1 }))).toMatchObject({ isError: true, text: expect.stringContaining('version 2, not 1') })
    expect((await call(c, 'apply_ops', { ops: [{ type: 'task.complete', task: 'A99' }], dryRun: false }))).toMatchObject({ isError: true, text: expect.stringMatching(/^\*\*Not applied/) })
    expect((await call(c, 'apply_ops', { ops: [{ type: 'no.such' }], dryRun: true }))).toMatchObject({ isError: true })

    await h.engine.flush()
    expect(h.fake.log()[0]).toMatch(/Actor: claude\nOp-Id: mcp-1$/)
    const committed = Object.fromEntries(Object.entries(h.fake.files()).filter(([p]) => p.startsWith(`${DIR}/`)).map(([p, t]) => [p.slice(DIR.length + 1), t]))
    expect(stateFromFiles(committed).tasks.tasks.map(t => t.title)).toContain('Draw the target view')
  })

  it('shows the focus week a dry run would produce', async () => {
    const c = await connect(await harness())
    const dry = await call(c, 'apply_ops', { ops: [{ type: 'focus.setPlan', date: '2026-11-05', items: [{ lead: 'Draft the scorecard', keys: ['A1'], urgency: 'high' }] }], dryRun: true })
    expect(dry.text).toContain('**Proposed focus week:**\n\n# Week of 2 Nov 2026')
    expect(dry.text).toContain("**Today's tasks:**\n1. 🔴 **Draft the scorecard** (A1)")
    expect(dry.data).toMatchObject({ focus: [{ weekOf: '2026-11-02' }] })
  })

  it('shows unread activity until Claude acknowledges it', async () => {
    const c = await connect(await harness())
    await call(c, 'apply_ops', { ops: [{ type: 'activity.log', entry: 'session', area: 'bau', delta: 'Drafted the scorecard', keys: ['A1'] }], dryRun: false })
    await call(c, 'apply_ops', { ops: [{ type: 'activity.log', entry: 'flag', delta: 'Sign-off moved to Friday' }], dryRun: false })
    expect((await call(c, 'get_briefing')).data).toMatchObject({ unread: 2 })
    const activity = await call(c, 'get_activity')
    expect(activity.text).toMatch(/^- 2026-11-05 · flag: Sign-off moved to Friday\n- 2026-11-05 · session · bau: Drafted the scorecard \(A1\)\n$/)
    const oldest = (activity.data?.entries as { id: string }[])[1]?.id
    expect((await call(c, 'ack_activity', { upTo: oldest })).text).toBe('Acknowledged 1 entry.\n')
    expect((await call(c, 'get_activity')).data).toMatchObject({ unread: 1 })
    expect((await call(c, 'ack_activity')).text).toBe('Acknowledged 1 entry.\n')
    expect((await call(c, 'get_activity')).text).toBe('Nothing new.\n')
    expect((await call(c, 'ack_activity', { upTo: 'nope' }))).toMatchObject({ isError: true })
  })
})

describe('resources', () => {
  it('serve the op catalogue and every file kind\'s schema', async () => {
    const c = await connect(await harness())
    const { resources } = await c.listResources()
    expect(resources.map(r => r.uri)).toEqual(expect.arrayContaining(['hecate://schema/ops', 'hecate://schema/tasks', 'hecate://schema/focusWeek']))
    const ops = await c.readResource({ uri: 'hecate://schema/ops' })
    const text = (ops.contents[0] as { text: string }).text
    expect(text).toContain('task.add')
    expect(JSON.parse(text)).toHaveProperty('$schema')
  })
})
