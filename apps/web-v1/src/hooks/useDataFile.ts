/**
 * useDataFile — composable hook for loading + auto-saving a single data file
 *
 * Usage:
 *   const { data, loading, error, setData, save } = useDataFile('tasks')
 *
 * Features:
 * - Loads on mount if data is null (first access)
 * - Exposes setData(updater) for immer-style mutations → marks dirty automatically
 * - Trailing-debounced auto-save (default 2s after the last edit), with backoff
 *   retries after a failed save
 * - Manual save() available for explicit user actions (bypasses debounce)
 * - Toasts on save error, and on a conflict (remote copy adopted after a 409)
 */

import { useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { useDataStore } from '@/store/useDataStore'
import { fileLabel, notifyConflict, notifySaveFailed } from '@/lib/saveNotices'
import { scheduleAutosave } from '@/lib/autosave'
import type { DataFileName, SliceData } from '@/lib/schemas'

// Read the global auto-save debounce from the settings slice (if loaded).
// Falls back to 2000ms so the hook works correctly before settings.json is fetched.
function useAutoSaveMs(override?: number): number {
  const settingsMs = useDataStore(s => s.settings.data?.autoSaveDebounceMs)
  if (override !== undefined) return override
  return settingsMs ?? 2000
}

// ─── Types ──────────────────────────────────────────────────────────────────

// SliceData<K> and DataFileName imported from schemas — single source of truth

export interface UseDataFileResult<T> {
  data:     T | null
  sha:      string | null
  loading:  boolean
  saving:   boolean
  error:    string | null
  dirty:    boolean
  setData:  (updater: (draft: T) => void) => void
  save:     (message?: string) => Promise<void>
  reload:   () => Promise<void>
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useDataFile<K extends DataFileName>(
  name: K,
  options?: { autoSaveMs?: number; disableAutoSave?: boolean },
): UseDataFileResult<SliceData<K>> {
  const { autoSaveMs: autoSaveMsOverride, disableAutoSave = false } = options ?? {}
  const autoSaveMs = useAutoSaveMs(autoSaveMsOverride)

  const slice    = useDataStore(s => s[name])
  const loadFile = useDataStore(s => s.loadFile)
  const saveFile = useDataStore(s => s.saveFile)
  const setDataFn = useDataStore(s => s.setData)

  // ── Initial load ──────────────────────────────────────────────────────────
  // loadFile is a stable Zustand action (referentially stable across renders); slice
  // is omitted intentionally so we only re-run when the file name changes, not on
  // every slice update.
  useEffect(() => {
    if (slice.data === null && !slice.loading) {
      void loadFile(name)
    }
  }, [name]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save ────────────────────────────────────────────────────────────
  // Keyed on `revision`, which every edit increments, so each edit restarts the
  // timer: a trailing debounce that saves N ms after the LAST edit. Failed
  // saves are retried with backoff inside scheduleAutosave; a new edit cancels
  // any pending retry and starts the debounce afresh.
  useEffect(() => {
    if (!slice.dirty || disableAutoSave) return
    return scheduleAutosave({
      save:       () => saveFile(name),
      delayMs:    autoSaveMs,
      onConflict: () => notifyConflict(name),
      onFailure:  retryNow => notifySaveFailed(name, retryNow),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- saveFile is a stable Zustand action
  }, [slice.revision, slice.dirty, name, autoSaveMs, disableAutoSave])

  // ── setData wrapper ───────────────────────────────────────────────────────
  const setData = useCallback(
    (updater: (draft: SliceData<K>) => void) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setDataFn(name, updater as (draft: any) => void)
    },
    [name, setDataFn],
  )

  // ── Manual save ───────────────────────────────────────────────────────────
  const save = useCallback(
    async (message?: string) => {
      try {
        const outcome = await saveFile(name, message)
        if (outcome === 'conflict') notifyConflict(name)
        else if (outcome === 'saved') toast.success(`${fileLabel(name)} saved`)
      } catch {
        toast.error(`Failed to save ${fileLabel(name)}`)
      }
    },
    [name, saveFile],
  )

  // ── Reload ────────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    await loadFile(name)
  }, [name, loadFile])

  return {
    data:    slice.data as SliceData<K> | null,
    sha:     slice.sha,
    loading: slice.loading,
    saving:  slice.saving,
    error:   slice.error,
    dirty:   slice.dirty,
    setData,
    save,
    reload,
  }
}
