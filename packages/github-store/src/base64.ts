/**
 * base64.ts — bytes and UTF-8 text to and from base64, with web APIs only.
 *
 * atob and btoa work on "binary strings" (one char per byte), so text goes
 * through TextEncoder / TextDecoder; otherwise any non-ASCII character (🔴,
 * an en dash) is corrupted.
 */

const CHUNK = 0x8000

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(binary)
}

/** Decode base64, ignoring the line breaks GitHub inserts every 60 characters. */
export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** UTF-8 text from base64. Throws on bytes that are not valid UTF-8 rather than guessing. */
export function base64ToText(base64: string): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(base64))
}

export function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text))
}

/** base64url without padding, as JWTs use. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
