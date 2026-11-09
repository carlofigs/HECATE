/**
 * Connecting to HECATE end to end, in workerd: an MCP client registering,
 * the consent page, GitHub sign-in, the token and the MCP tools; the web app's
 * sign-in and /api; and the push webhook. GitHub (git and OAuth) is faked
 * in Node; see runtime.ts.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto'
import type { Miniflare, Response as MiniflareResponse } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import type { FakeGitHub } from '@hecate/github-store/testing'
import { DIR, addTask, seededFake } from './helpers.ts'
import { CookieJar, ORIGIN, WEBHOOK_SECRET, startWorker } from './runtime.ts'

const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback'

let mf: Miniflare
let fake: FakeGitHub

beforeAll(async () => {
  fake = await seededFake()
  mf = await startWorker(fake)
})

afterAll(async () => {
  await mf.dispose()
})

type Init = { method?: string; headers?: Record<string, string>; body?: string }

async function send(path: string, init: Init = {}, jar?: CookieJar) {
  const headers = { ...init.headers, ...(jar ? { cookie: jar.header() } : {}) }
  const response = await mf.dispatchFetch(path.startsWith('http') ? path : `${ORIGIN}${path}`, { ...init, headers, redirect: 'manual' })
  jar?.store(response)
  return response
}

const form = (fields: Record<string, string>) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields).toString(),
})

async function register(redirectUri = CLAUDE_CALLBACK): Promise<MiniflareResponse> {
  return send('/oauth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'Claude', redirect_uris: [redirectUri], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'] }),
  })
}

/** Register, open /authorize and return the consent form's handle. */
async function startAuthorization(jar: CookieJar) {
  const registered = await register()
  expect(registered.status).toBe(201)
  const { client_id: clientId } = (await registered.json()) as { client_id: string }
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const params = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: CLAUDE_CALLBACK, scope: 'hecate', state: 'client-state',
    code_challenge: challenge, code_challenge_method: 'S256', resource: `${ORIGIN}/mcp`,
  })
  const page = await send(`/authorize?${params}`, {}, jar)
  expect(page.status).toBe(200)
  expect(page.headers.get('x-frame-options')).toBe('DENY')
  const html = await page.text()
  expect(html).toContain('Allow Claude to use HECATE?')
  expect(html).toContain('<strong>claude.ai</strong>')
  const handle = /name="handle" value="([^"]+)"/.exec(html)?.[1] ?? ''
  return { clientId, verifier, handle }
}

