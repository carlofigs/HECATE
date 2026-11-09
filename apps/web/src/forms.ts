/**
 * Checks and conversions every form shares: task keys typed as text, and the
 * one-line text core calls a Line. Messages say how to fix the problem (R-27).
 */
import { findTask, type WorkspaceState } from '@hecate/core'

const KEY = /^[AB][1-9]\d*$/
/** The longest Line core accepts. */
const LINE_MAX = 500

/** Task keys from text such as "a1, B3": upper-cased, in order, each once. */
export const keysIn = (text: string): string[] => [...new Set(text.split(/[\s,]+/).map(k => k.trim().toUpperCase()).filter(Boolean))]

/** Trimmed text, or null when there is none. */
export const nullable = (s: string): string | null => (s.trim() === '' ? null : s.trim())

export const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i])

/** What is wrong with keys typed as text, or undefined. */
export function checkKeys(state: WorkspaceState, text: string): string | undefined {
  const keys = keysIn(text)
  const bad = keys.filter(k => !KEY.test(k))
  const missing = keys.filter(k => KEY.test(k) && !findTask(state, k))
  if (bad.length > 0) return `${bad.join(', ')} ${bad.length === 1 ? 'is not a task key' : 'are not task keys'}: use keys such as A12 or B3.`
  if (missing.length > 0) return `There is no ${missing.join(' or ')} in this workspace.`
  return undefined
}

export interface LineRule {
  /** What the field is, in a sentence: "the title". */
  name: string
  /** The message when it is empty; leave out when the field is optional. */
  missing?: string
  /** The message when it runs over more than one line: where the rest should go. */
  oneLine: string
}

/** What is wrong with text that must be one line (core's Line), or undefined. */
export function checkLine(text: string, rule: LineRule): string | undefined {
  const value = text.trim()
  if (!value) return rule.missing
  if (value.length > LINE_MAX) return `Shorten ${rule.name} to ${LINE_MAX} characters or fewer (it has ${value.length}).`
  if (/[\r\n]/.test(value)) return rule.oneLine
  return undefined
}
