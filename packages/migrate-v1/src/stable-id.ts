/**
 * stable-id.ts — deterministic ULIDs for migrated records.
 *
 * The time part comes from the record itself (when it was created, or its
 * file's last update), so ids still sort by age. The random part is a hash of
 * a seed naming the workspace, the kind of record and its v1 identity, so the
 * same input always produces the same ids and two records never share one.
 */

import { createHash } from 'node:crypto'
import { Ulid } from '@hecate/core'

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const TIME_MAX = 2 ** 48 - 1

export function stableId(seed: string, ms: number): Ulid {
  if (!Number.isInteger(ms) || ms < 0 || ms > TIME_MAX) throw new RangeError(`ULID time out of range: ${ms}`)
  let time = ''
  let t = ms
  for (let i = 0; i < 10; i++) {
    const mod = t % 32
    time = ENCODING.charAt(mod) + time
    t = (t - mod) / 32
  }
  const digest = createHash('sha256').update(seed).digest()
  // 256 is a multiple of 32, so `byte & 31` is uniform over the alphabet.
  const random = Array.from(digest.subarray(0, 16), b => ENCODING.charAt(b & 31)).join('')
  return Ulid.parse(time + random)
}
