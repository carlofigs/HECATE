/**
 * StaleDataBanner — dismissible strip shown when remote file changes are detected
 *
 * Mounts above <main> in AppShell whenever useStaleDetector reports stale files.
 * Reload fetches fresh data for all stale files and clears the banner.
 * Dismiss hides the banner without reloading (stale data remains in store).
 */

import { RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import type { DataFileName } from '@/lib/schemas'

interface Props {
  staleFiles: DataFileName[]
  onReload:   () => Promise<void>
  onDismiss:  () => void
}

export function StaleDataBanner({ staleFiles, onReload, onDismiss }: Props) {
  const [loading, setLoading] = useState(false)

  if (staleFiles.length === 0) return null

  async function handleReload() {
    setLoading(true)
    try {
      await onReload()
    } finally {
      setLoading(false)
    }
  }

  const fileList = staleFiles.join(', ')

  return (
    <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs">
      <span className="flex-1 min-w-0 text-amber-600 dark:text-amber-400 truncate">
        Remote changes detected
        <span className="text-amber-500/60 ml-1.5 font-mono">({fileList})</span>
      </span>
      <button
        onClick={handleReload}
        disabled={loading}
        className="flex items-center gap-1 px-2 py-1 rounded border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50 shrink-0"
      >
        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        Reload
      </button>
      <button
        onClick={onDismiss}
        className="p-0.5 rounded text-amber-500/60 hover:text-amber-600 dark:hover:text-amber-400 transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
