/**
 * @hecate/core — the v2 data contract.
 *
 * Every file in a workspace has a kind, a zod schema (types are inferred from
 * it), a version, and a path. Read with parseFile, write with serializeFile.
 * Dates are date-only strings in the workspace's time zone; task keys are A/B.
 */

export { FILE_KINDS, CURRENT_VERSION, type FileKind } from './kinds.ts'
export { schemas, pathFor, type FileData, type JsonFileKind } from './files.ts'
export {
  migrations,
  migrate,
  readVersion,
  parseFile,
  safeParseFile,
  stamp,
  serializeFile,
  serializeActivityEntry,
  parseActivityLog,
  UnversionedFileError,
  FutureSchemaError,
  FileValidationError,
  type Migration,
  type SafeParseResult,
} from './versioning.ts'

export * from './primitives.ts'
export * from './constants.ts'
export * from './dates.ts'
export * from './keys.ts'
export * from './ulid.ts'
export * from './policy.ts'
export * from './jsonSchema.ts'

export { workspaceSchema, Status, StatusCategory, SprintSettings } from './schemas/workspace.ts'
export { profileSchema } from './schemas/profile.ts'
export { tasksSchema, taskSchema, TaskKind, OrderKey, NextKey, type Task } from './schemas/tasks.ts'
export { focusWeekSchema, keepInMindSchema, ScheduleRow, PlanItem, Outcome, Day, PriorityTier } from './schemas/focus.ts'
export { projectSchema } from './schemas/project.ts'
export { sprintSchema } from './schemas/sprint.ts'
export { peopleSchema, Person } from './schemas/people.ts'
export { glossarySchema } from './schemas/glossary.ts'
export { activityEntrySchema } from './schemas/activity.ts'
export { meetingFrontmatterSchema } from './schemas/meeting.ts'
