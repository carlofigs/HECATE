/**
 * Shared building blocks for the Setup / Settings page: the section wrapper,
 * a labelled numeric <select>, and the stored-credentials reader.
 */

import type { ReactNode } from 'react'
import { CREDENTIALS_STORAGE_KEY } from '@/lib/taskConstants'
import type { GitHubCredentials } from '@/lib/schemas'

export function readStoredCredentials(): GitHubCredentials | null {
  try {
    const raw = localStorage.getItem(CREDENTIALS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function Section({
  title,
  description,
  children,
}: {
  title:        string
  description?: ReactNode
  children:     ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {description && (
          <p className="text-xs text-muted-foreground/70">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

export interface SelectOption { value: number; label: string }

export function SelectSetting({
  value,
  options,
  onChange,
  hint,
}: {
  value:    number
  options:  SelectOption[]
  onChange: (value: number) => void
  hint:     string
}) {
  return (
    <div className="space-y-2">
      <select
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="h-8 rounded-md border border-input bg-transparent px-2.5 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <p className="text-[11px] text-muted-foreground/50">{hint}</p>
    </div>
  )
}
