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

// ─── Writing: ops, batches and the engine ───────────────────────────────────
export {
  emptyState, stateFromFiles, filesFromState, changedFiles, fileContent, parseMeetingFile, serializeMeetingFile,
  WorkspaceLoadError, type WorkspaceState, type Meeting, type FocusWeek, type Project, type Sprint, type MeetingFrontmatter,
  type WorkspaceFile,
} from './state.ts'
export { opSchema, OP_TYPES, type Op, type OpType } from './ops/index.ts'
export { OpFailure, slugify, type Actor, type OpErrorCode, type Warning } from './ops/context.ts'
export { ActorSchema, batchInputSchema, batchSchema, prepareBatch, BatchInputError, type Batch, type BatchInput, type PrepareOptions } from './batch.ts'
export { applyBatch, type ApplyResult, type ApplySuccess, type ApplyFailure, type OpError } from './apply.ts'
export { checkWorkspace, findPossibleNames, type Issue } from './check.ts'

// ─── Reading: derived views and markdown ────────────────────────────────────
export {
  findTask, blockers, isBlocked, summarise, inProgress, blockedTasks, waitingOn, sprintPosition, todayView,
  dueSoon, cutoffs, completedSince, briefing, focusWeekFor, personLabel, boardColumns, BRIEFING_ACTIVITY_LIMIT,
  type BoardCard, type BoardColumn, type TaskSummary, type TaskLocation, type WaitingItem, type SprintPosition, type TodayView, type DueItem,
  type CutoffItem, type CompletedItem, type Briefing,
} from './views/selectors.ts'
export { renderFocusWeek, renderPreview, renderErrors, renderBriefing, renderTasks, renderSearch, renderActivity } from './views/render.ts'
export { findTasks, searchWorkspace, getEntity, type TaskFilter, type FoundTask, type SearchHit, type Entity, type EntityKind } from './views/query.ts'
