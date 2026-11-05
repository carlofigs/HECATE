/**
 * webhook.ts — is this push notification really from GitHub?
 *
 * GitHub signs each delivery's raw body with the webhook secret
 * (`X-Hub-Signature-256: sha256=<hex>`). Verification uses WebCrypto's HMAC
 * verify, which compares in constant time.
 */

export async function verifyWebhookSignature(secret: string, body: string | Uint8Array<ArrayBuffer>, header: string | null): Promise<boolean> {
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header ?? '')
  if (!m || secret === '') return false
  const hex = m[1] as string
  const signature = new Uint8Array(32)
  for (let i = 0; i < 32; i++) signature[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const data = typeof body === 'string' ? new TextEncoder().encode(body) : body
  return crypto.subtle.verify('HMAC', key, signature, data)
}
