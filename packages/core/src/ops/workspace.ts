import { z } from 'zod'
import { Line, Markdown, Ulid } from '../primitives.ts'
import { SprintSettings, Status } from '../schemas/workspace.ts'
import { checkPolicy } from '../policy.ts'
import { isValidTimeZone } from '../dates.ts'
import { OpFailure, slugify, withIds, type OpContext } from './context.ts'

export const workspaceUpdate = z.strictObject({
  type: z.literal('workspace.update'),
  patch: z
    .strictObject({
      name: Line,
      timezone: z.string(),
      policy: z.enum(['open', 'sanitised']),
      workdays: z.array(z.int().min(1).max(7)),
      sprint: SprintSettings.nullable(),
      /** Replaces the whole list; board order is list order. */
      statuses: z.array(Status),
      tags: z.array(z.strictObject({ id: z.string(), label: Line.nullable() })),
      areas: z.array(z.strictObject({ id: z.string(), label: Line })),
    })
    .partial(),
})

export const profileUpdate = z.strictObject({
  type: z.literal('profile.update'),
  patch: z
    .strictObject({
      me: Markdown,
      preferences: Markdown,
      productivitySystem: Markdown,
      responsibilities: z.array(
        z.strictObject({ id: Ulid.optional(), name: Line, cadence: Line, notes: Markdown.nullable().optional() }),
      ),
    })
    .partial(),
})

type WorkspaceUpdate = z.infer<typeof workspaceUpdate>
type ProfileUpdate = z.infer<typeof profileUpdate>

export function prepareWorkspaceUpdate(op: WorkspaceUpdate): WorkspaceUpdate {
  const p = op.patch
  return {
    ...op,
    patch: {
      ...p,
      ...(p.tags ? { tags: p.tags.map(t => ({ ...t, id: slugify(t.id) })) } : {}),
      ...(p.areas ? { areas: p.areas.map(a => ({ ...a, id: slugify(a.id) })) } : {}),
    },
  }
}

export function prepareProfileUpdate(op: ProfileUpdate, newId: () => Ulid): ProfileUpdate {
  const responsibilities = withIds(op.patch.responsibilities, newId)
  return responsibilities ? { ...op, patch: { ...op.patch, responsibilities } } : op
}

export function applyWorkspaceUpdate(op: WorkspaceUpdate, ctx: OpContext): void {
  const ws = ctx.state.workspace
  const p = op.patch

  if (p.timezone !== undefined && !isValidTimeZone(p.timezone)) {
    throw new OpFailure('invalid', `"${p.timezone}" is not a time zone this runtime knows (e.g. Australia/Sydney)`)
  }
  if (p.statuses !== undefined) {
    const keep = new Set(p.statuses.map(s => s.id))
    const inUse = [...new Set(ctx.state.tasks.tasks.map(t => t.status))].filter(s => !keep.has(s))
    if (inUse.length > 0) {
      throw new OpFailure('conflict', `Cannot remove statuses still in use: ${inUse.join(', ')}. Move those tasks first.`, inUse)
    }
  }
  if (p.tags !== undefined) {
    const keep = new Set(p.tags.map(t => t.id))
    const inUse = [...new Set(ctx.state.tasks.tasks.flatMap(t => t.tags))].filter(t => !keep.has(t))
    if (inUse.length > 0) throw new OpFailure('conflict', `Cannot remove tags still in use: ${inUse.join(', ')}`, inUse)
  }
  if (p.policy === 'sanitised' && ws.policy !== 'sanitised') {
    const issues = checkPolicy('people', ctx.state.people, 'sanitised')
    if (issues.length > 0) {
      throw new OpFailure('policy', `Cannot make this workspace sanitised while people have names or aliases (${issues.length} to remove first)`)
    }
    if (Object.keys(ctx.state.meetings).length > 0) {
      throw new OpFailure('policy', 'Cannot make this workspace sanitised while it holds meeting notes')
    }
  }

  if (p.name !== undefined) ws.name = p.name
  if (p.timezone !== undefined) ws.timezone = p.timezone
  if (p.policy !== undefined) ws.policy = p.policy
  if (p.workdays !== undefined) ws.workdays = [...new Set(p.workdays)].sort()
  if (p.sprint !== undefined) ws.sprint = p.sprint
  if (p.statuses !== undefined) ws.statuses = p.statuses
  if (p.tags !== undefined) ws.tags = p.tags
  if (p.areas !== undefined) ws.areas = p.areas
  ctx.touch('workspace.json')
  ctx.summary(`Update workspace settings: ${Object.keys(p).join(', ') || 'nothing'}`)
}

export function applyProfileUpdate(op: ProfileUpdate, ctx: OpContext): void {
  const profile = ctx.state.profile
  const p = op.patch
  if (p.me !== undefined) profile.me = p.me
  if (p.preferences !== undefined) profile.preferences = p.preferences
  if (p.productivitySystem !== undefined) profile.productivitySystem = p.productivitySystem
  if (p.responsibilities !== undefined) {
    profile.responsibilities = p.responsibilities.map(r => ({ id: r.id, name: r.name, cadence: r.cadence, notes: r.notes ?? null })) as never
  }
  profile.updatedAt = ctx.at
  ctx.touch('profile.json')
  ctx.summary(`Update profile: ${Object.keys(p).join(', ') || 'nothing'}`)
}
