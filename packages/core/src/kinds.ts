/**
 * kinds.ts — every kind of file in a v2 workspace, and its current schema version.
 *
 * Kept free of imports so the schemas can reference their own version without
 * a cycle through files.ts.
 *
 * Bump a kind's version on ANY change to its shape — including an added field —
 * and register the step in versioning.ts. Schemas are strict, so an older build
 * would reject (not silently strip) a field it does not know; the version bump
 * is what lets that older build refuse the file with a clear message instead.
 */

export const FILE_KINDS = [
  'workspace',
  'profile',
  'tasks',
  'focusWeek',
  'keepInMind',
  'project',
  'sprint',
  'people',
  'glossary',
  'activityEntry',
  'meetingFrontmatter',
] as const

export type FileKind = (typeof FILE_KINDS)[number]

export const CURRENT_VERSION = {
  workspace: 1,
  profile: 1,
  tasks: 1,
  focusWeek: 1,
  keepInMind: 1,
  project: 1,
  sprint: 1,
  people: 1,
  glossary: 1,
  activityEntry: 1,
  meetingFrontmatter: 1,
} as const satisfies Record<FileKind, number>
