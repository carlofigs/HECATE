import type { Tone } from '@hecate/ui'
import type { Status } from './project.ts'

/** A project's status as a badge: always in words, the tone only adding to them (R-04). */
export const STATUS_TONE: Record<Status, Tone> = { active: 'success', blocked: 'danger', paused: 'warning', planned: 'info', done: 'neutral', dropped: 'neutral' }
