/**
 * persistence.ts — what the workspace engine needs from Durable Object storage.
 *
 * A small key-value surface, so the engine runs (and is tested) outside the
 * Workers runtime. In the Durable Object it is `ctx.storage` (SQLite-backed);
 * in tests it is a Map. A `write` is atomic: puts and deletes land together
 * or not at all.
 */

export interface Persistence {
  get<T>(key: string): Promise<T | undefined>
  /** Every key with this prefix, without the prefix. */
  list<T>(prefix: string): Promise<Map<string, T>>
  write(puts: Readonly<Record<string, unknown>>, deletes?: readonly string[]): Promise<void>
}

export interface AlarmClock {
  /** Milliseconds since the epoch of the pending alarm, or null. */
  get(): Promise<number | null>
  set(at: number): Promise<void>
}

/** In-memory persistence for tests and local tools. Values are cloned, as DO storage does. */
export function memoryPersistence(): Persistence & { readonly map: Map<string, unknown> } {
  const map = new Map<string, unknown>()
  return {
    map,
    get: <T>(key: string) => Promise.resolve(map.has(key) ? (structuredClone(map.get(key)) as T) : undefined),
    list: <T>(prefix: string) =>
      Promise.resolve(new Map([...map].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), structuredClone(v) as T]))),
    write(puts, deletes = []) {
      for (const [k, v] of Object.entries(puts)) map.set(k, structuredClone(v))
      for (const k of deletes) map.delete(k)
      return Promise.resolve()
    },
  }
}
