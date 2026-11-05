import { describe, expect, it } from 'vitest'
import { verifyWebhookSignature } from './webhook.ts'

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))
  return `sha256=${Array.from(mac, b => b.toString(16).padStart(2, '0')).join('')}`
}

describe('verifyWebhookSignature', () => {
  const body = JSON.stringify({ ref: 'refs/heads/v2', after: 'abc' })

  it('accepts a delivery signed with the secret', async () => {
    expect(await verifyWebhookSignature('s3cret', body, await sign('s3cret', body))).toBe(true)
    expect(await verifyWebhookSignature('s3cret', new TextEncoder().encode(body), await sign('s3cret', body))).toBe(true)
  })

  it('rejects a tampered body, another secret, a malformed or missing header', async () => {
    const header = await sign('s3cret', body)
    expect(await verifyWebhookSignature('s3cret', `${body} `, header)).toBe(false)
    expect(await verifyWebhookSignature('other', body, header)).toBe(false)
    expect(await verifyWebhookSignature('s3cret', body, header.replace('sha256=', 'sha1='))).toBe(false)
    expect(await verifyWebhookSignature('s3cret', body, 'sha256=zz')).toBe(false)
    expect(await verifyWebhookSignature('s3cret', body, null)).toBe(false)
    expect(await verifyWebhookSignature('', body, `sha256=${'0'.repeat(64)}`)).toBe(false)
  })
})
