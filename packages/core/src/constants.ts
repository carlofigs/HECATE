/**
 * constants.ts — fixed vocabulary shared by every surface (app, MCP, skills).
 */

/**
 * Task key series. Every workspace numbers its own tasks A1, A2… and the things
 * it is waiting on B1, B2… (ADR 0007). Fixed, not configurable, so skills, chips
 * and search can rely on it.
 */
export const KEY_SERIES = {
  A: { kind: 'action', label: 'Mine' },
  B: { kind: 'waiting', label: 'Waiting on' },
} as const

export type KeyPrefix = keyof typeof KEY_SERIES
export const KEY_PREFIXES = Object.keys(KEY_SERIES) as KeyPrefix[]

/** How each enum renders in the markdown the skills read and write. */
export const URGENCY_EMOJI = { high: '🔴', med: '🟡', low: '🟢' } as const
export const PRIORITY_TIER_EMOJI = { focus: '🎯', next: '🟡', ongoing: '🟢' } as const
export const OUTCOME_EMOJI = { done: '✅', carried: '🔄', dropped: '❌' } as const

/** What a personal calendar row shows instead of its title (ADR 0006). */
export const PERSONAL_BLOCKED = '[Personal — blocked]'
