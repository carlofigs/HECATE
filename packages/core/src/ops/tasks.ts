import { z } from 'zod'
import { URGENCY_EMOJI } from '../constants.ts'
import { IsoDate, Line, Markdown, Slug, Ulid, Urgency, type TaskKey } from '../primitives.ts'
import { TaskKind } from '../schemas/tasks.ts'
import {
  categoryOf, ensureTags, firstStatus, isClosedCategory, OpFailure, place, resolveKeys, resolveTask,
  slugify, statusById, type OpContext,
} from './context.ts'

/** A task reference: its key (A12), a legacy id (t-a12) or a `$n` placeholder from this batch. */
export const TaskRef = z.string().min(1)
/** A name a task.add gives the key it will be allocated, for later ops in the same batch. */
const Placeholder = z.string().regex(/^\$[1-9]\d*$/, 'Expected a placeholder such as $1')

const WaitingOn = z.strictObject({
  personId: Ulid.nullable().optional(),
  text: Line.nullable().optional(),
})

const taskFields = {
  title: Line,
  note: Markdown.nullable(),
  urgency: Urgency.nullable(),
  /** Tag names; `#Monthly Report` is stored as `monthly-report`. New tags are added to the workspace. */
  tags: z.array(z.string()),
  /** Project slug, or null for none. */
  project: Slug.nullable(),
  waitingOn: WaitingOn.nullable(),
  dependsOn: z.array(TaskRef),
  due: IsoDate.nullable(),
}

export const taskAdd = z.strictObject({
  type: z.literal('task.add'),
  /** Name this task's key so later ops in the batch can refer to it before it exists. */
  ref: Placeholder.optional(),
  id: Ulid.optional(),
  /** `action` gets an A key; `waiting` (on someone else) gets a B key. */
  kind: TaskKind,
  title: taskFields.title,
  note: taskFields.note.optional(),
  /** Status id; defaults to the first "todo" status. */
  status: Slug.optional(),
  urgency: taskFields.urgency.optional(),
  tags: taskFields.tags.optional(),
  project: taskFields.project.optional(),
  waitingOn: taskFields.waitingOn.optional(),
  dependsOn: taskFields.dependsOn.optional(),
  due: taskFields.due.optional(),
  /** Place directly after this task in its status; null for first; omit for last. */
  after: TaskRef.nullable().optional(),
  /** Ids this task had in an earlier system, so old references keep resolving. */
  legacyIds: z.array(Line).optional(),
})

export const taskUpdate = z.strictObject({
  type: z.literal('task.update'),
  task: TaskRef,
  patch: z.strictObject(taskFields).partial(),
})

export const taskMove = z.strictObject({
  type: z.literal('task.move'),
  task: TaskRef,
  status: Slug,
  after: TaskRef.nullable().optional(),
})

export const taskComplete = z.strictObject({ type: z.literal('task.complete'), task: TaskRef })
export const taskDrop = z.strictObject({ type: z.literal('task.drop'), task: TaskRef })
export const taskReopen = z.strictObject({ type: z.literal('task.reopen'), task: TaskRef, status: Slug.optional() })
export const taskDelete = z.strictObject({ type: z.literal('task.delete'), task: TaskRef })

type TaskAdd = z.infer<typeof taskAdd>

export function prepareTaskAdd(op: TaskAdd, newId: () => Ulid): TaskAdd {
  return { ...op, id: op.id ?? newId(), ...(op.tags ? { tags: op.tags.map(slugify) } : {}) }
}

export function prepareTaskUpdate(op: z.infer<typeof taskUpdate>): z.infer<typeof taskUpdate> {
  return op.patch.tags ? { ...op, patch: { ...op.patch, tags: op.patch.tags.map(slugify) } } : op
}

function projectId(ctx: OpContext, slug: string | null): string | null {
  if (slug === null) return null
  const project = ctx.state.projects[slug]
  if (!project) throw new OpFailure('not-found', `No project "${slug}"`, Object.keys(ctx.state.projects))
  return project.id
}

function waitingOn(ctx: OpContext, value: z.infer<typeof WaitingOn> | null | undefined) {
  if (!value) return null
  const personId = value.personId ?? null
  if (personId !== null && !ctx.state.people.people.some(p => p.id === personId)) {
    throw new OpFailure('not-found', `No person with id ${personId}`, ctx.state.people.people.map(p => `${p.id} (${p.role})`))
  }
  const text = value.text ?? null
  if (personId === null && text === null) return null
  return { personId, text }
}

const label = (key: string, title: string): string => `${key} "${title}"`

/** Set a task's status and keep completedAt and the activity log consistent with it. */
function setStatus(ctx: OpContext, task: ReturnType<typeof resolveTask>, statusId: string, after: string | null | undefined): void {
  const status = statusById(ctx, statusId)
  const wasClosed = task.completedAt !== null
  const before = task.status
  place(ctx, task, status.id, after)
  task.status = status.id
  task.updatedAt = ctx.at
  if (isClosedCategory(status.category)) {
    if (!wasClosed || statusById(ctx, before).category !== status.category) {
      task.completedAt = ctx.at
      ctx.event(`${status.category === 'done' ? 'Completed' : 'Dropped'} ${task.key} — ${task.title}`, [task.key])
    }
  } else {
    task.completedAt = null
  }
  ctx.touch('tasks.json')
}

