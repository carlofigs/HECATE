/**
 * server.ts — HECATE's MCP tools and resources (roadmap: MCP v2).
 *
 * A fresh McpServer per request, as @modelcontextprotocol/server's
 * createMcpHandler expects. Reads go to the workspace's Durable Object, which
 * answers from its in-memory state through @hecate/core's views. The one write
 * tool, apply_ops, sends a batch of ops (ADR 0004): a dry run first, then the
 * same ops for real once the owner has confirmed.
 */

import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { FILE_KINDS, toJsonSchemas, toOpsJsonSchema } from '@hecate/core'
import type { ApplyOutcome, ReadOutcome } from '../engine.ts'
import type { ReadQuery } from '../queries.ts'
import type { WorkspaceRpc } from '../routes/workspace-rpc.ts'
import type { WorkspaceEntry } from '../workspaces.ts'

export interface McpDeps {
  listWorkspaces(): Promise<WorkspaceEntry[]>
  workspace(dir: string): WorkspaceRpc
  /** The workspace a call uses when it names none. */
  defaultWorkspace: string | null
}

/** Claude's read position in each workspace's activity log. */
const CLAUDE_CURSOR = 'claude'

const INSTRUCTIONS = `HECATE is the owner's planning system: focus weeks, tasks, projects, sprints, people, a glossary and an activity log, one workspace per area of life or work.

- Start a session with get_briefing.
- Task keys: A12 is the owner's own action, B3 something they are waiting on. Refer to tasks by key.
- Every change goes through apply_ops. First call it with dryRun: true and show the preview; after the owner confirms, send the same ops with dryRun: false (pass ifVersion from the preview to be safe). New tasks take ref: "$1", "$2"… so other ops in the batch can refer to them.
- The op catalogue is the resource hecate://schema/ops; file shapes are hecate://schema/<kind>.
- Sanitised workspaces record roles, never people's names.`

const workspaceArg = z.string().min(1).max(100).optional().describe('Workspace directory, from list_workspaces. Omit for the default workspace.')

type ToolResult = { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean }

const reply = (text: string, data?: Record<string, unknown>): ToolResult => ({ content: [{ type: 'text', text }], ...(data ? { structuredContent: data } : {}) })
const failure = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true })

const fromRead = (outcome: ReadOutcome): ToolResult => {
  if (outcome.status === 'ok') return reply(outcome.text, { version: outcome.version, ...outcome.data })
  return failure(outcome.message)
}

function fromApply(outcome: ApplyOutcome): ToolResult {
  switch (outcome.status) {
    case 'dry-run':
      return reply(
        `${outcome.preview}\nWorkspace version ${outcome.version}. To apply, send the same ops with dryRun: false and ifVersion: ${outcome.version}.\n`,
        { ...outcome },
      )
    case 'applied':
      return reply(`${outcome.preview}${outcome.duplicate ? '\n(Already applied earlier with this opId; nothing new was written.)\n' : ''}\nWorkspace version ${outcome.version}.\n`, { ...outcome })
    case 'rejected':
      return { ...failure(outcome.message), structuredContent: { ...outcome } }
    case 'invalid':
      return failure(`Not applied — the batch is not valid:\n${outcome.message}`)
    case 'version-conflict':
      return failure(`Not applied: the workspace is at version ${outcome.version}, not ${outcome.expected}. Read it again (get_briefing or find_tasks) and redo the dry run.`)
    case 'unavailable':
      return failure(outcome.message)
    default: {
      const never: never = outcome
      return failure(`Unexpected outcome ${JSON.stringify(never)}`)
    }
  }
}

