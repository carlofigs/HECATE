/**
 * ids.ts — pure time and identifier helpers
 *
 * Split out of utils.ts so the MCP server can share them without pulling in
 * React, clsx and tailwind-merge, which utils.ts imports for its class helpers.
 * The server must mint task IDs in exactly the app's format, so duplicating
 * these would be a drift risk rather than a convenience.
 *
 * utils.ts re-exports both, so existing app imports keep working unchanged.
 */

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
