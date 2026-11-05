/**
 * app-auth.ts — authenticating as the HECATE GitHub App (ADR 0003).
 *
 * The App's private key (a Worker secret) signs a short JWT; the JWT buys an
 * installation token scoped to the one data repository with contents: write.
 * Tokens last an hour; one is reused until five minutes before it expires,
 * and callers that ask at the same moment share one request.
 *
 * GitHub hands out private keys as PKCS#1 ("BEGIN RSA PRIVATE KEY"), which
 * WebCrypto cannot import, so that form is wrapped into PKCS#8 here.
 */

import { base64ToBytes, bytesToBase64Url } from './base64.ts'
import { GITHUB_API, createClient, defaultSleep, type Fetch } from './http.ts'

export interface AppAuthOptions {
  appId: string | number
  /** PEM, PKCS#1 or PKCS#8. */
  privateKey: string
  owner: string
  repo: string
  /** Looked up from the repository when not given. */
  installationId?: number
  fetch?: Fetch
  baseUrl?: string
  userAgent?: string
  /** Milliseconds since the epoch. */
  now?: () => number
}

const REFRESH_MARGIN_MS = 5 * 60_000

/** DER length octets. */
function derLength(n: number): number[] {
  if (n < 0x80) return [n]
  const bytes: number[] = []
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v % 256)
  return [0x80 | bytes.length, ...bytes]
}

/** PrivateKeyInfo { version 0, rsaEncryption, OCTET STRING { RSAPrivateKey } }. */
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  const version = [0x02, 0x01, 0x00]
  const rsaEncryption = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]
  const key = [0x04, ...derLength(pkcs1.length), ...pkcs1]
  const body = [...version, ...rsaEncryption, ...key]
  return Uint8Array.from([0x30, ...derLength(body.length), ...body])
}

/** Import a PEM RSA private key for RS256 signing. */
export async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const m = /-----BEGIN (RSA )?PRIVATE KEY-----([\s\S]+?)-----END \1?PRIVATE KEY-----/.exec(pem)
  if (!m) throw new Error('The App private key must be a PEM "PRIVATE KEY" or "RSA PRIVATE KEY"')
  const der = base64ToBytes(m[2] as string)
  const pkcs8 = m[1] ? pkcs1ToPkcs8(der) : der
  return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
}

/** A JWT GitHub accepts as the App: issued a minute ago (clock skew), valid for nine minutes. */
export async function createAppJwt(appId: string | number, key: CryptoKey, nowMs: number): Promise<string> {
  const now = Math.floor(nowMs / 1000)
  const encode = (value: unknown): string => bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)))
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: now - 60, exp: now + 9 * 60, iss: String(appId) })}`
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  return `${unsigned}.${bytesToBase64Url(new Uint8Array(signature))}`
}

/** A function returning a valid installation token for the repository, minting one only when needed. */
export function appTokenProvider(options: AppAuthOptions): () => Promise<string> {
  const now = options.now ?? Date.now
  const client = createClient({
    fetch: options.fetch ?? ((input, init) => fetch(input, init)),
    baseUrl: options.baseUrl ?? GITHUB_API,
    userAgent: options.userAgent ?? 'hecate',
    authorization: () => Promise.reject(new Error('App requests carry their own JWT')),
    sleep: defaultSleep,
    maxAttempts: 3,
  })
  let key: Promise<CryptoKey> | null = null
  let installationId = options.installationId ?? null
  let cached: { token: string; expiresAt: number } | null = null
  let inFlight: Promise<string> | null = null

  const mint = async (): Promise<string> => {
    key ??= importPrivateKey(options.privateKey)
    const authorization = `Bearer ${await createAppJwt(options.appId, await key, now())}`
    if (installationId === null) {
      const { data } = await client.request<{ id: number }>('GET', `/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/installation`, { authorization })
      installationId = data.id
    }
    const { data } = await client.request<{ token: string; expires_at: string }>('POST', `/app/installations/${installationId}/access_tokens`, {
      authorization,
      body: { repositories: [options.repo], permissions: { contents: 'write' } },
    })
    cached = { token: data.token, expiresAt: Date.parse(data.expires_at) }
    return data.token
  }

  return async () => {
    if (cached && now() < cached.expiresAt - REFRESH_MARGIN_MS) return cached.token
    inFlight ??= mint().finally(() => {
      inFlight = null
    })
    return inFlight
  }
}
