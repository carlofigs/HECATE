/**
 * refine.ts — cross-field checks shared by the file schemas.
 */

import type { z } from 'zod'

type Path = (string | number)[]

/** Report every item whose key repeats an earlier one in the same list. */
export function checkUnique<T>(
  ctx: z.RefinementCtx,
  items: readonly T[],
  keyOf: (item: T) => string | number | null,
  path: Path,
  what: string,
): void {
  const seen = new Map<string | number, number>()
  items.forEach((item, i) => {
    const key = keyOf(item)
    if (key === null) return
    const first = seen.get(key)
    if (first === undefined) {
      seen.set(key, i)
    } else {
      ctx.addIssue({ code: 'custom', path: [...path, i], message: `Duplicate ${what} ${JSON.stringify(key)} (first at index ${first})` })
    }
  })
}

/** Report a range whose end comes before its start. Dates compare correctly as strings. */
export function checkRange(
  ctx: z.RefinementCtx,
  start: string | null,
  end: string | null,
  path: Path,
): void {
  if (start !== null && end !== null && end < start) {
    ctx.addIssue({ code: 'custom', path, message: `End ${end} is before start ${start}` })
  }
}
