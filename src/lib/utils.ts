import type React from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn/ui standard class merging utility */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format an ISO date string as "DD MMM YYYY" */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Format an ISO date string as "DD MMM" */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
  })
}

/** Number of calendar days between a date string and today */
export function daysSince(dateStr: string): number {
  const then = new Date(dateStr)
  const now = new Date()
  then.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24))
}

/** Today as YYYY-MM-DD */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

/** Now as ISO timestamp */
export function nowISO(): string {
  return new Date().toISOString()
}

/** Generate a task ID from a prefix and timestamp */
export function generateTaskId(prefix: 'a' | 'b' | 'custom' = 'custom'): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 5)
  return `t-${prefix}-${ts}${rand}`
}

/** Map column ID to its accent CSS variable token name */
export function columnAccentClass(columnId: string): string {
  const id = columnId.toLowerCase()
  if (id.includes('progress')) return 'col-progress'
  if (id.includes('review'))   return 'col-review'
  if (id.includes('done'))     return 'col-done'
  if (id.includes('block'))    return 'col-blocked'
  if (id.includes('backlog'))  return 'col-backlog'
  return 'col-todo'
}

/** Ordered palette for cycling section/card accent colours */
const ACCENT_PALETTE = [
  'col-progress',
  'col-review',
  'col-done',
  'col-blocked',
  'col-todo',
  'col-backlog',
] as const

/** Pick an accent token by index — wraps around the palette */
export function paletteToken(index: number): string {
  return ACCENT_PALETTE[index % ACCENT_PALETTE.length]
}

/** Inline style for a tinted, bordered accent header */
export function accentHeaderStyle(token: string): React.CSSProperties {
  return {
    backgroundColor: `hsl(var(--${token}) / 0.15)`,
    borderColor:     `hsl(var(--${token}) / 0.35)`,
  }
}

/** Inline style for text coloured to the accent */
export function accentTextStyle(token: string): React.CSSProperties {
  return { color: `hsl(var(--${token}))` }
}

/** Truncate a string to maxLength with ellipsis */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength).trimEnd() + '…'
}
