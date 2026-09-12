/**
 * focusSections.ts — id generation for focus sections
 *
 * Shared by the Focus page's "Add section" button and the MCP server's
 * add_focus_section verb, so the two mint ids the same way. Previously these
 * lived inline in FocusPage; they moved here when the server needed them.
 */

/** Lowercase, hyphenate, strip anything that is not a-z, 0-9 or a hyphen. */
export function slugify(title: string): string {
  return title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

/**
 * A kebab-case id derived from `title`, suffixed -2, -3, … until it does not
 * collide with anything in `existing`. Falls back to "section" when the title
 * slugifies to nothing (e.g. a title of only punctuation or non-Latin script).
 */
export function uniqueSectionId(title: string, existing: { id: string }[]): string {
  const base = slugify(title) || 'section'
  const ids = new Set(existing.map(s => s.id))
  let id = base, n = 2
  while (ids.has(id)) id = `${base}-${n++}`
  return id
}