export function applyTaskAdd(op: TaskAdd, ctx: OpContext): void {
  const key = ctx.addKeys.get(ctx.index) as TaskKey
  if (!op.id) throw new OpFailure('invalid', 'task.add has no id; run the batch through prepareBatch first')
  const status = op.status ? statusById(ctx, op.status) : firstStatus(ctx, 'todo')
  if (op.kind === 'action' && op.waitingOn) throw new OpFailure('invalid', 'Only waiting tasks have waitingOn')
  const n = Number(key.slice(1))
  const prefix = key[0] as 'A' | 'B'
  ctx.state.tasks.nextKey[prefix] = Math.max(ctx.state.tasks.nextKey[prefix], n + 1)

  ctx.state.tasks.tasks.push({
    id: op.id,
    key,
    legacyIds: op.legacyIds ?? [],
    kind: op.kind,
    title: op.title,
    note: op.note ?? null,
    status: status.id,
    order: 'a0',
    urgency: op.urgency ?? null,
    tags: ensureTags(ctx, op.tags ?? []),
    projectId: projectId(ctx, op.project ?? null),
    waitingOn: op.kind === 'waiting' ? waitingOn(ctx, op.waitingOn) : null,
    dependsOn: resolveKeys(ctx, op.dependsOn),
    due: op.due ?? null,
    createdAt: ctx.at,
    updatedAt: ctx.at,
    completedAt: isClosedCategory(status.category) ? ctx.at : null,
  } as never)
  const task = resolveTask(ctx, key)
  place(ctx, task, status.id, op.after)
  ctx.touch('tasks.json')
  ctx.event(`Added ${key} — ${op.title}`, [key])
  const urgency = op.urgency ? `, ${URGENCY_EMOJI[op.urgency]}` : ''
  ctx.summary(`Add ${label(key, op.title)} (${status.name}${urgency})${op.ref ? ` as ${op.ref}` : ''}`)
}

export function applyTaskUpdate(op: z.infer<typeof taskUpdate>, ctx: OpContext): void {
  const task = resolveTask(ctx, op.task)
  const p = op.patch
  if (p.title !== undefined) task.title = p.title
  if (p.note !== undefined) task.note = p.note
  if (p.urgency !== undefined) task.urgency = p.urgency
  if (p.tags !== undefined) task.tags = ensureTags(ctx, p.tags)
  if (p.project !== undefined) task.projectId = projectId(ctx, p.project) as never
  if (p.waitingOn !== undefined) {
    if (task.kind === 'action' && p.waitingOn !== null) throw new OpFailure('invalid', `${task.key} is an action; only waiting (B) tasks have waitingOn`)
    task.waitingOn = waitingOn(ctx, p.waitingOn)
  }
  if (p.dependsOn !== undefined) {
    const keys = resolveKeys(ctx, p.dependsOn)
    if (keys.includes(task.key)) throw new OpFailure('invalid', `${task.key} cannot depend on itself`)
    task.dependsOn = keys
  }
  if (p.due !== undefined) task.due = p.due
  task.updatedAt = ctx.at
  ctx.touch('tasks.json')
  ctx.summary(`Update ${label(task.key, task.title)}: ${Object.keys(p).join(', ') || 'nothing'}`)
}

export function applyTaskMove(op: z.infer<typeof taskMove>, ctx: OpContext): void {
  const task = resolveTask(ctx, op.task)
  setStatus(ctx, task, op.status, op.after)
  ctx.summary(`Move ${label(task.key, task.title)} to ${statusById(ctx, op.status).name}`)
}

export function applyTaskComplete(op: z.infer<typeof taskComplete>, ctx: OpContext): void {
  const task = resolveTask(ctx, op.task)
  const done = firstStatus(ctx, 'done')
  setStatus(ctx, task, done.id, undefined)
  ctx.summary(`Complete ${label(task.key, task.title)} ✅`)
}

export function applyTaskDrop(op: z.infer<typeof taskDrop>, ctx: OpContext): void {
  const task = resolveTask(ctx, op.task)
  const dropped = firstStatus(ctx, 'dropped')
  setStatus(ctx, task, dropped.id, undefined)
  ctx.summary(`Drop ${label(task.key, task.title)} ❌`)
}

export function applyTaskReopen(op: z.infer<typeof taskReopen>, ctx: OpContext): void {
  const task = resolveTask(ctx, op.task)
  const status = op.status ? statusById(ctx, op.status) : firstStatus(ctx, 'todo')
  if (isClosedCategory(status.category)) throw new OpFailure('invalid', `"${status.id}" is a ${status.category} status; reopen into an open one`)
  if (!isClosedCategory(categoryOf(ctx, task))) throw new OpFailure('conflict', `${task.key} is already open`)
  setStatus(ctx, task, status.id, undefined)
  ctx.summary(`Reopen ${label(task.key, task.title)} into ${status.name}`)
}

export function applyTaskDelete(op: z.infer<typeof taskDelete>, ctx: OpContext): void {
  const task = resolveTask(ctx, op.task)
  const dependants = ctx.state.tasks.tasks.filter(t => t.dependsOn.includes(task.key)).map(t => t.key)
  if (dependants.length > 0) {
    throw new OpFailure('conflict', `${task.key} cannot be deleted while ${dependants.join(', ')} depend on it`, dependants)
  }
  ctx.state.tasks.tasks.splice(ctx.state.tasks.tasks.indexOf(task), 1)
  ctx.touch('tasks.json')
  ctx.summary(`Delete ${label(task.key, task.title)} (its key is not reused)`)
}
