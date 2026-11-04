/**
 * files.ts — the schema for every kind of file, and where each lives.
 */

import type { z } from 'zod'
import type { FileKind } from './kinds.ts'
import { IsoDate, Slug } from './primitives.ts'
import { activityEntrySchema } from './schemas/activity.ts'
import { focusWeekSchema, keepInMindSchema } from './schemas/focus.ts'
import { glossarySchema } from './schemas/glossary.ts'
import { meetingFrontmatterSchema } from './schemas/meeting.ts'
import { peopleSchema } from './schemas/people.ts'
import { profileSchema } from './schemas/profile.ts'
import { projectSchema } from './schemas/project.ts'
import { sprintSchema } from './schemas/sprint.ts'
import { tasksSchema } from './schemas/tasks.ts'
import { workspaceSchema } from './schemas/workspace.ts'

export const schemas = {
  workspace: workspaceSchema,
  profile: profileSchema,
  tasks: tasksSchema,
  focusWeek: focusWeekSchema,
  keepInMind: keepInMindSchema,
  project: projectSchema,
  sprint: sprintSchema,
  people: peopleSchema,
  glossary: glossarySchema,
  activityEntry: activityEntrySchema,
  meetingFrontmatter: meetingFrontmatterSchema,
} as const satisfies Record<FileKind, z.ZodType>

/** The parsed, validated contents of a file of kind K. */
export type FileData<K extends FileKind> = z.infer<(typeof schemas)[K]>

/** Kinds stored as one pretty-printed JSON document per file. */
export type JsonFileKind = Exclude<FileKind, 'activityEntry' | 'meetingFrontmatter'>

interface PathParams {
  workspace: undefined
  profile: undefined
  tasks: undefined
  focusWeek: { weekOf: string }
  keepInMind: undefined
  project: { slug: string }
  sprint: { n: number }
  people: undefined
  glossary: undefined
  activityEntry: { week: string }
  meetingFrontmatter: { date: string; slug: string }
}

/**
 * The path of a file within its workspace directory. Parameters are validated,
 * so a slug or date can never produce a path outside the workspace.
 */
export function pathFor<K extends FileKind>(
  kind: K,
  ...params: PathParams[K] extends undefined ? [] : [PathParams[K]]
): string {
  const p = params[0] as Record<string, unknown> | undefined
  switch (kind) {
    case 'workspace': return 'workspace.json'
    case 'profile': return 'profile.json'
    case 'tasks': return 'tasks.json'
    case 'keepInMind': return 'focus/keep-in-mind.json'
    case 'people': return 'people.json'
    case 'glossary': return 'glossary.json'
    case 'focusWeek': return `focus/${IsoDate.parse(p?.weekOf)}.json`
    case 'project': return `projects/${Slug.parse(p?.slug)}.json`
    case 'sprint': {
      const n = p?.n
      if (typeof n !== 'number' || !Number.isInteger(n)) throw new RangeError(`Sprint number must be an integer, got ${String(n)}`)
      return `sprints/${n}.json`
    }
    case 'activityEntry': {
      const week = String(p?.week)
      if (!/^\d{4}-W\d{2}$/.test(week)) throw new RangeError(`Expected an ISO week key (YYYY-Www), got ${week}`)
      return `activity/${week}.jsonl`
    }
    case 'meetingFrontmatter':
      return `meetings/${IsoDate.parse(p?.date)}-${Slug.parse(p?.slug)}.md`
    default: {
      const never: never = kind
      throw new Error(`Unknown file kind: ${String(never)}`)
    }
  }
}
