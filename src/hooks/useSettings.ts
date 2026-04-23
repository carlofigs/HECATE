/**
 * useSettings — loads settings.json from GitHub and syncs preferences to the DOM
 *
 * Call once at the AppShell level. Subsequent calls share the same Zustand slice.
 *
 * Responsibilities:
 * - Load settings.json on mount
 * - Apply theme (dark/light) to document.documentElement whenever it changes
 * - Expose typed settings data + a typed update helper
 *
 * Fallback: if settings.json doesn't exist yet (404), uses sensible defaults
 * and does NOT error — the file will be created on first save.
 */

import { useEffect } from 'react'
import { useDataStore } from '@/store/useDataStore'
import { loadCredentials } from '@/lib/github'
import type { SettingsData } from '@/lib/schemas'

export const DEFAULT_SETTINGS: SettingsData = {
  oneOnOnePeople:     [],
  defaultView:        'board',
  autoSaveDebounceMs: 2000,
  pollIntervalMs:     0,
  theme:              'dark',
}

export function useSettings() {
  const slice    = useDataStore(s => s.settings)
  const loadFile = useDataStore(s => s.loadFile)
  const setData  = useDataStore(s => s.setData)
  const saveFile = useDataStore(s => s.saveFile)

  // ── Load on mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (slice.data !== null || slice.loading) return
    const creds = loadCredentials()
    if (!creds) return
    loadFile('settings')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply theme to DOM whenever settings change ───────────────────────────
  useEffect(() => {
    const theme = slice.data?.theme ?? DEFAULT_SETTINGS.theme
    if (theme === 'light') {
      document.documentElement.classList.remove('dark')
    } else {
      document.documentElement.classList.add('dark')
    }
  }, [slice.data?.theme])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const settings: SettingsData = slice.data ?? DEFAULT_SETTINGS

  function updateSettings(updater: (draft: SettingsData) => void) {
    if (slice.data) {
      setData('settings', updater)
    } else {
      // First write — initialise with defaults then apply mutation
      const draft = { ...DEFAULT_SETTINGS }
      updater(draft)
      useDataStore.setState(state => {
        state.settings.data  = draft
        state.settings.dirty = true
      })
    }
  }

  async function saveSettings() {
    await saveFile('settings', 'chore: update settings.json')
  }

  return { settings, loading: slice.loading, updateSettings, saveSettings }
}
