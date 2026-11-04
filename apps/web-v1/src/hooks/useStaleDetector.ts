/**
 * useStaleDetector — polls GitHub for SHA changes on loaded data files
 *
 * When pollIntervalMs > 0, runs a background interval that fetches the SHA
 * of every currently-loaded file and compares it to the in-store SHA.
 * Any mismatch is reported as a stale file name.
 *
 * Usage: call once in AppShell. Returns the list of stale file names.
 *
 * Design decisions:
 * - Only polls files that are currently loaded (sha !== null)
 * - Skips files that are dirty — user has unsaved local edits, don't clobber
 * - Clears stale list after a successful reload (caller responsibility via onReload)
 * - No polling when pollIntervalMs === 0 (off)
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { loadCredentials, getFile } from '@/lib/github'
import { useDataStore } from '@/store/useDataStore'
import { useSettings } from '@/hooks/useSettings'
import type { DataFileName } from '@/lib/schemas'

const POLLABLE_FILES: DataFileName[] = [
  'tasks', 'focus', 'projects', 'weekly_log', 'archive', 'memory',
]

export function useStaleDetector() {
  const { settings }   = useSettings()
  const pollIntervalMs = settings.pollIntervalMs
  const loadFile       = useDataStore(s => s.loadFile)

  const [staleFiles, setStaleFiles] = useState<DataFileName[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const check = useCallback(async () => {
    const creds = loadCredentials()
    if (!creds) return

    const store  = useDataStore.getState()
    const toCheck = POLLABLE_FILES.filter(name => {
      const slice = store[name]
      return slice.sha !== null && !slice.dirty  // loaded and clean
    })

    if (toCheck.length === 0) return

    const results = await Promise.allSettled(
      toCheck.map(async name => {
        const { sha } = await getFile(creds, name)
        return { name, sha }
      }),
    )

    const nowStale: DataFileName[] = []
    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      const { name, sha } = result.value
      const storedSha = useDataStore.getState()[name].sha
      if (sha && storedSha && sha !== storedSha) nowStale.push(name)
    }

    if (nowStale.length > 0) setStaleFiles(prev => {
      const combined = [...new Set([...prev, ...nowStale])]
      return combined.length === prev.length && combined.every((v, i) => v === prev[i])
        ? prev  // no change — avoid re-render
        : combined
    })
  }, [])  // loadFile intentionally omitted — stable Zustand action

  // Reload all stale files and clear the stale list
  const reloadStale = useCallback(async () => {
    await Promise.allSettled(staleFiles.map(name => loadFile(name)))
    setStaleFiles([])
  }, [staleFiles, loadFile])

  const dismiss = useCallback(() => setStaleFiles([]), [])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (pollIntervalMs > 0) {
      timerRef.current = setInterval(check, pollIntervalMs)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [pollIntervalMs, check])

  return { staleFiles, reloadStale, dismiss }
}
