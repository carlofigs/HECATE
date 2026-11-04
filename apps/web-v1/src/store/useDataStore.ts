/**
 * useDataStore — Zustand store for all HECATE data files
 *
 * Architecture:
 * - One slice per JSON file, shaped as FileSlice<T>
 * - All GitHub I/O goes through getFile / putFile in lib/github.ts
 * - Auto-save: setData marks dirty and bumps `revision`; useDataFile debounces on it
 * - Saves are serialised per file; a 409 adopts the remote copy (never overwrites it)
 * - Optimistic writes: data updates immediately in-store, SHA updated after API round-trip
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { getFile, putFile, loadCredentials } from '@/lib/github'
import type { GitHubError } from '@/lib/github'
import { validateFile } from '@/lib/validate'
import { migrateFile } from '@/lib/migrate'
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

// ─── Store shape ────────────────────────────────────────────────────────────

/**
 * What a save did.
 * - `saved`    — PUT succeeded.
 * - `conflict` — the remote moved underneath us (Claude via MCP, the calendar
 *                bot, another tab). The remote copy was adopted and the local
 *                edit was NOT written; callers should tell the user.
 * - `skipped`  — nothing to save (no data, or not dirty once a queued save ran).
 */
export type SaveOutcome = 'saved' | 'conflict' | 'skipped'

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
  saveFile:   (name: DataFileName, message?: string) => Promise<SaveOutcome>
  setData:    <K extends DataFileName>(name: K, updater: (draft: SliceData<K>) => void) => void
}

// ─── Initial slice factory ──────────────────────────────────────────────────

function emptySlice<T>(): FileSlice<T> {
  return { data: null, sha: null, dirty: false, loading: false, saving: false, revision: 0, error: null }
}

// ─── Save serialisation ─────────────────────────────────────────────────────
// One save per file at a time. Several components can hold useDataFile for the
// same file (e.g. every TaskIdChip), and each runs its own autosave timer;
// without this they would PUT concurrently with the same SHA and 409 each
// other. A queued save waits for the one in flight, then saves only if the
// file is still dirty.
const inflight = new Map<DataFileName, Promise<SaveOutcome>>()

// ─── Store ──────────────────────────────────────────────────────────────────

export const useDataStore = create<DataStore>()(
  immer((set, get) => {
    function patch(name: DataFileName, fn: (s: FileSlice<unknown>) => void) {
      set(state => { fn(state[name] as FileSlice<unknown>) })
    }

    async function saveOnce(name: DataFileName, message?: string): Promise<SaveOutcome> {
      const creds = loadCredentials()
      if (!creds) return 'skipped'

      const slice = get()[name] as FileSlice<unknown>
      if (!slice.data || !slice.dirty) return 'skipped'

      // Edits made while the PUT is in flight bump `revision`; if it moved, the
      // file stays dirty so autosave writes the newer copy next.
      const revisionAtStart = slice.revision

      patch(name, s => { s.saving = true; s.error = null })

      try {
        const newSha = await putFile(creds, name, slice.data, slice.sha, message)
        patch(name, s => {
          s.sha    = newSha
          s.saving = false
          if (s.revision === revisionAtStart) s.dirty = false
        })
        return 'saved'
      } catch (err: unknown) {
        if ((err as GitHubError)?.status !== 409) {
          const errMessage = (err as { message?: string })?.message ?? 'Unknown error'
          patch(name, s => { s.saving = false; s.error = errMessage })
          throw err
        }

        // 409: our SHA is stale because someone else wrote the file. Re-PUTting
        // the local copy would silently delete their change (a task Claude added
        // over MCP, events from the calendar bot). Instead adopt the remote copy
        // — through the same migrate/validate guard as loadFile, so a file from
        // a newer build is refused rather than misread — and report a conflict.
        // Losing the user's last edit, loudly, beats losing someone else's,
        // silently.
        try {
          const fresh = await getFile<unknown>(creds, name)
          const remote = validateFile(name, migrateFile(name, fresh.data))
          patch(name, s => {
            s.data     = remote
            s.sha      = fresh.sha
            s.dirty    = false
            s.saving   = false
            s.error    = null
            s.revision += 1
          })
          return 'conflict'
        } catch (recoveryErr: unknown) {
          // Could not adopt the remote copy (network, or a newer schema). Keep
          // local data and dirty=true; report the reason.
          const errMessage =
            (recoveryErr as { message?: string })?.message ??
            (err as { message?: string })?.message ??
            'Conflict'
          patch(name, s => { s.saving = false; s.error = `Conflict: ${errMessage}` })
          throw err
        }
      }
    }

    return {
      tasks:      emptySlice(),
      focus:      emptySlice(),
      projects:   emptySlice(),
      weekly_log: emptySlice(),
      archive:    emptySlice(),
      memory:     emptySlice(),
      settings:   emptySlice(),

      // ── Load ──────────────────────────────────────────────────────────────
      loadFile: async (name) => {
        const creds = loadCredentials()
        if (!creds) return

        patch(name, s => { s.loading = true; s.error = null })

        try {
          const { data, sha } = await getFile(creds, name)
          // Migrate before validating: validateFile and everything downstream
          // should only ever see the current shape. Throws on a file written
          // by a newer build rather than misreading and overwriting it.
          const valid = validateFile(name, migrateFile(name, data))
          patch(name, s => {
            s.data    = valid
            s.sha     = sha
            s.dirty   = false
            s.loading = false
          })
        } catch (err: unknown) {
          const message = (err as { message?: string })?.message ?? 'Unknown error'
          patch(name, s => { s.loading = false; s.error = message })
        }
      },

      // ── Save (serialised per file) ────────────────────────────────────────
      saveFile: (name, message) => {
        const prev = inflight.get(name)
        const next = (prev ? prev.catch(() => undefined) : Promise.resolve())
          .then(() => saveOnce(name, message))
        inflight.set(name, next)
        next
          .finally(() => { if (inflight.get(name) === next) inflight.delete(name) })
          .catch(() => { /* surfaced to the caller via `next` */ })
        return next
      },

      // ── Immer updater ─────────────────────────────────────────────────────
      setData: (name, updater) => {
        set(state => {
          const slice = state[name] as FileSlice<unknown>
          if (slice.data) {
            updater(slice.data as never)
            slice.dirty = true
            slice.revision += 1
          }
        })
      },
    }
  }),
)
