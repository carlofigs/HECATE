/**
 * write.ts — scoped write verbs
 *
 * Each verb re-reads, mutates one path, and writes back, rather than exposing a
 * whole-file put. Two writers rarely touch the same path, so conflicts become
 * unlikely by construction instead of being managed after the fact.
 *
 * IDs and timestamps are generated *before* handing the mutation to the storage
 * adapter and captured in the closure. mutateFile may run the mutation twice if
 * the remote moved underneath it, and a task that changed id between attempts
 * would be a nasty thing to debug.
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type {
  Column, FocusData, FocusSection, Priority, Task, TasksData, WeekEntry, WeeklyLogData,
} from '../../../src/lib/schemas'
import { generateTaskId, nowISO } from '../../../src/lib/ids'
import { uniqueSectionId } from '../../../src/lib/focusSections'
import type { StorageAdapter } from '../storage/types'
import type { McpConfig } from '../config'

const workspaceArg = z.string().min(1).optional()
  .describe('Workspace directory in the data repo. Defaults to the configured HECATE_WORKSPACE.')

const prioritySchema = z.enum(['high', 'medium', 'low'])

function asText(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

// ─── Lookup helpers ──────────────────────────────────────────────────────────
// Errors name what was available. A verb that fails with "not found" and
// nothing else costs a session an extra round trip to go and list things.

function findColumn(data: TasksData, ref: string): Column {
  const needle = ref.toLowerCase()
  const column = data.columns.find(c => c.id.toLowerCase() === needle || c.name.toLowerCase() === needle)
  if (!column) {
    throw new Error(
      `No column matching "${ref}". Available: ${data.columns.map(c => c.name).join(', ')}.`,
    )
  }
  return column
}

function findTask(data: TasksData, id: string): { task: Task; column: Column } {
  for (const column of data.columns) {
    const task = column.tasks.find(t => t.id === id)
    if (task) return { task, column }
  }
  throw new Error(`No task with id "${id}" in any column. Use list_tasks to find the right id.`)
}

function resolveWeek(data: WeeklyLogData, weekOf?: string): WeekEntry {
  if (data.weeks.length === 0) throw new Error('weekly_log.json has no weeks yet.')
  if (!weekOf) {
    // Most recent by weekOf — the entries are not guaranteed to be sorted.
    return [...data.weeks].sort((a, b) => b.weekOf.localeCompare(a.weekOf))[0]
  }
  const week = data.weeks.find(w => w.weekOf === weekOf)
  if (!week) {
    throw new Error(
      `No week starting ${weekOf}. Available: ${data.weeks.map(w => w.weekOf).join(', ')}.`,
    )
  }
  return week
}

/** Append a block to markdown that may or may not already end in a newline. */
function appendMarkdown(existing: string, addition: string): string {
  const base = existing.trimEnd()
  return base.length === 0 ? addition : `${base}\n${addition}`
}

// ─── Registration ────────────────────────────────────────────────────────────

