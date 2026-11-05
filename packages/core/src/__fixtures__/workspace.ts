/**
 * A small, consistent workspace for engine tests, built through the ops
 * themselves. Generic names only — this repository is public.
 *
 * Sprints: two weeks from Wed 30 Sep 2026 (sprint 5), so sprint 7 runs
 * Wed 28 Oct – Tue 10 Nov. AT is Thu 5 Nov 2026, 10:00 in Sydney.
 */

import { applyBatch, type ApplyResult, type ApplySuccess } from '../apply.ts'
import { prepareBatch } from '../batch.ts'
import type { Op } from '../ops/index.ts'
import type { Actor } from '../ops/context.ts'
import { parseFile } from '../versioning.ts'
import { emptyState, type WorkspaceState } from '../state.ts'
import { createUlid, ulid } from '../ulid.ts'
import { validFiles } from './valid.ts'

export const AT = '2026-11-04T23:00:00.000Z'

/** A deterministic id generator, for tests that compare two runs. Other batches use real ULIDs so ids never collide across batches. */
export const idGen = () => createUlid({ now: () => 1_793_836_800_000, random: b => b.fill(0) })

export interface RunOptions {
  opId?: string
  at?: string
  actor?: Actor
  newId?: () => ReturnType<ReturnType<typeof idGen>>
}

type OpInput = Record<string, unknown> & { type: Op['type'] }

export function run(state: WorkspaceState, ops: OpInput[], options: RunOptions = {}): ApplyResult {
  const batch = prepareBatch({ ops }, {
    opId: options.opId ?? 'test-op',
    at: options.at ?? AT,
    actor: options.actor ?? 'claude',
    newId: options.newId ?? ulid,
  })
  return applyBatch(state, batch)
}

/** Unwrap a successful result, failing the test with the errors otherwise. */
export function ok(result: ApplyResult): ApplySuccess {
  if (!result.ok) throw new Error(`Batch failed: ${JSON.stringify(result.errors, null, 2)}`)
  return result
}

function workspaceFile(policy: 'open' | 'sanitised' = 'open') {
  return parseFile('workspace', { ...validFiles.workspace, policy })
}

/**
 * Sam (product manager), project "scorecard", and four tasks:
 * A1 in progress (urgent, scorecard), A2 depends on A1 and B1, A3 to do, B1 waiting on Sam.
 */
export function baseState(policy: 'open' | 'sanitised' = 'open'): { state: WorkspaceState; samId: string } {
  const newId = ulid
  const samId = newId()
  const setup = ok(run(emptyState(workspaceFile(policy), AT), [
    { type: 'person.upsert', id: samId, ...(policy === 'open' ? { name: 'Sam' } : {}), role: 'Product manager' },
    { type: 'project.create', slug: 'scorecard', name: 'Scorecard' },
    { type: 'task.add', ref: '$1', kind: 'action', title: 'Draft the scorecard', status: 'in-progress', urgency: 'high', project: 'scorecard', tags: ['reporting'] },
    { type: 'task.add', ref: '$2', kind: 'waiting', title: 'Layout sign-off', waitingOn: { personId: samId } },
    { type: 'task.add', kind: 'action', title: 'Publish the scorecard', dependsOn: ['$1', '$2'], legacyIds: ['t-a7'] },
    { type: 'task.add', kind: 'action', title: 'Tidy the backlog' },
  ], { opId: 'setup', newId }))
  return { state: setup.state, samId }
}
