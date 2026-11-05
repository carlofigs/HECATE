/**
 * batch.ts — what a writer sends, and the canonical form the engine applies.
 *
 * A writer sends `{ ops }`. prepareBatch turns that into a canonical Batch:
 * every generated id filled in, tag names normalised, and the batch stamped
 * with its opId, time and actor. The canonical batch is what gets stored and
 * replayed, so applying it is deterministic: the same state and the same
 * batch always give the same result.
 */

import { z } from 'zod'
import { Instant, type Ulid } from './primitives.ts'
import { ulid } from './ulid.ts'
import { opSchema, PREPARE, type Op } from './ops/index.ts'
import type { Actor } from './ops/context.ts'

const MAX_OPS = 500

export const ActorSchema = z.enum(['app', 'claude', 'bot', 'import'])

/** What a writer sends (and what MCP's apply_ops accepts). */
export const batchInputSchema = z.strictObject({
  ops: z.array(opSchema).min(1).max(MAX_OPS),
})
export type BatchInput = z.infer<typeof batchInputSchema>

/** A prepared batch: ids filled, stamped, ready to apply or to store for replay. */
export const batchSchema = z.strictObject({
  /** Unique per batch; a retried batch with the same opId is the same change. */
  opId: z.string().min(1).max(200),
  at: Instant,
  actor: ActorSchema,
  ops: z.array(opSchema).min(1).max(MAX_OPS),
})
export type Batch = z.infer<typeof batchSchema>

export class BatchInputError extends Error {
  readonly issues: readonly z.core.$ZodIssue[]
  constructor(message: string, issues: readonly z.core.$ZodIssue[] = []) {
    super(message)
    this.name = 'BatchInputError'
    this.issues = issues
  }
}

export interface PrepareOptions {
  opId: string
  at: string
  actor: Actor
  /** Id generator; defaults to the shared ULID generator. */
  newId?: () => Ulid
}

export function prepareBatch(input: unknown, options: PrepareOptions): Batch {
  const parsed = batchInputSchema.safeParse(input)
  if (!parsed.success) throw new BatchInputError(`Invalid batch:\n${z.prettifyError(parsed.error)}`, parsed.error.issues)

  const refs = parsed.data.ops.flatMap(op => (op.type === 'task.add' && op.ref ? [op.ref] : []))
  const duplicate = refs.find((ref, i) => refs.indexOf(ref) !== i)
  if (duplicate) throw new BatchInputError(`Placeholder ${duplicate} is declared by more than one task.add`)

  const newId = options.newId ?? ulid
  const ops = parsed.data.ops.map(op => (PREPARE[op.type] as (o: Op, n: () => Ulid) => Op)(op, newId))
  const batch = batchSchema.safeParse({ opId: options.opId, at: options.at, actor: options.actor, ops })
  if (!batch.success) throw new BatchInputError(`Invalid batch:\n${z.prettifyError(batch.error)}`, batch.error.issues)
  return batch.data
}