export function createHecateServer(deps: McpDeps): McpServer {
  const server = new McpServer({ name: 'hecate', title: 'HECATE', version: '2.0.0' }, { instructions: INSTRUCTIONS })

  /** The workspace a call means, or why it cannot be worked out. */
  const resolve = async (requested: string | undefined): Promise<{ dir: string } | { error: string }> => {
    const list = await deps.listWorkspaces()
    const visible = list.filter(w => !w.hidden)
    const dir = requested ?? deps.defaultWorkspace ?? (visible.length === 1 ? visible[0]?.dir : undefined)
    const names = visible.map(w => w.dir).join(', ') || '(none)'
    if (!dir) return { error: `Say which workspace: ${names}.` }
    if (!list.some(w => w.dir === dir)) return { error: `No workspace "${dir}". Available: ${names}.` }
    return { dir }
  }

  const read = async (requested: string | undefined, query: ReadQuery): Promise<ToolResult> => {
    const target = await resolve(requested)
    if ('error' in target) return failure(target.error)
    return fromRead(await deps.workspace(target.dir).read(target.dir, query))
  }

  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const

  server.registerTool('list_workspaces', {
    title: 'List workspaces',
    description: 'The workspaces in HECATE, with their name, policy (open or sanitised) and which one is the default.',
    inputSchema: z.object({}),
    annotations: readOnly,
  }, async () => {
    const list = await deps.listWorkspaces()
    const fallback = deps.defaultWorkspace ?? (list.filter(w => !w.hidden).length === 1 ? list.find(w => !w.hidden)?.dir : null)
    const workspaces = list.map(w => ({ ...w, default: w.dir === fallback }))
    const text = workspaces.length === 0
      ? 'No workspaces yet.\n'
      : `${workspaces.map(w => `- **${w.dir}**${w.name ? ` — ${w.name}` : ''} (${w.policy ?? 'unreadable'}${w.default ? ', default' : ''}${w.hidden ? ', archived' : ''})`).join('\n')}\n`
    return reply(text, { workspaces })
  })

  server.registerTool('get_briefing', {
    title: 'Briefing',
    description: 'Everything needed to start a session, in one call: today, the sprint position, this week\'s priorities, in progress, waiting on, blocked, due soon, cutoffs and leave, keep in mind, the profile, and activity Claude has not seen yet.',
    inputSchema: z.object({ workspace: workspaceArg }),
    annotations: readOnly,
  }, async ({ workspace }) => read(workspace, { kind: 'briefing', cursor: CLAUDE_CURSOR }))

  server.registerTool('find_tasks', {
    title: 'Find tasks',
    description: 'Tasks matching every given filter, in board order. By default only open tasks; scope "board" adds finished ones still on the board, "all" adds archived sprints.',
    inputSchema: z.object({
      workspace: workspaceArg,
      keys: z.array(z.string().max(50)).max(100).optional().describe('Task keys (A12, B3) or legacy ids (t-a12)'),
      status: z.array(z.string().max(50)).max(20).optional().describe('Status ids'),
      kind: z.enum(['action', 'waiting']).optional().describe('action = A keys (mine), waiting = B keys'),
      tag: z.string().max(50).optional(),
      project: z.string().max(100).optional().describe('Project slug'),
      urgency: z.enum(['high', 'med', 'low']).optional(),
      text: z.string().max(200).optional().describe('Words that must all appear in the title or note'),
      scope: z.enum(['open', 'board', 'all']).optional(),
      limit: z.int().min(1).max(200).optional(),
    }),
    annotations: readOnly,
  }, async ({ workspace, limit, ...filter }) => read(workspace, { kind: 'tasks', filter, ...(limit ? { limit } : {}) }))

  server.registerTool('get_entity', {
    title: 'Get one thing',
    description: 'One thing in full by reference: a task key (A12) or legacy id, project:<slug>, person:<role or id>, term:<term>, sprint:<n>, focus:<any date in the week>, reference:<name>, meeting:<date>-<slug>, profile, keep-in-mind or workspace.',
    inputSchema: z.object({ workspace: workspaceArg, ref: z.string().min(1).max(200) }),
    annotations: readOnly,
  }, async ({ workspace, ref }) => read(workspace, { kind: 'entity', ref }))

  server.registerTool('search', {
    title: 'Search',
    description: 'Full-text search across tasks (archived too), projects, people, the glossary, references, focus weeks, sprints, meetings, keep in mind and the profile. Returns references to open with get_entity.',
    inputSchema: z.object({ workspace: workspaceArg, query: z.string().min(1).max(200), limit: z.int().min(1).max(100).optional() }),
    annotations: readOnly,
  }, async ({ workspace, query, limit }) => read(workspace, { kind: 'search', query, ...(limit ? { limit } : {}) }))

  server.registerTool('render_focus', {
    title: 'Focus week',
    description: 'A focus week as markdown, in the FOCUS.md format the focus skill uses: Today, closed days, priorities, week at a glance, last week, waiting on, keep in mind.',
    inputSchema: z.object({ workspace: workspaceArg, date: z.string().optional().describe('Any day of the week to show (YYYY-MM-DD); omit for this week') }),
    annotations: readOnly,
  }, async ({ workspace, date }) => read(workspace, { kind: 'focus', ...(date ? { date } : {}) }))

  server.registerTool('apply_ops', {
    title: 'Apply ops',
    description: 'The only way to change HECATE. Sends a batch of ops (see resource hecate://schema/ops) as one atomic change. Always dry-run first (dryRun: true), show the preview, and send the same ops with dryRun: false only after the owner confirms. A retry with the same opId is applied once.',
    inputSchema: z.object({
      workspace: workspaceArg,
      ops: z.array(z.record(z.string(), z.unknown())).min(1).max(500).describe('Ops, each with a "type" such as task.add, task.update, focus.setPlan'),
      dryRun: z.boolean().describe('true: preview only, nothing is written'),
      ifVersion: z.int().min(1).optional().describe('Refuse unless the workspace is still at this version (from the dry run)'),
      opId: z.string().min(1).max(200).optional().describe('An id for this change, so a retry is not applied twice'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ workspace, ops, dryRun, ifVersion, opId }) => {
    const target = await resolve(workspace)
    if ('error' in target) return failure(target.error)
    return fromApply(await deps.workspace(target.dir).apply(target.dir, {
      ops, actor: 'claude', dryRun, ...(ifVersion ? { ifVersion } : {}), ...(opId ? { opId } : {}),
    }))
  })

  server.registerTool('get_activity', {
    title: 'Activity',
    description: 'Activity-log entries Claude has not acknowledged yet, newest first: changes made in the app, by other sessions, and system events. Acknowledge with ack_activity once read.',
    inputSchema: z.object({ workspace: workspaceArg, limit: z.int().min(1).max(200).optional() }),
    annotations: readOnly,
  }, async ({ workspace, limit }) => read(workspace, { kind: 'activity', cursor: CLAUDE_CURSOR, ...(limit ? { limit } : {}) }))

  server.registerTool('ack_activity', {
    title: 'Acknowledge activity',
    description: 'Mark activity as read up to an entry id (from get_activity), or up to the newest entry.',
    inputSchema: z.object({ workspace: workspaceArg, upTo: z.string().min(1).max(40).optional() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ workspace, upTo }) => {
    const target = await resolve(workspace)
    if ('error' in target) return failure(target.error)
    const outcome = await deps.workspace(target.dir).ackActivity(target.dir, CLAUDE_CURSOR, upTo)
    if (outcome.status !== 'ok') return failure(outcome.message)
    return reply(`Acknowledged ${outcome.acknowledged} ${outcome.acknowledged === 1 ? 'entry' : 'entries'}.\n`, { ...outcome })
  })

  // The op catalogue and every file kind's JSON Schema, so a session never has to guess a shape.
  server.registerResource('ops', 'hecate://schema/ops', {
    title: 'Op catalogue',
    description: 'JSON Schema of every op apply_ops accepts',
    mimeType: 'application/schema+json',
  }, uri => ({ contents: [{ uri: uri.href, mimeType: 'application/schema+json', text: JSON.stringify(toOpsJsonSchema(), null, 2) }] }))
  const schemas = toJsonSchemas()
  for (const kind of FILE_KINDS) {
    server.registerResource(`schema-${kind}`, `hecate://schema/${kind}`, {
      title: `${kind} file`,
      description: `JSON Schema of a ${kind} file`,
      mimeType: 'application/schema+json',
    }, uri => ({ contents: [{ uri: uri.href, mimeType: 'application/schema+json', text: JSON.stringify(schemas[kind], null, 2) }] }))
  }

  return server
}
