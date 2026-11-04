import { describe, expect, it } from 'vitest'
import { Ulid } from './primitives.ts'
import { createUlid, ulid, ulidTime } from './ulid.ts'

describe('ulid', () => {
  it('encodes time as the spec vector does', () => {
    const gen = createUlid({ now: () => 1469918176385, random: b => b.fill(0) })
    const id = gen()
    expect(id.slice(0, 10)).toBe('01ARYZ6S41')
    expect(id).toHaveLength(26)
    expect(ulidTime(id)).toBe(1469918176385)
  })

  it('is strictly increasing within one millisecond and when the clock steps back', () => {
    let t = 1_700_000_000_000
    const gen = createUlid({ now: () => t, random: b => b.fill(0) })
    const a = gen()
    const b = gen()
    t -= 5
    const c = gen()
    expect(a < b && b < c).toBe(true)
    expect(ulidTime(c)).toBe(1_700_000_000_000)
  })

  it('overflows loudly rather than repeating', () => {
    const gen = createUlid({ now: () => 1, random: b => b.fill(31) })
    gen()
    expect(() => gen()).toThrow(/overflow/)
  })

  it('produces valid ULIDs from the platform generator', () => {
    const ids = Array.from({ length: 50 }, () => ulid())
    for (const id of ids) expect(Ulid.safeParse(id).success).toBe(true)
    expect(new Set(ids).size).toBe(50)
    expect([...ids].sort()).toEqual(ids)
  })

  it('rejects an out-of-range clock', () => {
    expect(() => createUlid({ now: () => -1 })()).toThrow(RangeError)
    expect(() => createUlid({ now: () => 2 ** 48 })()).toThrow(RangeError)
  })
})
