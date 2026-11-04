/**
 * autosave — the timer logic behind useDataFile's auto-save, kept free of React
 * so it can be tested with fake timers.
 *
 * One call schedules one debounced save and returns a cancel function, which
 * is exactly the shape a useEffect wants: the hook re-runs (cancelling the old
 * schedule) on every edit, so the save fires `delayMs` after the LAST edit.
 *
 * A failed save is retried here with backoff. That is the fix for the v1
 * stall: the hook used to re-arm only when `dirty` changed, and a failed save
 * leaves `dirty` true, so nothing ever re-armed it.
 */

import type { SaveOutcome } from '@/store/useDataStore'

/** Give up after this many consecutive failures; the next edit starts afresh. */
export const AUTOSAVE_MAX_RETRIES = 5

/** Backoff for the n-th consecutive failure: 2×, 4×, 8×… the debounce, capped at 60 s. */
export function retryDelayMs(failures: number, baseMs: number): number {
  return Math.min(baseMs * 2 ** failures, 60_000)
}

export interface AutosaveOptions {
  save:        () => Promise<SaveOutcome>
  delayMs:     number
  onConflict?: () => void
  /** Called on every failed attempt, with a function that retries immediately. */
  onFailure?:  (retryNow: () => void) => void
  maxRetries?: number
}

export function scheduleAutosave(opts: AutosaveOptions): () => void {
  const { save, delayMs, onConflict, onFailure, maxRetries = AUTOSAVE_MAX_RETRIES } = opts

  let timer: ReturnType<typeof setTimeout> | null = null
  let cancelled = false
  let failures  = 0

  const attempt = async (): Promise<void> => {
    timer = null
    try {
      const outcome = await save()
      if (outcome === 'conflict') onConflict?.()
    } catch {
      if (cancelled) return
      failures += 1
      onFailure?.(() => { void save().catch(() => undefined) })
      if (failures < maxRetries) {
        timer = setTimeout(() => { void attempt() }, retryDelayMs(failures, delayMs))
      }
    }
  }

  timer = setTimeout(() => { void attempt() }, delayMs)

  return () => {
    cancelled = true
    if (timer) clearTimeout(timer)
  }
}
