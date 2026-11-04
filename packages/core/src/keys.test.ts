import { describe, expect, it } from 'vitest'
import { allocateKey, allocateKeys, formatKey, parseKey } from './keys.ts'

describe('task keys', () => {
  it('parses A and B keys only', () => {
    expect(parseKey('A12')).toEqual({ prefix: 'A', n: 12 })
    expect(parseKey('B3')).toEqual({ prefix: 'B', n: 3 })
    for (const bad of ['A0', 'A012', 'C1', 'a1', 'A', 'T-001', 't-shirt', 'A1 ']) expect(parseKey(bad)).toBeNull()
  })

  it('formats and refuses bad numbers', () => {
    expect(formatKey('A', 7)).toBe('A7')
    expect(() => formatKey('A', 0)).toThrow(RangeError)
    expect(() => formatKey('B', 1.5)).toThrow(RangeError)
  })

  it('allocates purely: returns new counters and leaves the input alone', () => {
    const file = { nextKey: { A: 4, B: 2 } }
    const first = allocateKey(file, 'A')
    expect(first).toEqual({ key: 'A4', nextKey: { A: 5, B: 2 } })
    expect(file.nextKey).toEqual({ A: 4, B: 2 })
    expect(allocateKey({ nextKey: first.nextKey }, 'B')).toEqual({ key: 'B2', nextKey: { A: 5, B: 3 } })
  })

  it('allocates a batch for placeholder resolution', () => {
    expect(allocateKeys({ nextKey: { A: 10, B: 1 } }, 'A', 3)).toEqual({ keys: ['A10', 'A11', 'A12'], nextKey: { A: 13, B: 1 } })
    expect(allocateKeys({ nextKey: { A: 10, B: 1 } }, 'B', 0)).toEqual({ keys: [], nextKey: { A: 10, B: 1 } })
    expect(() => allocateKeys({ nextKey: { A: 1, B: 1 } }, 'A', -1)).toThrow(RangeError)
  })
})
