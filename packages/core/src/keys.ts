/**
 * keys.ts — task keys (A12, B3). Allocation is pure: it returns the key and the
 * new counters, and the caller writes both in the same change.
 */

import { KEY_PREFIXES, type KeyPrefix } from './constants.ts'
import { TaskKey } from './primitives.ts'
import type { NextKey } from './schemas/tasks.ts'

const KEY_RE = /^([AB])([1-9]\d*)$/

export function parseKey(key: string): { prefix: KeyPrefix; n: number } | null {
  const m = KEY_RE.exec(key)
  if (!m) return null
  return { prefix: m[1] as KeyPrefix, n: Number(m[2]) }
}

export function formatKey(prefix: KeyPrefix, n: number): TaskKey {
  if (!KEY_PREFIXES.includes(prefix)) throw new RangeError(`Unknown key series: ${String(prefix)}`)
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`Key numbers start at 1, got ${n}`)
  return TaskKey.parse(`${prefix}${n}`)
}

/** The next key in a series, and the counters after taking it. */
export function allocateKey(file: { nextKey: NextKey }, prefix: KeyPrefix): { key: TaskKey; nextKey: NextKey } {
  const { keys, nextKey } = allocateKeys(file, prefix, 1)
  return { key: keys[0] as TaskKey, nextKey }
}

/** `count` consecutive keys in one series (for resolving `$1…$n` placeholders in a batch). */
export function allocateKeys(
  file: { nextKey: NextKey },
  prefix: KeyPrefix,
  count: number,
): { keys: TaskKey[]; nextKey: NextKey } {
  if (!Number.isInteger(count) || count < 0) throw new RangeError(`Cannot allocate ${count} keys`)
  const first = file.nextKey[prefix]
  const keys = Array.from({ length: count }, (_, i) => formatKey(prefix, first + i))
  return { keys, nextKey: { ...file.nextKey, [prefix]: first + count } }
}
