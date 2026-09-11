/**
 * read.ts — read-only tools
 *
 * Phase 1 deliberately exposes reads only. Scoped write verbs (add_task,
 * append_log_entry, …) come next, once the plumbing here has been used in
 * anger. Nothing in this file can modify the data repo.
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { DataFileName, TasksData, Task } from '../../../src/lib/schemas'
import type { StorageAdapter } from '../storage/types'
import type { McpConfig } from '../config'

/**
 * Exhaustive both ways: a missing key fails to satisfy Record<DataFileName, …>,
 * and an extra key is not assignable to DataFileName. Adding a file to
 * schemas.ts therefore breaks the build here until it is exposed, which is the
 * cheapest available guarantee that app and server cannot drift.
 */
const DATA_FILE_SET: Record<DataFileName, true> = {
  tasks: true, focus: true, projects: true, weekly_log: true,
  archive: true, memory: true, settings: true,
}
export const DATA_FILE_NAMES = Object.keys(DATA_FILE_SET) as [DataFileName, ...DataFileName[]]

/** Tools take an optional workspace and fall back to the configured default. */
const workspaceArg = z.string().min(1).optional()
  .describe('Workspace directory in the data repo. Defaults to the configured HECATE_WORKSPACE.')

function asText(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

/** A task flattened with the column it sits in — the shape a session actually wants. */
interface FlatTask extends Task {
  column: string
  columnType: string | null
}

function flattenTasks(data: TasksData): FlatTask[] {
  return data.columns.flatMap(col =>
    col.tasks.map(task => ({ ...task, column: col.name, columnType: col.columnType ?? null })),
  )
}

export function registerReadTools(server: McpServer, storage: StorageAdapter, config: McpConfig): void {
  const ws = (given?: string) => given ?? config.workspace

  server.registerTool(
    'list_workspaces',
    {
      title: 'List workspaces',
      description:
        'List workspace directories in the HECATE data repo. Archived workspaces (leading underscore) ' +
        'and infrastructure directories are excluded, matching the app\'s own picker.',
      inputSchema: {},
    },
    async () => asText({ workspaces: await storage.listWorkspaces(), default: config.workspace }),
  )

  server.registerTool(
    'read_data_file',
    {
      title: 'Read a data file',
      description:
        'Read one HECATE data file in full, migrated to the current schema and structurally validated. ' +
        'Use this when you need the whole document; prefer list_tasks for task queries.',
      inputSchema: {
        name: z.enum(DATA_FILE_NAMES).describe('Which data file to read.'),
        workspace: workspaceArg,
      },
    },
    async ({ name, workspace }) => {
      const { data, sha } = await storage.readFile(ws(workspace), name)
      return asText({ workspace: ws(workspace), name, sha, data })
    },
  )

  server.registerTool(
    'list_tasks',
    {
      title: 'List tasks',
      description:
        'List tasks across all columns, flattened with their column name and type. ' +
        'Optionally filter by column type, by tag, or by free-text match on the title.',
      inputSchema: {
        columnType: z.enum(['backlog', 'in-progress', 'done', 'not-doing'])
          .optional().describe('Only tasks in columns of this type.'),
        tag: z.string().min(1).optional().describe('Only tasks carrying this tag (case-insensitive).'),
        titleContains: z.string().min(1).optional().describe('Case-insensitive substring match on the title.'),
        workspace: workspaceArg,
      },
    },
    async ({ columnType, tag, titleContains, workspace }) => {
      const { data } = await storage.readFile(ws(workspace), 'tasks')
      let tasks = flattenTasks(data)

      if (columnType) tasks = tasks.filter(t => t.columnType === columnType)
      if (tag) {
        const needle = tag.toLowerCase()
        tasks = tasks.filter(t => t.tags.some(x => x.toLowerCase() === needle))
      }
      if (titleContains) {
        const needle = titleContains.toLowerCase()
        tasks = tasks.filter(t => t.title.toLowerCase().includes(needle))
      }

      return asText({ workspace: ws(workspace), count: tasks.length, tasks })
    },
  )
}