/** Allow on the consent page, then come back from GitHub with `code`. */
async function approveAndSignIn(jar: CookieJar, handle: string, code: string) {
  const toGitHub = await send('/authorize', form({ handle, decision: 'approve' }), jar)
  expect(toGitHub.status).toBe(302)
  const github = new URL(toGitHub.headers.get('location') ?? '')
  expect(github.origin + github.pathname).toBe('https://github.com/login/oauth/authorize')
  expect(github.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/oauth/github/callback`)
  expect(github.searchParams.get('code_challenge_method')).toBe('S256')
  return send(`/oauth/github/callback?code=${code}&state=${github.searchParams.get('state')}`, {}, jar)
}

describe('discovery', () => {
  it('challenges an anonymous /mcp call and publishes its metadata', async () => {
    const anonymous = await send('/mcp', { method: 'POST', body: '{}' })
    expect(anonymous.status).toBe(401)
    expect(anonymous.headers.get('www-authenticate')).toContain('resource_metadata=')
    const resource = (await (await send('/.well-known/oauth-protected-resource/mcp')).json()) as Record<string, unknown>
    expect(resource).toMatchObject({ resource: `${ORIGIN}/mcp`, authorization_servers: [ORIGIN] })
    const server = (await (await send('/.well-known/oauth-authorization-server')).json()) as Record<string, unknown>
    expect(server).toMatchObject({ issuer: ORIGIN, authorization_endpoint: `${ORIGIN}/authorize`, token_endpoint: `${ORIGIN}/oauth/token`, registration_endpoint: `${ORIGIN}/oauth/register` })
  })
})

describe('connecting an MCP client', () => {
  it('registers, asks for consent, signs in with GitHub, and gets a token that opens /mcp', async () => {
    const jar = new CookieJar()
    const { clientId, verifier, handle } = await startAuthorization(jar)
    const back = await approveAndSignIn(jar, handle, 'good')
    expect(back.status).toBe(302)
    const redirect = new URL(back.headers.get('location') ?? '')
    expect(redirect.origin + redirect.pathname).toBe(CLAUDE_CALLBACK)
    expect(redirect.searchParams.get('state')).toBe('client-state')
    expect(redirect.searchParams.get('iss')).toBe(ORIGIN)

    const tokenResponse = await send('/oauth/token', form({
      grant_type: 'authorization_code', code: redirect.searchParams.get('code') ?? '', redirect_uri: CLAUDE_CALLBACK,
      client_id: clientId, code_verifier: verifier, resource: `${ORIGIN}/mcp`,
    }))
    expect(tokenResponse.status).toBe(200)
    const token = (await tokenResponse.json()) as { access_token: string; refresh_token: string; token_type: string }
    expect(token.token_type.toLowerCase()).toBe('bearer')

    // An MCP client with the token: the real SDK client, talking to the Worker in workerd.
    const client = new Client({ name: 'claude-test', version: '0.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp`), {
      fetch: (url, init) => mf.dispatchFetch(String(url), init as never) as never,
      requestInit: { headers: { authorization: `Bearer ${token.access_token}` } },
    }))
    try {
      expect((await client.listTools()).tools.map(t => t.name)).toContain('apply_ops')
      const briefing = (await client.callTool({ name: 'get_briefing', arguments: {} })) as { content: { text: string }[] }
      expect(briefing.content[0]?.text).toMatch(/^# Work — /)
      const dry = (await client.callTool({ name: 'apply_ops', arguments: { ops: [addTask('Over MCP')], dryRun: true } })) as { content: { text: string }[] }
      expect(dry.content[0]?.text).toMatch(/^\*\*Dry run/)
    } finally {
      await client.close()
    }
    const cookieOnly = await send('/mcp', { method: 'POST', body: '{}' }, jar)
    expect(cookieOnly.status).toBe(401)
  })

  it('remembers consent for the same client, so the next connection goes straight to GitHub', async () => {
    const jar = new CookieJar()
    const { clientId, handle } = await startAuthorization(jar)
    await send('/authorize', form({ handle, decision: 'approve', remember: '1' }), jar)
    const again = new URLSearchParams({
      response_type: 'code', client_id: clientId, redirect_uri: CLAUDE_CALLBACK, scope: 'hecate', state: 's2',
      code_challenge: createHash('sha256').update('v'.repeat(43)).digest('base64url'), code_challenge_method: 'S256',
    })
    const direct = await send(`/authorize?${again}`, {}, jar)
    expect(direct.status).toBe(302)
    expect(direct.headers.get('location')).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/)
  })

  it('sends anyone but the owner back with access_denied, and no code', async () => {
    const jar = new CookieJar()
    const { handle } = await startAuthorization(jar)
    const back = await approveAndSignIn(jar, handle, 'other')
    const redirect = new URL(back.headers.get('location') ?? '')
    expect(redirect.searchParams.get('error')).toBe('access_denied')
    expect(redirect.searchParams.get('code')).toBeNull()
  })

  it('honours Deny, and refuses a consent post without the browser binding', async () => {
    const jar = new CookieJar()
    const { handle } = await startAuthorization(jar)
    const forged = await send('/authorize', form({ handle, decision: 'approve' }))
    expect(forged.status).toBe(400)
    const denied = await send('/authorize', form({ handle, decision: 'deny' }), jar)
    expect(denied.status).toBe(302)
    expect(new URL(denied.headers.get('location') ?? '').searchParams.get('error')).toBe('access_denied')
  })

  it('refuses to register a client that redirects anywhere else', async () => {
    expect((await register('https://evil.example/callback')).status).toBe(400)
    expect((await register('http://localhost:6274/oauth/callback')).status).toBe(201)
  })
})

