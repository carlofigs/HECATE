/**
 * ops/index.ts — the op catalogue: one discriminated union of every op, the
 * step that fills in generated ids (prepare), and the handler that applies it.
 */

import { z } from 'zod'
import type { Ulid } from '../primitives.ts'
import type { OpContext } from './context.ts'
import * as content from './content.ts'
import * as focus from './focus.ts'
import * as people from './people.ts'
import * as projects from './projects.ts'
import * as sprints from './sprints.ts'
import * as tasks from './tasks.ts'
import * as workspace from './workspace.ts'

export const opSchema = z.discriminatedUnion('type', [
  tasks.taskAdd,
  tasks.taskUpdate,
  tasks.taskMove,
  tasks.taskComplete,
  tasks.taskDrop,
  tasks.taskReopen,
  tasks.taskDelete,
  workspace.workspaceUpdate,
  workspace.profileUpdate,
  focus.focusSetSchedule,
  focus.focusSetPlan,
  focus.focusCloseDay,
  focus.focusSetPriorities,
  focus.focusSetCallouts,
  focus.focusSetLastWeek,
  focus.focusSetSection,
  focus.focusRemoveSection,
  focus.keepInMindAdd,
  focus.keepInMindUpdate,
  focus.keepInMindRemove,
  projects.projectCreate,
  projects.projectUpdate,
  projects.projectAddOpenQuestion,
  projects.projectResolveOpenQuestion,
  sprints.sprintStart,
  sprints.sprintUpdate,
  sprints.sprintClose,
  people.personUpsert,
  people.personRemove,
  people.termUpsert,
  people.termRemove,
  content.referencePut,
  content.referenceRemove,
  content.meetingSave,
  content.activityLog,
])

export type Op = z.infer<typeof opSchema>
export type OpType = Op['type']
type OpOf<T extends OpType> = Extract<Op, { type: T }>

export const OP_TYPES: OpType[] = opSchema.options.map(o => o.shape.type.value)

type Preparer<T extends OpType> = (op: OpOf<T>, newId: () => Ulid) => OpOf<T>
type Handler<T extends OpType> = (op: OpOf<T>, ctx: OpContext, appendActivity: (entry: never) => void) => void

const same = <T>(op: T): T => op

/** Fill every generated id (and normalise tag names) so the batch replays identically. */
export const PREPARE: { [T in OpType]: Preparer<T> } = {
  'task.add': tasks.prepareTaskAdd,
  'task.update': tasks.prepareTaskUpdate,
  'task.move': same,
  'task.complete': same,
  'task.drop': same,
  'task.reopen': same,
  'task.delete': same,
  'workspace.update': workspace.prepareWorkspaceUpdate,
  'profile.update': workspace.prepareProfileUpdate,
  'focus.setSchedule': focus.prepareSchedule,
  'focus.setPlan': focus.prepareListOp,
  'focus.closeDay': focus.prepareCloseDay,
  'focus.setPriorities': focus.prepareListOp,
  'focus.setCallouts': focus.prepareListOp,
  'focus.setLastWeek': focus.prepareListOp,
  'focus.setSection': same,
  'focus.removeSection': same,
  'keepInMind.add': focus.prepareKeepInMindAdd,
  'keepInMind.update': same,
  'keepInMind.remove': same,
  'project.create': projects.prepareProjectCreate,
  'project.update': projects.prepareProjectUpdate,
  'project.addOpenQuestion': projects.prepareAddQuestion,
  'project.resolveOpenQuestion': same,
  'sprint.start': same,
  'sprint.update': same,
  'sprint.close': same,
  'person.upsert': people.preparePersonUpsert,
  'person.remove': same,
  'term.upsert': people.prepareTermUpsert,
  'term.remove': same,
  'reference.put': same,
  'reference.remove': same,
  'meeting.save': content.prepareMeetingSave,
  'activity.log': content.prepareActivityLog,
}

export const HANDLERS: { [T in OpType]: Handler<T> } = {
  'task.add': tasks.applyTaskAdd,
  'task.update': tasks.applyTaskUpdate,
  'task.move': tasks.applyTaskMove,
  'task.complete': tasks.applyTaskComplete,
  'task.drop': tasks.applyTaskDrop,
  'task.reopen': tasks.applyTaskReopen,
  'task.delete': tasks.applyTaskDelete,
  'workspace.update': workspace.applyWorkspaceUpdate,
  'profile.update': workspace.applyProfileUpdate,
  'focus.setSchedule': focus.applyFocusSetSchedule,
  'focus.setPlan': focus.applyFocusSetPlan,
  'focus.closeDay': focus.applyFocusCloseDay,
  'focus.setPriorities': focus.applyFocusSetPriorities,
  'focus.setCallouts': focus.applyFocusSetCallouts,
  'focus.setLastWeek': focus.applyFocusSetLastWeek,
  'focus.setSection': focus.applyFocusSetSection,
  'focus.removeSection': focus.applyFocusRemoveSection,
  'keepInMind.add': focus.applyKeepInMindAdd,
  'keepInMind.update': focus.applyKeepInMindUpdate,
  'keepInMind.remove': focus.applyKeepInMindRemove,
  'project.create': projects.applyProjectCreate,
  'project.update': projects.applyProjectUpdate,
  'project.addOpenQuestion': projects.applyProjectAddOpenQuestion,
  'project.resolveOpenQuestion': projects.applyProjectResolveOpenQuestion,
  'sprint.start': sprints.applySprintStart,
  'sprint.update': sprints.applySprintUpdate,
  'sprint.close': sprints.applySprintClose,
  'person.upsert': people.applyPersonUpsert,
  'person.remove': people.applyPersonRemove,
  'term.upsert': people.applyTermUpsert,
  'term.remove': people.applyTermRemove,
  'reference.put': content.applyReferencePut,
  'reference.remove': content.applyReferenceRemove,
  'meeting.save': content.applyMeetingSave,
  'activity.log': content.applyActivityLog,
}
