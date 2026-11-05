/**
 * v1.ts — reading a v1 workspace: the seven JSON files, leniently.
 *
 * The schemas accept every shape v1 actually wrote (missing optional fields,
 * nulls where the types said string) and keep unknown keys, so that a field
 * this migration does not know is reported by the field accounting instead of
 * being dropped without a word. Enum-like values stay strings here; the
 * mapping decides what an unexpected value becomes and counts it.
 */

import { z } from 'zod'

export const V1_FILES = ['tasks', 'focus', 'projects', 'weekly_log', 'archive', 'memory', 'settings'] as const
export type V1FileName = (typeof V1_FILES)[number]

/** Raw text of each v1 file present in a workspace directory. */
export type V1Files = Partial<Record<V1FileName, string>>

const text = z.string().nullish().transform(v => v ?? null)
const strings = z.array(z.string()).nullish().transform(v => v ?? [])
const list = <T extends z.ZodType>(item: T) => z.array(item).nullish().transform(v => v ?? [])
const record = z.record(z.string(), z.string()).nullish().transform(v => v ?? {})

const V1Task = z.looseObject({
  id: text,
  title: z.string(),
  note: text,
  tags: strings,
  priority: text,
  blockedSince: text,
  createdAt: text,
  updatedAt: text,
})
export type V1Task = z.infer<typeof V1Task>

const Section = z.looseObject({ id: text, title: text, content: text })

const Snapshot = z.looseObject({ id: text, title: z.string(), note: text, tags: strings })
export type V1Snapshot = z.infer<typeof Snapshot>

const ArchivedTask = z.looseObject({ id: text, title: z.string(), note: text, tags: strings, originalColumn: text })
export type V1ArchivedTask = z.infer<typeof ArchivedTask>

const v1Schemas = {
  tasks: z.looseObject({
    columns: list(z.looseObject({ id: text, name: z.string(), columnType: text, tasks: list(V1Task) })),
  }),
  focus: z.looseObject({
    weekOf: z.string(),
    sprintLabel: text,
    updatedAt: text,
    sections: list(Section),
    calendarEvents: list(z.unknown()),
  }),
  projects: z.looseObject({
    projects: list(z.looseObject({
      id: z.string(),
      name: z.string(),
      subtitle: text,
      summary: text,
      status: text,
      phase: text,
      currentFocus: text,
      nextAction: text,
      jira: text,
      branch: text,
      tag: text,
      owner: text,
      updatedAt: text,
      timeline: list(z.looseObject({ phase: text, start: text, end: text, status: text })),
      openQuestions: list(z.looseObject({
        id: text,
        question: text,
        blocker: z.boolean().nullish().transform(v => v ?? false),
        status: text,
        resolution: text,
      })),
      models: list(z.looseObject({ name: text, layer: text, materialisationDev: text, materialisationProd: text, status: text })),
      sections: list(Section),
    })),
  }),
  weekly_log: z.looseObject({
    weeks: list(z.looseObject({
      weekOf: z.string(),
      dateRange: text,
      generatedAt: text,
      updatedAt: text,
      completed: list(Snapshot),
      carriedForward: list(Snapshot),
      delayed: list(Snapshot),
      nextWeek: strings,
      narrative: z.looseObject({
        meetingsAndDiscussions: text,
        decisionsMade: text,
        frustrations: text,
        oneOnOnePrep: z.looseObject({ people: strings, sections: record }).nullish(),
      }).nullish(),
    })),
  }),
  archive: z.looseObject({
    weeks: list(z.looseObject({ weekOf: z.string(), archivedAt: text, done: list(ArchivedTask), notDoing: list(ArchivedTask) })),
  }),
  memory: z.looseObject({
    updatedAt: text,
    me: text,
    people: list(z.looseObject({ name: z.string(), aliases: strings, role: text, notes: text })),
    terms: list(z.looseObject({ term: z.string(), meaning: text })),
    projects: list(z.looseObject({ name: z.string(), summary: text })),
    recurringResponsibilities: list(z.looseObject({ name: z.string(), cadence: text, notes: text })),
    preferences: text,
    productivitySystem: text,
    referenceFiles: record,
  }),
  settings: z.looseObject({}),
} as const satisfies Record<V1FileName, z.ZodType>

