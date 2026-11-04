/**
 * saveNotices — user-facing messages for save outcomes
 *
 * Shared by every save path (autosave, Cmd+S, workspace switch, Close Sprint)
 * so a conflict reads the same wherever it surfaces. Toast ids are per file:
 * several components can autosave the same file, and sonner replaces a toast
 * with the same id instead of stacking duplicates.
 */

import { toast } from 'sonner'
import type { DataFileName } from './schemas'

const FILE_LABELS: Record<DataFileName, string> = {
  tasks:      'Tasks',
  focus:      'Focus',
  projects:   'Projects',
  weekly_log: 'Week log',
  archive:    'Archive',
  memory:     'Memory',
  settings:   'Settings',
}

export function fileLabel(name: DataFileName): string {
  return FILE_LABELS[name]
}

/** The remote copy was adopted after a 409; the local edit was not written. */
export function notifyConflict(name: DataFileName): void {
  toast.warning(`${fileLabel(name)} changed elsewhere`, {
    id:          `save-conflict-${name}`,
    description: 'Claude, the calendar sync or another tab updated it first. ' +
                 'The latest version is loaded; your last edit was not saved.',
    duration:    10_000,
  })
}

export function notifySaveFailed(name: DataFileName, retry: () => void): void {
  toast.error(`Failed to save ${fileLabel(name)} — retrying`, {
    id:     `save-failed-${name}`,
    action: { label: 'Retry now', onClick: retry },
  })
}
