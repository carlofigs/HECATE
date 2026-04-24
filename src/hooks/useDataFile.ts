/**
 * useDataFile — composable hook for loading + auto-saving a single data file
 *
 * Usage:
 *   const { data, loading, error, setData, save } = useDataFile('tasks')
 *
 * Features:
 * - Loads on mount if data is null (first access)
 * - Exposes setData(updater) for immer-style mutations → marks dirty automatically
 * - Debounced auto-save (default 2s) triggers whenever dirty flag is set
 * - Manual save() available for explicit user actions (bypasses debounce)
 * - Toast notifications on save error
 */

import { useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { useDataStore } from '@/store/useDataStore'
import type {
  TasksData,
  FocusData,
  ProjectsData,
  WeeklyLogData,
  ArchiveData,
  MemoryData,
  SettingsData,
} from '@/lib/schemas'

// ─── Types ──────────────────────────────────────────────────────────────────

type DataFileName =
  | 'tasks'
  | 'focus'
  | 'projects'
  | 'weekly_log'
  | 'archive'
  | 'memory'
  | 'settings'

type SliceData<K extends DataFileName> =
  K extends 'tasks'      ? TasksData      :
  K extends 'focus'      ? FocusData      :
  K extends 'projects'   ? ProjectsData   :
  K extends 'weekly_log' ? WeeklyLogData  :
  K extends 'archive'    ? ArchiveData    :
  K extends 'memory'     ? MemoryData     :
  K extends 'settings'   ? SettingsData   :
  never

export interface UseDataFileResult<T> {
  data:     T | null
  sha:      string | null
  loading:  boolean
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
  const { autoSaveMs = 2000, disableAutoSave = false } = options ?? {}

  const slice    = useDataStore(s => s[name])
  const loadFile = useDataStore(s => s.loadFile)
  const saveFile = useDataStore(s => s.saveFile)
  const setDataFn = useDataStore(s => s.setData)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (slice.data === null && !slice.loading) {
      loadFile(name)
    }
  }, [name]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save on dirty ───────────────────────────────────────────────────
  useEffect(() => {
    if (!slice.dirty || disableAutoSave) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      debounceRef.current = null
      try {
        await saveFile(name)
      } catch {
        toast.error(`Failed to save ${name} — changes may be lost`, {
          action: { label: 'Retry', onClick: () => saveFile(name) },
        })
      }
    }, autoSaveMs)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [slice.dirty, name, autoSaveMs, disableAutoSave]) // eslint-disable-line react-hooks/exhaustive-deps

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
      if (debounceRef.current) clearTimeout(debounceRef.current)
      try {
        await saveFile(name, message)
        toast.success(`${name} saved`)
      } catch {
        toast.error(`Failed to save ${name}`)
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
    error:   slice.error,
    dirty:   slice.dirty,
    setData,
    save,
    reload,
  }
}
