/**
 * text.ts — fitting v1 strings into v2's text fields.
 *
 * v2 separates one-line text (titles, names, leads: `Line`) from markdown.
 * v1 did not, so a title can carry a line break or stray spaces. These helpers
 * make the fit and count every change they make.
 */

import { LINE_PATTERN, slugify } from '@hecate/core'
import type { Counter } from './report.ts'

const LINE_MAX = 500

/** A Line field: one line, trimmed, at most 500 characters. Null when empty. */
export function toLine(value: string | null, counter: Counter): string | null {
  if (value === null) return null
  let out = value.replace(/\s+/g, ' ').trim()
  if (out === '') {
    if (value !== '') counter.add('blank-to-null')
    return null
  }
  if (out !== value) counter.add('collapsed')
  if (out.length > LINE_MAX) {
    out = `${out.slice(0, LINE_MAX - 1).trimEnd()}…`
    counter.add('truncated')
  }
  return LINE_PATTERN.test(out) ? out : null
}

/** A nullable markdown field: blank becomes null. */
export function toMarkdown(value: string | null): string | null {
  if (value === null || value.trim() === '') return null
  return value
}

/**
 * The task-reference syntax v1 rendered as a chip (`t-a47`, `t-a12-2`,
 * `t-a-lx3k9r`), from v1's TASK_ID_PATTERN. Bare `A47` was never a reference
 * in v1, and other id styles (`w-05`) were never chips, so they are left as
 * written and still resolve through legacyIds.
 */
const TASK_REF = /\b(t-[a-z][a-z0-9]*(?:-[a-z0-9]+)?)\b/gi

/** Fenced code blocks and inline code, which v1 never turned into chips. */
const CODE = /(```[\s\S]*?```|`[^`\n]*`)/

export interface RefRewrite {
  text: string
  /** Keys the text refers to, in order of first mention. */
  keys: string[]
}

/** Replace each v1 task reference whose id is known with its v2 key. */
export function rewriteRefs(value: string, keyOf: (v1Id: string) => string | null, counter: Counter): RefRewrite {
  const keys: string[] = []
  const parts = value.split(CODE)
  const text = parts
    .map((part, i) => {
      if (i % 2 === 1) return part
      return part.replace(TASK_REF, (match: string) => {
        const key = keyOf(match)
        if (key === null) {
          counter.add('ref-unresolved')
          return match
        }
        counter.add('ref-rewritten')
        if (!keys.includes(key)) keys.push(key)
        return key
      })
    })
    .join('')
  return { text, keys }
}

/** A markdown table cell: pipes escaped, one line. */
export const cell = (value: string | null): string => (value ?? '').replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|')

/** Hands out slugs, adding -2, -3… to repeats and a fallback for empty ones. */
export function slugAllocator(): (value: string, fallback: string) => string {
  const used = new Set<string>()
  return (value, fallback) => {
    const base = slugify(value) || fallback
    let slug = base
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`
    used.add(slug)
    return slug
  }
}
