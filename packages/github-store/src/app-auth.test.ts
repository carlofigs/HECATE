import { describe, expect, it } from 'vitest'
import { appTokenProvider, createAppJwt, importPrivateKey } from './app-auth.ts'
import { base64ToBytes, bytesToBase64 } from './base64.ts'
import { createGitStore } from './store.ts'
import { createFakeGitHub, generateAppKey } from './testing/fake-github.ts'

const T0 = Date.parse('2026-11-05T00:00:00.000Z')

/** The RSAPrivateKey inside a PKCS#8 PrivateKeyInfo, as GitHub's downloaded .pem holds it. */
function pkcs1PemFrom(pkcs8: Uint8Array): string {
  let i = 0
  const readHeader = (): { tag: number; length: number } => {
    const tag = pkcs8[i++] as number
    let length = pkcs8[i++] as number
    if (length & 0x80) {
      const n = length & 0x7f
      length = 0
      for (let k = 0; k < n; k++) length = length * 256 + (pkcs8[i++] as number)
    }
    return { tag, length }
  }
  const skip = (): void => {
    const { length } = readHeader()
    i += length
  }
  readHeader() // PrivateKeyInfo SEQUENCE: step inside it
  skip() // version
  skip() // AlgorithmIdentifier
  const key = readHeader()
  if (key.tag !== 0x04) throw new Error('expected the OCTET STRING')
  const der = pkcs8.subarray(i, i + key.length)
  return `-----BEGIN RSA PRIVATE KEY-----\n${bytesToBase64(der).replace(/.{64}/g, '$&\n')}\n-----END RSA PRIVATE KEY-----\n`
}

async function setup() {
  const key = await generateAppKey()
  let now = T0
  const fake = createFakeGitHub({ tokens: [], app: { appId: 123, installationId: 4567, publicKey: key.publicKey }, now: () => now })
  await fake.seed({ 'work/workspace.json': '{}\n' })
  const clock = { advance: (ms: number) => { now += ms }, now: () => now }
  return { key, fake, clock }
}

describe('App JWT', () => {
  it('is signed with the App key and carries the claims GitHub requires', async () => {
    const { key } = await setup()
    const jwt = await createAppJwt(123, await importPrivateKey(key.privateKeyPem), T0)
    const [header, payload, signature] = jwt.split('.') as [string, string, string]
    const fromUrl = (s: string) => base64ToBytes(s.replace(/-/g, '+').replace(/_/g, '/'))
    expect(JSON.parse(new TextDecoder().decode(fromUrl(header)))).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(JSON.parse(new TextDecoder().decode(fromUrl(payload)))).toEqual({ iat: T0 / 1000 - 60, exp: T0 / 1000 + 540, iss: '123' })
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key.publicKey, fromUrl(signature), new TextEncoder().encode(`${header}.${payload}`))).toBe(true)
  })

  it('accepts the PKCS#1 key GitHub downloads, and rejects anything else', async () => {
    const { key } = await setup()
    const pkcs1 = pkcs1PemFrom(key.pkcs8)
    const jwt = await createAppJwt(123, await importPrivateKey(pkcs1), T0)
    const [header, payload, signature] = jwt.split('.') as [string, string, string]
    const sig = base64ToBytes(signature.replace(/-/g, '+').replace(/_/g, '/'))
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key.publicKey, sig, new TextEncoder().encode(`${header}.${payload}`))).toBe(true)
    await expect(importPrivateKey('not a key')).rejects.toThrow('PEM')
  })
})

describe('installation tokens', () => {
  it('finds the installation, mints a token scoped to the repo, and the store can use it', async () => {
    const { key, fake, clock } = await setup()
    const token = appTokenProvider({ appId: 123, privateKey: key.privateKeyPem, owner: 'owner', repo: 'data', fetch: fake.fetch, now: clock.now })
    const store = createGitStore({ owner: 'owner', repo: 'data', branch: 'main', token, fetch: fake.fetch })
    expect(await store.readHead()).toMatchObject({ commit: fake.head() })
    expect(fake.requests.slice(0, 2)).toEqual(['GET /repos/owner/data/installation', 'POST /app/installations/4567/access_tokens'])
  })

  it('reuses a token until five minutes before it expires', async () => {
    const { key, fake, clock } = await setup()
    const token = appTokenProvider({ appId: 123, privateKey: key.privateKeyPem, owner: 'owner', repo: 'data', installationId: 4567, fetch: fake.fetch, now: clock.now })
    expect(await token()).toBe('ghs_fake_1')
    clock.advance(54 * 60_000)
    expect(await token()).toBe('ghs_fake_1')
    clock.advance(2 * 60_000)
    expect(await token()).toBe('ghs_fake_2')
    expect(fake.requests.filter(r => r.endsWith('/installation'))).toEqual([])
  })

  it('shares one request between callers asking at the same moment', async () => {
    const { key, fake, clock } = await setup()
    const token = appTokenProvider({ appId: 123, privateKey: key.privateKeyPem, owner: 'owner', repo: 'data', fetch: fake.fetch, now: clock.now })
    expect(await Promise.all([token(), token(), token()])).toEqual(['ghs_fake_1', 'ghs_fake_1', 'ghs_fake_1'])
    expect(fake.tokensIssued).toBe(1)
  })

  it('fails with GitHub\'s answer when the key is not the App\'s, and can try again', async () => {
    const { fake, clock } = await setup()
    const other = await generateAppKey()
    const token = appTokenProvider({ appId: 123, privateKey: other.privateKeyPem, owner: 'owner', repo: 'data', fetch: fake.fetch, now: clock.now })
    await expect(token()).rejects.toMatchObject({ status: 401 })
    await expect(token()).rejects.toMatchObject({ status: 401 })
  })
})
