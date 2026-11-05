/**
 * redirects.ts — where an MCP client may send the user after consent.
 *
 * Dynamic registration lets anyone register a client, so the redirect URI is
 * the real gate: https on an allowlisted host (claude.ai, claude.com by
 * default), or a loopback address for clients on the user's own machine
 * (Claude Code, MCP Inspector).
 */

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK.has(hostname) || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
}

export function redirectAllowed(uri: string, hosts: readonly string[]): boolean {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return false
  }
  if (url.username || url.password || url.hash) return false
  if (isLoopbackHost(url.hostname)) return url.protocol === 'http:' || url.protocol === 'https:'
  return url.protocol === 'https:' && hosts.includes(url.hostname.toLowerCase())
}
