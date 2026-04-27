/**
 * SyncStatus — live save-state indicator shown in the AppShell
 *
 * Reads the dirty/loading/error flags across all data store slices.
 * Collapses to a single "worst-case" status for display.
 *
 * States (priority order):
 *   error   → any slice has an error
 *   saving  → any slice is loading (i.e. a save is in-flight)
 *   dirty   → any slice is dirty but not yet saving
 *   saved   → all clean, at least one file has been loaded
 *   idle    → nothing loaded yet (initial state)
 */

import { useDataStore } from '@/store/useDataStore'
import { useShallow } from 'zustand/react/shallow'
import { cn } from '@/lib/utils'
import { Loader2, CheckCircle2, AlertCircle, Cloud } from 'lucide-react'

type SyncState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

const FILE_NAMES = ['tasks', 'focus', 'projects', 'weekly_log', 'archive', 'memory', 'settings'] as const

export function SyncStatus({ compact = false }: { compact?: boolean }) {
  // Shallow selector over derived booleans — component only re-renders when
  // one of these four values changes, not on every store write.
  const { hasError, isSaving, isDirty, hasLoaded } = useDataStore(
    useShallow(s => ({
      hasError:  FILE_NAMES.some(n => s[n].error !== null),
      isSaving:  FILE_NAMES.some(n => s[n].loading),
      isDirty:   FILE_NAMES.some(n => s[n].dirty),
      hasLoaded: FILE_NAMES.some(n => s[n].data !== null),
    }))
  )

  const state: SyncState =
    hasError  ? 'error'  :
    isSaving  ? 'saving' :
    isDirty   ? 'dirty'  :
    hasLoaded ? 'saved'  :
    'idle'

  const config = {
    idle:   { label: 'No data',  Icon: Cloud,         cls: 'text-muted-foreground' },
    dirty:  { label: 'Unsaved',  Icon: Cloud,         cls: 'text-yellow-400'       },
    saving: { label: 'Saving…',  Icon: Loader2,       cls: 'text-primary'              },
    saved:  { label: 'Saved',    Icon: CheckCircle2,  cls: 'text-emerald-400'      },
    error:  { label: 'Error',    Icon: AlertCircle,   cls: 'text-destructive'      },
  }[state]

  if (compact) {
    return (
      <config.Icon
        className={cn('w-3.5 h-3.5 shrink-0', config.cls)}
        aria-label={config.label}
      />
    )
  }

  return (
    <span className={cn('flex items-center gap-1.5 text-xs', config.cls)}>
      <config.Icon className={cn('w-3.5 h-3.5 shrink-0', state === 'saving' && 'animate-spin')} />
      {config.label}
    </span>
  )
}