describe('the web app', () => {
  async function signedIn(code = 'good'): Promise<{ jar: CookieJar; response: MiniflareResponse }> {
    const jar = new CookieJar()
    const start = await send('/auth/login', {}, jar)
    const state = new URL(start.headers.get('location') ?? '').searchParams.get('state')
    const response = await send(`/auth/callback?code=${code}&state=${state}`, {}, jar)
    return { jar, response }
  }

  it('signs in with GitHub and works through /api', async () => {
    const { jar, response } = await signedIn()
    expect(response.status).toBe(200)
    expect(jar.has('__Host-hecate-session')).toBe(true)
    expect(await (await send('/api/me', {}, jar)).json()).toEqual({ userId: '42', login: 'owner' })
    expect(await (await send('/api/workspaces', {}, jar)).json()).toEqual({ workspaces: [{ dir: DIR, hidden: false, name: 'Work', policy: 'open' }], default: null })
    expect((await send('/api/workspaces/club', {}, jar)).status).toBe(404)

    const ops = (origin?: string) => send(`/api/workspaces/${DIR}/ops`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify({ ops: [addTask('From the app')] }),
    }, jar)
    expect((await ops()).status).toBe(403)
    expect((await ops('https://evil.example')).status).toBe(403)
    const applied = await ops(ORIGIN)
    expect(applied.status).toBe(200)
    expect(await applied.json()).toMatchObject({ status: 'applied', keyMap: { $1: 'A3' } })
    const snapshot = (await (await send(`/api/workspaces/${DIR}`, {}, jar)).json()) as { version: number; pending: number }
    expect(snapshot).toMatchObject({ status: 'ok', version: 2 })
    await expect.poll(() => fake.files()[`${DIR}/tasks.json`], { timeout: 10_000 }).toContain('From the app')
    expect(fake.log()[0]).toMatch(/Actor: app/)

    const out = await send('/auth/logout', { method: 'POST', headers: { origin: ORIGIN } }, jar)
    expect(out.status).toBe(204)
    expect((await send('/api/me', {}, jar)).status).toBe(401)
  })

  it('turns away anyone but the owner', async () => {
    const { jar, response } = await signedIn('other')
    expect(response.status).toBe(403)
    expect(jar.has('__Host-hecate-session')).toBe(false)
  })
})

describe('the push webhook', () => {
  const sign = (body: string, secret = WEBHOOK_SECRET) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

  it('refreshes the workspace a push touched, at once', async () => {
    const jar = new CookieJar()
    const start = await send('/auth/login', {}, jar)
    await send(`/auth/callback?code=good&state=${new URL(start.headers.get('location') ?? '').searchParams.get('state')}`, {}, jar)
    const before = (await (await send(`/api/workspaces/${DIR}`, {}, jar)).json()) as { version: number }

    await fake.push({ [`${DIR}/references/notes.md`]: '# Notes\n' })
    const body = JSON.stringify({ ref: `refs/heads/${fake.branch}`, repository: { full_name: `${fake.owner}/${fake.repo}` }, commits: [{ added: [`${DIR}/references/notes.md`], modified: [], removed: [] }] })
    expect((await send('/hooks/github', { method: 'POST', headers: { 'x-github-event': 'push', 'x-hub-signature-256': sign(body, 'wrong') }, body })).status).toBe(401)
    const accepted = await send('/hooks/github', { method: 'POST', headers: { 'x-github-event': 'push', 'x-hub-signature-256': sign(body) }, body })
    expect(accepted.status).toBe(202)
    await expect.poll(async () => ((await (await send(`/api/workspaces/${DIR}`, {}, jar)).json()) as { version: number }).version, { timeout: 5_000 })
      .toBeGreaterThan(before.version)
    const snapshot = (await (await send(`/api/workspaces/${DIR}`, {}, jar)).json()) as { state: { references: Record<string, string> } }
    expect(snapshot.state.references).toEqual({ notes: '# Notes\n' })
  })
})
