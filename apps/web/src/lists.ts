/**
 * Lists of items with ids, changed the way whole-list ops need: an item
 * replaced in place, removed, or moved one step, every other item untouched.
 */

type Identified = { id: string }
type Group<T> = (a: T, b: T) => boolean

/** The list with `item` in place of the one with its id, or added at the end. */
export function upsert<T extends Identified>(list: readonly T[], item: T): T[] {
  return list.some(x => x.id === item.id) ? list.map(x => (x.id === item.id ? item : x)) : [...list, item]
}

export const without = <T extends Identified>(list: readonly T[], id: string): T[] => list.filter(x => x.id !== id)

const anyGroup = (): boolean => true

/** Where an item moves to: the next item up or down that `same` groups with it (a priority moves within its tier). */
function target<T extends Identified>(list: readonly T[], id: string, delta: -1 | 1, same: Group<T>): number {
  const from = list.findIndex(x => x.id === id)
  const item = list[from]
  if (!item) return -1
  for (let i = from + delta; i >= 0 && i < list.length; i += delta) {
    if (same(item, list[i] as T)) return i
  }
  return -1
}

export const canMoveIn = <T extends Identified>(list: readonly T[], id: string, delta: -1 | 1, same: Group<T> = anyGroup): boolean =>
  target(list, id, delta, same) >= 0

/** The list with the item swapped one step up or down (within its group); unchanged at an end. */
export function moved<T extends Identified>(list: readonly T[], id: string, delta: -1 | 1, same: Group<T> = anyGroup): T[] {
  const to = target(list, id, delta, same)
  const from = list.findIndex(x => x.id === id)
  if (to < 0) return [...list]
  const next = [...list]
  ;[next[from], next[to]] = [next[to] as T, next[from] as T]
  return next
}
