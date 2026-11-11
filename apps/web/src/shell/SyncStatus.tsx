import { CloudCheck, CloudOff, CloudUpload, RefreshCw, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { clockTime } from '../format.ts'
import type { OpenWorkspace } from '../store.ts'

const ICON = 'size-(--size-icon-md) shrink-0'

/** What the sync indicator says, in words with an icon (R-04). design/components/app-shell.md */
function syncState(open: OpenWorkspace | null): { icon: ReactNode; text: string } | null {
  if (!open) return null
  const waiting = open.queue.length
  // Offline: a send failed for lack of network, or (after a reload from the device copy) the first check did.
  const offline = open.sendFailure?.kind === 'network' || (open.status === 'stale' && open.failure?.kind === 'network')
  if (waiting > 0) {
    if (offline) return { icon: <WifiOff aria-hidden="true" className={ICON} />, text: `Offline · ${waiting} ${waiting === 1 ? 'change' : 'changes'} waiting` }
    if (open.sendFailure) return { icon: <CloudOff aria-hidden="true" className={ICON} />, text: "Couldn't save · retrying" }
    return { icon: <RefreshCw aria-hidden="true" className={ICON} />, text: 'Saving…' }
  }
  if (open.status === 'loading' || (open.status === 'refreshing' && !open.snapshot)) return { icon: <RefreshCw aria-hidden="true" className={ICON} />, text: 'Checking…' }
  if (open.status === 'stale' || open.status === 'error') {
    // Offline with a snapshot on show: say how old it is.
    return open.failure?.kind === 'network'
      ? { icon: <WifiOff aria-hidden="true" className={ICON} />, text: open.snapshot && open.fetchedAt ? `Offline · as of ${clockTime(open.fetchedAt)}` : 'Offline' }
      : { icon: <CloudOff aria-hidden="true" className={ICON} />, text: "Couldn't load" }
  }
  const pending = open.snapshot?.pending ?? 0
  if (pending > 0) return { icon: <CloudUpload aria-hidden="true" className={ICON} />, text: `Saving to GitHub (${pending})` }
  return {
    icon: <CloudCheck aria-hidden="true" className={ICON} />,
    // Live, the page is current by definition; otherwise say when it last checked.
    text: open.live !== 'open' && open.fetchedAt ? `Up to date · ${clockTime(open.fetchedAt)}` : 'Up to date',
  }
}

export function SyncStatus({ open }: { open: OpenWorkspace | null }) {
  const state = syncState(open)
  if (!state) return null
  return (
    <p role="status" className="flex items-center gap-inline-xs text-body-sm text-text-secondary">
      {state.icon}
      <span>{state.text}</span>
    </p>
  )
}
