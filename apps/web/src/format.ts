/** Small display helpers. Views themselves come from @hecate/core. */

/** "09:30–10:00", "09:30", or "All day". */
export function timeRange(start: string | null, end: string | null): string {
  if (!start) return 'All day'
  return end ? `${start}–${end}` : start
}

const CLOCK = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

/** A moment as the viewer's clock time, e.g. "10:42". */
export const clockTime = (ms: number): string => CLOCK.format(ms)

export const URGENCY_LABEL = { high: 'High', med: 'Medium', low: 'Low' } as const
export const URGENCY_TONE = { high: 'danger', med: 'warning', low: 'neutral' } as const

/** Urgency as a choice, None first. */
export const URGENCY_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'med', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const
