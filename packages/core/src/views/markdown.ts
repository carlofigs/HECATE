/**
 * markdown.ts — small, safe building blocks for the renderers.
 */

/** Text for a table cell: pipes escaped, line breaks folded, never empty. */
export function cell(text: string | null | undefined): string {
  const value = (text ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim()
  return value === '' ? '—' : value
}

/** ` (A1, B2)` after an item, or nothing when there are no keys. */
export function keysSuffix(keys: readonly string[]): string {
  return keys.length > 0 ? ` (${keys.join(', ')})` : ''
}

/** `**lead** — rest`, or just whichever part exists. Markdown in `rest` is kept. */
export function leadAndRest(lead: string | null, rest: string | null): string {
  const parts = [lead ? `**${lead}**` : null, rest ? rest.trim() : null].filter((p): p is string => p !== null && p !== '')
  return parts.join(' — ')
}

/** Indent continuation lines so multi-line markdown stays inside its list item. */
export function indentContinuation(text: string, indent = '  '): string {
  return text.replace(/\n/g, `\n${indent}`)
}

/** A blockquote, every line prefixed. */
export function quote(text: string): string {
  return text.split('\n').map(line => (line.trim() === '' ? '>' : `> ${line}`)).join('\n')
}

/** `10:00–10:30`, `10:00`, or `All day`. */
export function timeRange(start: string | null, end: string | null): string {
  if (start === null) return 'All day'
  return end === null ? start : `${start}–${end}`
}