type Parsed = { [K in V1FileName]: z.infer<(typeof v1Schemas)[K]> }
/** A workspace with no focus.json has no focus week to carry over. */
export type V1Data = Omit<Parsed, 'focus'> & { focus: Parsed['focus'] | null }

/** What an absent file reads as. */
const EMPTY: { [K in V1FileName]: unknown } = {
  tasks: { columns: [] },
  focus: null,
  projects: { projects: [] },
  weekly_log: { weeks: [] },
  archive: { weeks: [] },
  memory: {},
  settings: {},
}

/**
 * Objects whose keys are data (a file path, a person's name), not field
 * names. The accounting records their entries as `.*`.
 */
const RECORD_PATHS = new Set(['memory.referenceFiles', 'weekly_log.weeks[].narrative.oneOnOnePrep.sections'])

/**
 * Every object key path in a v1 file and how often it occurs, e.g.
 * `tasks.columns[].tasks[].priority`. Array items share their parent's path
 * with `[]`; the entries of a data-keyed object are recorded as `.*`.
 */
export function collectPaths(file: V1FileName, raw: unknown, out: Map<string, number> = new Map()): Map<string, number> {
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, `${path}[]`)
      return
    }
    if (value === null || typeof value !== 'object') return
    const isRecord = RECORD_PATHS.has(path)
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${isRecord ? '*' : key}`
      out.set(childPath, (out.get(childPath) ?? 0) + 1)
      visit(child, childPath)
    }
  }
  visit(raw, file)
  return out
}

interface V1ReadProblem {
  file: V1FileName
  message: string
}

export interface V1Workspace {
  data: V1Data
  /** Which files were present. */
  present: Set<V1FileName>
  paths: Map<string, number>
  problems: V1ReadProblem[]
}

/** The newest shape v1 ever wrote. A higher `schemaVersion` came from a build this migration does not know. */
const V1_SCHEMA_VERSION = 1

/** Parse each file that is present; an absent file reads as empty. */
export function readV1(files: V1Files): V1Workspace {
  const problems: V1ReadProblem[] = []
  const present = new Set<V1FileName>()
  const paths = new Map<string, number>()
  const data = {} as Record<V1FileName, unknown>

  for (const file of V1_FILES) {
    const raw = files[file]
    let value: unknown = EMPTY[file]
    if (raw !== undefined) {
      present.add(file)
      try {
        value = JSON.parse(raw)
      } catch {
        problems.push({ file, message: 'not valid JSON' })
        value = EMPTY[file]
      }
      collectPaths(file, value, paths)
      const version = (value as { schemaVersion?: unknown } | null)?.schemaVersion
      if (typeof version === 'number' && version > V1_SCHEMA_VERSION) {
        problems.push({ file, message: `schemaVersion ${version} is newer than any v1 build this migration knows (${V1_SCHEMA_VERSION})` })
      }
    }
    if (value === null) {
      data[file] = file === 'focus' ? null : v1Schemas[file].parse(EMPTY[file])
      continue
    }
    const parsed = v1Schemas[file].safeParse(value)
    if (parsed.success) {
      data[file] = parsed.data
    } else {
      for (const issue of parsed.error.issues.slice(0, 5)) {
        problems.push({ file, message: `${issue.path.join('.') || '(root)'}: ${issue.message}` })
      }
      data[file] = EMPTY[file] === null ? null : v1Schemas[file].parse(EMPTY[file])
    }
  }
  return { data: data as V1Data, present, paths, problems }
}
