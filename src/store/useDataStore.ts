/**
 * useDataStore — Zustand store for all HECATE data files
 *
 * Architecture:
 * - One slice per JSON file, shaped as FileSlice<T>
 * - All GitHub I/O goes through getFile / putFile in lib/github.ts
 * - Auto-save: components mark dirty; a debounced effect flushes via save()
 * - Optimistic writes: data updates immediately in-store, SHA updated after API round-trip
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { getFile, putFile, loadCredentials } from '@/lib/github'
import type {
  DataFileName,
  FileSlice,
  SliceData,
  TasksData,
  FocusData,
  ProjectsData,
  WeeklyLogData,
  ArchiveData,
  MemoryData,
  SettingsData,
} from '@/lib/schemas'

// Individual data types kept to type the store shape (tasks, focus, etc. slices)

// ─── Store shape ────────────────────────────────────────────────────────────

export interface DataStore {
  tasks:      FileSlice<TasksData>
  focus:      FileSlice<FocusData>
  projects:   FileSlice<ProjectsData>
  weekly_log: FileSlice<WeeklyLogData>
  archive:    FileSlice<ArchiveData>
  memory:     FileSlice<MemoryData>
  settings:   FileSlice<SettingsData>

  // Actions
  loadFile:   (name: DataFileName) => Promise<void>
  saveFile:   (name: DataFileName, message?: string) => Promise<void>
  setData:    <K extends DataFileName>(name: K, updater: (draft: SliceData<K>) => void) => void
  markDirty:  (name: DataFileName) => void
}

// ─── Utility types ──────────────────────────────────────────────────────────

// SliceData<K> and DataFileName are both imported from schemas — single source of truth

// ─── Initial slice factory ──────────────────────────────────────────────────

function emptySlice<T>(): FileSlice<T> {
  return { data: null, sha: null, dirty: false, loading: false, error: null }
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useDataStore = create<DataStore>()(
  immer((set, get) => ({
    tasks:      emptySlice(),
    focus:      emptySlice(),
    projects:   emptySlice(),
    weekly_log: emptySlice(),
    archive:    emptySlice(),
    memory:     emptySlice(),
    settings:   emptySlice(),

    // ── Load ────────────────────────────────────────────────────────────────
    loadFile: async (name) => {
      const creds = loadCredentials()
      if (!creds) return

      set(state => {
        ;(state[name] as FileSlice<unknown>).loading = true
        ;(state[name] as FileSlice<unknown>).error   = null
      })

      try {
        const { data, sha } = await getFile(creds, name)
        set(state => {
          ;(state[name] as FileSlice<unknown>).data    = data
          ;(state[name] as FileSlice<unknown>).sha     = sha
          ;(state[name] as FileSlice<unknown>).dirty   = false
          ;(state[name] as FileSlice<unknown>).loading = false
        })
      } catch (err: unknown) {
        const message = (err as { message?: string })?.message ?? 'Unknown error'
        set(state => {
          ;(state[name] as FileSlice<unknown>).loading = false
          ;(state[name] as FileSlice<unknown>).error   = message
        })
      }
    },

    // ── Save ─────────────────────────────────────────────────────────────────
    saveFile: async (name, message) => {
      const creds = loadCredentials()
      if (!creds) return

      const slice = get()[name] as FileSlice<unknown>
      if (!slice.data) return

      // Snapshot the data reference before the async gap.
      // immer produces a new object on every mutation, so a reference inequality
      // after the await means concurrent edits landed during the in-flight PUT.
      const dataAtStart = slice.data

      set(state => {
        ;(state[name] as FileSlice<unknown>).loading = true
        ;(state[name] as FileSlice<unknown>).error   = null
      })

      try {
        const newSha = await putFile(creds, name, slice.data, slice.sha, message)
        // Re-read current data after the await to detect concurrent mutations
        const dataAfterSave = (get()[name] as FileSlice<unknown>).data
        set(state => {
          const s = state[name] as FileSlice<unknown>
          s.sha     = newSha
          s.loading = false
          // Only clear dirty if no new edits arrived during the request.
          // If data changed, leave dirty=true so the auto-save debounce re-fires.
          if (dataAfterSave === dataAtStart) s.dirty = false
        })
      } catch (err: unknown) {
        const errMessage = (err as { message?: string })?.message ?? 'Unknown error'
        set(state => {
          ;(state[name] as FileSlice<unknown>).loading = false
          ;(state[name] as FileSlice<unknown>).error   = errMessage
        })
        throw err   // re-throw so callers can show toasts
      }
    },

    // ── Immer updater ────────────────────────────────────────────────────────
    setData: (name, updater) => {
      set(state => {
        const slice = state[name] as FileSlice<unknown>
        if (slice.data) {
          updater(slice.data as never)
          slice.dirty = true
        }
      })
    },

    // ── Mark dirty (for deferred auto-save) ─────────────────────────────────
    markDirty: (name) => {
      set(state => {
        ;(state[name] as FileSlice<unknown>).dirty = true
      })
    },
  })),
)

// ─── Selectors (memoised) ───────────────────────────────────────────────────
// Import these in components instead of inline selectors to avoid re-render churn.

export const selectTasks     = (s: DataStore) => s.tasks
export const selectFocus     = (s: DataStore) => s.focus
export const selectProjects  = (s: DataStore) => s.projects
export const selectWeekLog   = (s: DataStore) => s.weekly_log
export const selectArchive   = (s: DataStore) => s.archive
export const selectMemory    = (s: DataStore) => s.memory
export const selectSettings  = (s: DataStore) => s.settings
