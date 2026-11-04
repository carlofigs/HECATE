/**
 * ulid.ts — ULIDs (https://github.com/ulid/spec), no dependency.
 *
 * 48-bit millisecond time + 80 random bits, Crockford base32, 26 characters,
 * sorting in creation order. Within one millisecond (or if the clock steps
 * back) the random part is incremented instead of redrawn, so ids from one
 * generator are strictly increasing.
 */

import type { Ulid } from './primitives.ts'

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const TIME_LEN = 10
const RANDOM_LEN = 16
const TIME_MAX = 2 ** 48 - 1

export interface UlidOptions {
  /** Milliseconds since the epoch. Defaults to Date.now. */
  now?: () => number
  /** Fills the array with random bytes. Defaults to the platform's crypto. */
  random?: (bytes: Uint8Array) => Uint8Array
}

interface CryptoLike {
  getRandomValues(bytes: Uint8Array): Uint8Array
}

function platformRandom(bytes: Uint8Array): Uint8Array {
  const crypto = (globalThis as { crypto?: CryptoLike }).crypto
  if (!crypto) throw new Error('No crypto.getRandomValues on this platform; pass `random` to createUlid')
  return crypto.getRandomValues(bytes)
}

function encodeTime(ms: number): string {
  let out = ''
  let t = ms
  for (let i = 0; i < TIME_LEN; i++) {
    const mod = t % 32
    out = ENCODING.charAt(mod) + out
    t = (t - mod) / 32
  }
  return out
}

function incrementBase32(s: string): string {
  const chars = s.split('')
  for (let i = chars.length - 1; i >= 0; i--) {
    const index = ENCODING.indexOf(chars[i] ?? '')
    if (index < ENCODING.length - 1) {
      chars[i] = ENCODING.charAt(index + 1)
      return chars.join('')
    }
    chars[i] = ENCODING.charAt(0)
  }
  throw new Error('ULID random component overflowed within one millisecond')
}

export function createUlid(options: UlidOptions = {}): () => Ulid {
  const now = options.now ?? Date.now
  const random = options.random ?? platformRandom
  let lastTime = -1
  let lastRandom = ''

  return () => {
    const t = now()
    if (!Number.isInteger(t) || t < 0 || t > TIME_MAX) throw new RangeError(`ULID time out of range: ${t}`)
    if (t <= lastTime) {
      lastRandom = incrementBase32(lastRandom)
    } else {
      lastTime = t
      // 256 is a multiple of 32, so `byte & 31` is uniform over the alphabet.
      lastRandom = Array.from(random(new Uint8Array(RANDOM_LEN)), b => ENCODING.charAt(b & 31)).join('')
    }
    return (encodeTime(lastTime) + lastRandom) as Ulid
  }
}

/** A shared generator using the real clock and platform crypto. */
export const ulid: () => Ulid = createUlid()

/** The creation time (ms since the epoch) encoded in a ULID. */
export function ulidTime(id: string): number {
  let t = 0
  for (const ch of id.slice(0, TIME_LEN).toUpperCase()) {
    const index = ENCODING.indexOf(ch)
    if (index < 0) throw new RangeError(`Not a ULID: ${id}`)
    t = t * 32 + index
  }
  return t
}