export function registerWriteTools(server: McpServer, storage: StorageAdapter, config: McpConfig): void {
  const ws = (given?: string) => given ?? config.workspace

  server.registerTool(
    'add_task',
    {
      title: 'Add a task',
      description: 'Create a task in a column. The column may be given by name or id (case-insensitive).',
      inputSchema: {
        title: z.string().min(1).describe('Task title.'),
        column: z.string().min(1).describe('Target column, by name or id.'),
        note: z.string().optional().describe('Markdown body for the task.'),
        tags: z.array(z.string()).optional().describe('Tags to attach.'),
        priority: prioritySchema.optional().describe('Priority. Omit for none.'),
        workspace: workspaceArg,
      },
    },
    async ({ title, column, note, tags, priority, workspace }) => {
      // Generated once, outside the mutation, so a retry reuses the same values.
      const now = nowISO()
      const task: Task = {
        id: generateTaskId(),
        title,
        note: note ?? null,
        tags: tags ?? [],
        priority: (priority ?? null) as Priority | null,
        blockedSince: null,
        createdAt: now,
        updatedAt: now,
      }

      let columnName = ''
      await storage.mutateFile(ws(workspace), 'tasks', data => {
        const target = findColumn(data, column)
        columnName = target.name
        target.tasks.push(task)
      }, `feat(tasks): add "${title}"`)

      return asText({ created: task, column: columnName, workspace: ws(workspace) })
    },
  )

  server.registerTool(
    'update_task',
    {
      title: 'Update a task',
      description:
        'Change fields on an existing task. Only the fields you pass are touched; the rest are left alone. ' +
        'Pass null to priority or blockedSince to clear them.',
      inputSchema: {
        id: z.string().min(1).describe('Task id, e.g. t-a-lx3k9r.'),
        title: z.string().min(1).optional(),
        note: z.string().nullable().optional().describe('Markdown body, or null to clear.'),
        tags: z.array(z.string()).optional().describe('Replaces the existing tags entirely.'),
        priority: prioritySchema.nullable().optional(),
        blockedSince: z.string().nullable().optional().describe('"YYYY-MM-DD", or null to unblock.'),
        workspace: workspaceArg,
      },
    },
    async ({ id, title, note, tags, priority, blockedSince, workspace }) => {
      const changes = { title, note, tags, priority, blockedSince }
      if (Object.values(changes).every(v => v === undefined)) {
        throw new Error('Nothing to update — pass at least one field besides id.')
      }
      const now = nowISO()

      let updated: Task | null = null
      await storage.mutateFile(ws(workspace), 'tasks', data => {
        const { task } = findTask(data, id)
        if (title !== undefined)        task.title = title
        if (note !== undefined)         task.note = note
        if (tags !== undefined)         task.tags = tags
        if (priority !== undefined)     task.priority = priority
        if (blockedSince !== undefined) task.blockedSince = blockedSince
        task.updatedAt = now
        updated = task
      }, `chore(tasks): update ${id}`)

      return asText({ updated, workspace: ws(workspace) })
    },
  )

  server.registerTool(
    'move_task',
    {
      title: 'Move a task',
      description:
        'Move a task to another column. This is how a task gets completed — move it to the done column.',
      inputSchema: {
        id: z.string().min(1).describe('Task id.'),
        toColumn: z.string().min(1).describe('Destination column, by name or id.'),
        position: z.number().int().min(0).optional()
          .describe('Insertion index in the destination. Defaults to the end.'),
        workspace: workspaceArg,
      },
    },
    async ({ id, toColumn, position, workspace }) => {
      const now = nowISO()
      let from = ''
      let to = ''

      await storage.mutateFile(ws(workspace), 'tasks', data => {
        const { task, column: source } = findTask(data, id)
        const target = findColumn(data, toColumn)
        from = source.name
        to = target.name

        source.tasks.splice(source.tasks.indexOf(task), 1)
        // Clamp rather than reject: an index past the end plainly means "last",
        // and failing the whole move over it helps nobody.
        const at = position === undefined ? target.tasks.length : Math.min(position, target.tasks.length)
        target.tasks.splice(at, 0, task)
        task.updatedAt = now
      }, `chore(tasks): move ${id} to ${toColumn}`)

      return asText({ id, from, to, workspace: ws(workspace) })
    },
  )

  server.registerTool(
    'delete_task',
    {
      title: 'Delete a task',
      description:
        'Permanently remove a task from whichever column holds it. There is no undo, so the full task is ' +
        'returned in the response — recreate it with add_task from those fields if it goes wrong. ' +
        'To retire a task while keeping it, prefer move_task to a not-doing column.',
      annotations: { destructiveHint: true, idempotentHint: false },
      inputSchema: {
        id: z.string().min(1).describe('Task id.'),
        workspace: workspaceArg,
      },
    },
    async ({ id, workspace }) => {
      let removed: Task | null = null
      let from = ''

      await storage.mutateFile(ws(workspace), 'tasks', data => {
        const { task, column } = findTask(data, id)
        from = column.name
        column.tasks.splice(column.tasks.indexOf(task), 1)
        removed = task
      }, `chore(tasks): delete ${id}`)

      return asText({
        deleted: removed,
        from,
        workspace: ws(workspace),
        note: 'Not recoverable through this server — recreate with add_task using the fields above.',
      })
    },
  )

  server.registerTool(
    'add_focus_section',
    {
      title: 'Add a focus section',
      description:
        'Create a new section on the weekly focus view. The id is derived from the title, matching how the ' +
        'app\'s own "Add section" button mints ids.',
      inputSchema: {
        title: z.string().min(1).describe('Section heading, e.g. "Waiting On".'),
        content: z.string().optional().describe('Initial markdown body. Defaults to empty.'),
        position: z.number().int().min(0).optional()
          .describe('Insertion index among the existing sections. Defaults to the end.'),
        workspace: workspaceArg,
      },
    },
    async ({ title, content, position, workspace }) => {
      const now = nowISO()
      let created: FocusSection | null = null

      await storage.mutateFile(ws(workspace), 'focus', (data: FocusData) => {
        // Unlike a task id, this one is NOT hoisted out of the mutation. The
        // rule about generating ids beforehand exists because randomness must
        // not change between retries; this id is a deterministic function of
        // the title and the sections that currently exist, so on a retry it
        // *should* be recomputed against whatever landed underneath us —
        // otherwise a section added concurrently could collide.
        const section: FocusSection = {
          id: uniqueSectionId(title, data.sections),
          title,
          content: content ?? '',
        }
        const at = position === undefined ? data.sections.length : Math.min(position, data.sections.length)
        data.sections.splice(at, 0, section)
        data.updatedAt = now
        created = section
      }, `feat(focus): add section "${title}"`)

      return asText({ created, workspace: ws(workspace) })
    },
  )

  server.registerTool(
    'update_focus_section',
    {
      title: 'Update a focus section',
      description:
        'Replace or append to the markdown content of a section on the weekly focus view. ' +
        'The section may be given by id or title.',
      inputSchema: {
        section: z.string().min(1).describe('Section id or title, e.g. "today" or "Waiting On".'),
        content: z.string().describe('Markdown to write.'),
        mode: z.enum(['replace', 'append']).default('replace')
          .describe('replace overwrites the section; append adds to what is there.'),
        workspace: workspaceArg,
      },
    },
    async ({ section, content, mode, workspace }) => {
      const now = nowISO()
      let title = ''

      await storage.mutateFile(ws(workspace), 'focus', (data: FocusData) => {
        const needle = section.toLowerCase()
        const target = data.sections.find(
          s => s.id.toLowerCase() === needle || s.title.toLowerCase() === needle,
        )
        if (!target) {
          throw new Error(
            `No focus section matching "${section}". Available: ${data.sections.map(s => s.title).join(', ')}.`,
          )
        }
        title = target.title
        target.content = mode === 'append' ? appendMarkdown(target.content, content) : content
        data.updatedAt = now
      }, `chore(focus): ${mode} "${section}"`)

      return asText({ section: title, mode, workspace: ws(workspace) })
    },
  )

  server.registerTool(
    'append_log_entry',
    {
      title: 'Append to the week log',
      description:
        'Append a markdown entry to one of the week log narrative fields. ' +
        'Defaults to the most recent week.',
      inputSchema: {
        field: z.enum(['meetingsAndDiscussions', 'decisionsMade', 'frustrations'])
          .describe('Which narrative field to append to.'),
        content: z.string().min(1).describe('Markdown to append.'),
        weekOf: z.string().optional().describe('"YYYY-MM-DD" Monday. Defaults to the most recent week.'),
        workspace: workspaceArg,
      },
    },
    async ({ field, content, weekOf, workspace }) => {
      const now = nowISO()
      let target = ''

      await storage.mutateFile(ws(workspace), 'weekly_log', (data: WeeklyLogData) => {
        const week = resolveWeek(data, weekOf)
        target = week.weekOf
        week.narrative[field] = appendMarkdown(week.narrative[field], content)
        week.updatedAt = now
      }, `chore(weeklog): append to ${field}`)

      return asText({ weekOf: target, field, workspace: ws(workspace) })
    },
  )
}
