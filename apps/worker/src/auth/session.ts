/**
 * session.ts — signed, stateless tokens for the web session and the sign-in
 * round trip, and the cookies that carry them.
 *
 * A token is `base64url(json).base64url(hmac)`, keyed by a label derived from
 * AUTH_SECRET, so one secret serves several purposes without one token being
 * accepted as another. Rotating AUTH_SECRET signs everyone out.
 */

export const SESSION_COOKIE = '__Host-hecate-session'
export const LOGIN_COOKIE = '__Host-hecate-login'
export const SESSION_SECONDS = 14 * 24 * 60 * 60

export interface Session {
  /** GitHub user id. */
  sub: string
  login: string
  /** Expiry, seconds since the epoch. */
  exp: number
}

const encoder = new TextEncoder()

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

async function hmacKey(secret: string, label: string): Promise<CryptoKey> {
  const root = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const derived = await crypto.subtle.sign('HMAC', root, encoder.encode(`hecate:${label}`))
  return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

/** A secret for another purpose, derived from AUTH_SECRET (hex, 64 characters). */
export async function derivedSecret(secret: string, label: string): Promise<string> {
  const root = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', root, encoder.encode(`hecate:${label}`)))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export async function signToken(payload: object, secret: string, label: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)))
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret, label), encoder.encode(body)))
  return `${body}.${toBase64Url(mac)}`
}

/** The payload of a token signed for `label`, or null if it is forged, malformed or expired. */
export async function verifyToken<T extends { exp: number }>(token: string | null, secret: string, label: string, nowMs: number): Promise<T | null> {
  if (!token) return null
  const [body, mac, extra] = token.split('.')
  if (!body || !mac || extra !== undefined) return null
  const signature = fromBase64Url(mac)
  const json = fromBase64Url(body)
  if (!signature || !json) return null
  if (!(await crypto.subtle.verify('HMAC', await hmacKey(secret, label), signature, encoder.encode(body)))) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(json)) as T
    return typeof payload.exp === 'number' && payload.exp * 1000 > nowMs ? payload : null
  } catch {
    return null
  }
}

export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return null
}

/** A `__Host-` cookie: Secure, Path=/, no Domain. Max-Age 0 clears it. */
export function cookie(name: string, value: string, options: { maxAge: number; sameSite: 'Strict' | 'Lax' }): string {
  return `${name}=${value}; Path=/; Max-Age=${options.maxAge}; HttpOnly; Secure; SameSite=${options.sameSite}`
}
