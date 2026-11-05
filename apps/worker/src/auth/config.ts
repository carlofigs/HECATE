/**
 * config.ts — the settings sign-in needs, read once from the environment.
 *
 * Missing settings make the Worker answer 503 naming them (never their
 * values), rather than running half-configured.
 */

/** The environment variables sign-in reads (the Worker's Env has them all). */
export interface AuthEnv {
  PUBLIC_URL?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  ALLOWED_GITHUB_USER_ID?: string
  AUTH_SECRET?: string
  GITHUB_WEBHOOK_SECRET?: string
  MCP_REDIRECT_HOSTS?: string
}

export interface AuthSettings {
  /** The Worker's own origin, e.g. https://hecate.example.workers.dev. */
  origin: string
  clientId: string
  clientSecret: string
  /** The one GitHub user id allowed in. */
  allowedUserId: string
  authSecret: string
  webhookSecret: string | null
  /** Hosts an MCP client may redirect to (besides loopback). */
  redirectHosts: string[]
}

const DEFAULT_REDIRECT_HOSTS = ['claude.ai', 'claude.com']
const MIN_SECRET = 32

export function authSettings(env: AuthEnv): AuthSettings | { missing: string[] } {
  const missing: string[] = []
  let origin = ''
  try {
    const url = new URL(env.PUBLIC_URL ?? '')
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.protocol === 'https:' || (loopback && url.protocol === 'http:')) origin = url.origin
    else missing.push('PUBLIC_URL (https)')
  } catch {
    missing.push('PUBLIC_URL')
  }
  if (!env.GITHUB_CLIENT_ID) missing.push('GITHUB_CLIENT_ID')
  if (!env.GITHUB_CLIENT_SECRET) missing.push('GITHUB_CLIENT_SECRET')
  if (!env.ALLOWED_GITHUB_USER_ID || !/^\d+$/.test(env.ALLOWED_GITHUB_USER_ID)) missing.push('ALLOWED_GITHUB_USER_ID (numeric)')
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < MIN_SECRET) missing.push(`AUTH_SECRET (${MIN_SECRET}+ characters)`)
  if (missing.length > 0) return { missing }
  const hosts = (env.MCP_REDIRECT_HOSTS ?? '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean)
  return {
    origin,
    clientId: env.GITHUB_CLIENT_ID as string,
    clientSecret: env.GITHUB_CLIENT_SECRET as string,
    allowedUserId: env.ALLOWED_GITHUB_USER_ID as string,
    authSecret: env.AUTH_SECRET as string,
    webhookSecret: env.GITHUB_WEBHOOK_SECRET || null,
    redirectHosts: hosts.length > 0 ? hosts : DEFAULT_REDIRECT_HOSTS,
  }
}
