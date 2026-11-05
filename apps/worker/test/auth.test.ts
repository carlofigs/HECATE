/**
 * Sign-in, sessions, the API and the webhook, in Node with fakes. The OAuth
 * provider flow itself runs in workerd: see auth.e2e.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { createGitStore } from '@hecate/github-store'
import type { FakeGitHub } from '@hecate/github-store/testing'
import { authSettings, type AuthSettings } from '../src/auth/config.ts'
import { authorizeUrl, s256, signInWithCode, type Fetch } from '../src/auth/github-oauth.ts'
import { consentPage } from '../src/auth/pages.ts'
import { redirectAllowed } from '../src/auth/redirects.ts'
import { LOGIN_COOKIE, SESSION_COOKIE, derivedSecret, signToken, verifyToken } from '../src/auth/session.ts'
import type { ApplyOutcome, ApplyRequest, Snapshot } from '../src/engine.ts'
import { handleApi } from '../src/routes/api.ts'
import { githubHook, touchedDirs } from '../src/routes/hooks.ts'
import type { WorkspaceRpc } from '../src/routes/workspace-rpc.ts'
import { callback, login, logout } from '../src/routes/web-auth.ts'
import { WorkspaceList } from '../src/workspaces.ts'
import { seededFake } from './helpers.ts'

const NOW = Date.parse('2026-11-05T00:00:00.000Z')
const SECRET = 'a'.repeat(40)
const SETTINGS = authSettings({
  PUBLIC_URL: 'https://hecate.test', GITHUB_CLIENT_ID: 'Iv1.client', GITHUB_CLIENT_SECRET: 'client-secret',
  ALLOWED_GITHUB_USER_ID: '42', AUTH_SECRET: SECRET, GITHUB_WEBHOOK_SECRET: 'hook-secret',
}) as AuthSettings

/** GitHub's OAuth endpoints: code `good` is user 42, code `other` is user 7. */
const githubOAuth: Fetch = (url, init) => Promise.resolve(githubOAuthResponse(url, init))

function githubOAuthResponse(url: string, init?: RequestInit): Response {
  if (url === 'https://github.com/login/oauth/access_token') {
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, string>
    if (body.client_secret !== 'client-secret' || !body.code_verifier) return Response.json({ error: 'incorrect_client_credentials' })
    if (body.code === 'good') return Response.json({ access_token: 'gho_owner', token_type: 'bearer' })
    if (body.code === 'other') return Response.json({ access_token: 'gho_other', token_type: 'bearer' })
    return Response.json({ error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.' })
  }
  if (url === 'https://api.github.com/user') {
    const auth = new Headers(init?.headers).get('authorization')
    if (auth === 'Bearer gho_owner') return Response.json({ id: 42, login: 'owner' })
    if (auth === 'Bearer gho_other') return Response.json({ id: 7, login: 'someone' })
    return Response.json({ message: 'Bad credentials' }, { status: 401 })
  }
  return new Response('unexpected', { status: 500 })
}

const cookieValue = (response: Response, name: string): string | null => {
  for (const c of response.headers.getSetCookie()) if (c.startsWith(`${name}=`)) return c.slice(name.length + 1).split(';')[0] ?? ''
  return null
}

describe('settings', () => {
  it('name what is missing, never what is set', () => {
    expect(authSettings({ PUBLIC_URL: 'http://hecate.test', AUTH_SECRET: 'short', ALLOWED_GITHUB_USER_ID: 'owner' })).toEqual({
      missing: ['PUBLIC_URL (https)', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'ALLOWED_GITHUB_USER_ID (numeric)', 'AUTH_SECRET (32+ characters)'],
    })
    expect(SETTINGS).toMatchObject({ origin: 'https://hecate.test', redirectHosts: ['claude.ai', 'claude.com'], webhookSecret: 'hook-secret' })
    expect(authSettings({ ...SETTINGS, PUBLIC_URL: 'http://localhost:8787', GITHUB_CLIENT_ID: 'x', GITHUB_CLIENT_SECRET: 'y', ALLOWED_GITHUB_USER_ID: '1', AUTH_SECRET: SECRET, MCP_REDIRECT_HOSTS: ' Example.com , ' }))
      .toMatchObject({ origin: 'http://localhost:8787', redirectHosts: ['example.com'] })
  })
})

describe('signed tokens', () => {
  it('round-trip, and refuse expiry, tampering, another key or another purpose', async () => {
    const token = await signToken({ sub: '42', login: 'owner', exp: NOW / 1000 + 60 }, SECRET, 'session')
    expect(await verifyToken(token, SECRET, 'session', NOW)).toMatchObject({ sub: '42' })
    expect(await verifyToken(token, SECRET, 'session', NOW + 61_000)).toBeNull()
    expect(await verifyToken(token, 'b'.repeat(40), 'session', NOW)).toBeNull()
    expect(await verifyToken(token, SECRET, 'login', NOW)).toBeNull()
    const [body, mac] = token.split('.') as [string, string]
    const forged = Buffer.from(JSON.stringify({ sub: '7', login: 'x', exp: NOW / 1000 + 60 })).toString('base64url')
    expect(await verifyToken(`${forged}.${mac}`, SECRET, 'session', NOW)).toBeNull()
    expect(await verifyToken(`${body}.${mac}.x`, SECRET, 'session', NOW)).toBeNull()
    expect(await verifyToken('garbage', SECRET, 'session', NOW)).toBeNull()
    expect(await verifyToken(null, SECRET, 'session', NOW)).toBeNull()
  })

  it('derives separate secrets per purpose', async () => {
    expect(await derivedSecret(SECRET, 'consent')).toMatch(/^[0-9a-f]{64}$/)
    expect(await derivedSecret(SECRET, 'consent')).not.toBe(await derivedSecret(SECRET, 'session'))
  })
})

describe('MCP redirect allowlist', () => {
  it('allows https on approved hosts and loopback, nothing else', () => {
    const hosts = ['claude.ai', 'claude.com']
    expect(redirectAllowed('https://claude.ai/api/mcp/auth_callback', hosts)).toBe(true)
    expect(redirectAllowed('https://CLAUDE.com/cb', hosts)).toBe(true)
    expect(redirectAllowed('http://localhost:6274/oauth/callback', hosts)).toBe(true)
    expect(redirectAllowed('http://127.0.0.1:33418/callback', hosts)).toBe(true)
    expect(redirectAllowed('http://[::1]:9000/cb', hosts)).toBe(true)
    expect(redirectAllowed('http://claude.ai/cb', hosts)).toBe(false)
    expect(redirectAllowed('https://claude.ai.evil.example/cb', hosts)).toBe(false)
    expect(redirectAllowed('https://evil.example/cb', hosts)).toBe(false)
    expect(redirectAllowed('https://user@claude.ai/cb', hosts)).toBe(false)
    expect(redirectAllowed('https://claude.ai/cb#frag', hosts)).toBe(false)
    expect(redirectAllowed('cursor://anysphere/cb', hosts)).toBe(false)
    expect(redirectAllowed('not a url', hosts)).toBe(false)
  })
})

describe('GitHub sign-in', () => {
  it('builds the authorize URL with PKCE S256', async () => {
    // RFC 7636 appendix B.
    expect(await s256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    const url = new URL(authorizeUrl({ clientId: 'Iv1.client', redirectUri: 'https://hecate.test/auth/callback', state: 's', challenge: 'c' }))
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'Iv1.client', redirect_uri: 'https://hecate.test/auth/callback', state: 's', code_challenge: 'c', code_challenge_method: 'S256', allow_signup: 'false',
    })
  })

  it('exchanges the code, reads the user, and reports failures', async () => {
    const base = { verifier: 'v', redirectUri: 'https://hecate.test/auth/callback', clientId: 'Iv1.client', clientSecret: 'client-secret', fetch: githubOAuth }
    expect(await signInWithCode({ ...base, code: 'good' })).toEqual({ id: '42', login: 'owner' })
    await expect(signInWithCode({ ...base, code: 'expired' })).rejects.toThrow('The code passed is incorrect or expired.')
  })
})

describe('consent page', () => {
  it('escapes everything a client chose', () => {
    const html = consentPage({
      clientId: 'c', clientName: '<script>alert(1)</script>', redirectUri: 'http://localhost:1/cb', redirectHost: 'localhost"><b>',
      redirectIsLoopback: true, scope: ['hecate'],
    }, 'h"andle')
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&#60;script&#62;')
    expect(html).toContain('value="h&#34;andle"')
    expect(html).toContain('an app on your computer')
  })
})

describe('web sign-in', () => {
  async function signIn(code: string) {
    const start = await login(new Request('https://hecate.test/auth/login?back=/board'), { settings: SETTINGS, now: () => NOW })
    expect(start.status).toBe(302)
    const location = new URL(start.headers.get('location') ?? '')
    expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize')
    const loginCookie = cookieValue(start, LOGIN_COOKIE)
    expect(start.headers.get('set-cookie')).toContain('SameSite=Lax')
    const back = new Request(`https://hecate.test/auth/callback?code=${code}&state=${location.searchParams.get('state')}`, { headers: { cookie: `${LOGIN_COOKIE}=${loginCookie}` } })
    return callback(back, { settings: SETTINGS, fetch: githubOAuth, now: () => NOW })
  }

  it('signs in the allowlisted user with a Strict session cookie', async () => {
    const done = await signIn('good')
    expect(done.status).toBe(200)
    expect(await done.text()).toContain('location.replace("/board")')
    const session = done.headers.getSetCookie().find(c => c.startsWith(SESSION_COOKIE))
    expect(session).toMatch(/HttpOnly; Secure; SameSite=Strict/)
    expect(await verifyToken(cookieValue(done, SESSION_COOKIE), SECRET, 'session', NOW)).toMatchObject({ sub: '42', login: 'owner' })
  })

  it('refuses anyone else, a forged or missing state, and an unsafe return path', async () => {
    const other = await signIn('other')
    expect(other.status).toBe(403)
    expect(cookieValue(other, SESSION_COOKIE)).toBeNull()
    const forged = await callback(new Request('https://hecate.test/auth/callback?code=good&state=x'), { settings: SETTINGS, fetch: githubOAuth, now: () => NOW })
    expect(forged.status).toBe(400)
    const start = await login(new Request('https://hecate.test/auth/login?back=//evil.example'), { settings: SETTINGS, now: () => NOW })
    const pending = await verifyToken<{ back: string; exp: number }>(cookieValue(start, LOGIN_COOKIE), SECRET, 'login', NOW)
    expect(pending?.back).toBe('/')
  })

  it('signs out only from the app\'s own origin', () => {
    expect(logout(new Request('https://hecate.test/auth/logout', { method: 'POST', headers: { origin: 'https://evil.example' } }), { settings: SETTINGS }).status).toBe(403)
    const out = logout(new Request('https://hecate.test/auth/logout', { method: 'POST', headers: { origin: 'https://hecate.test' } }), { settings: SETTINGS })
    expect(out.status).toBe(204)
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})

/** A WorkspaceRpc that records calls. */
function fakeRpc(calls: unknown[]): WorkspaceRpc {
  return {
    apply: (dir: string, request: ApplyRequest) => {
      calls.push(['apply', dir, request])
      const outcome: ApplyOutcome = request.ops.length > 0
        ? { status: 'applied', version: 2, opId: 'op', keyMap: {}, summary: [], warnings: [], preview: '', duplicate: false }
        : { status: 'invalid', version: 1, message: 'empty' }
      return Promise.resolve(outcome)
    },
    snapshot: (dir: string) => {
      calls.push(['snapshot', dir])
      return Promise.resolve({ status: 'unavailable', message: 'test' } as Snapshot)
    },
    flush: (dir: string) => {
      calls.push(['flush', dir])
      return Promise.resolve({ status: 'clean', version: 1, head: 'x', replayed: null })
    },
    refresh: (dir: string) => {
      calls.push(['refresh', dir])
      return Promise.resolve({ status: 'unchanged', version: 1, head: 'x' })
    },
    read: (dir: string) => {
      calls.push(['read', dir])
      return Promise.resolve({ status: 'unavailable', message: 'test' })
    },
    ackActivity: (dir: string) => {
      calls.push(['ack', dir])
      return Promise.resolve({ status: 'unavailable', message: 'test' })
    },
  }
}

async function listFor(fake: FakeGitHub): Promise<WorkspaceList> {
  await fake.push({ '_old/workspace.json': '{}\n' })
  return new WorkspaceList(createGitStore({ owner: fake.owner, repo: fake.repo, branch: fake.branch, token: () => Promise.resolve('test-token'), fetch: fake.fetch }))
}

describe('/api', () => {
  const sessionCookie = async (sub = '42') => `${SESSION_COOKIE}=${await signToken({ sub, login: 'owner', exp: NOW / 1000 + 60 }, SECRET, 'session')}`

  it('needs the allowlisted session, and writes need the app\'s origin', async () => {
    const calls: unknown[] = []
    const deps = { settings: SETTINGS, workspaces: await listFor(await seededFake()), workspace: () => fakeRpc(calls), now: () => NOW }
    expect((await handleApi(new Request('https://hecate.test/api/me'), deps)).status).toBe(401)
    expect((await handleApi(new Request('https://hecate.test/api/me', { headers: { cookie: await sessionCookie('7') } }), deps)).status).toBe(401)
    const me = await handleApi(new Request('https://hecate.test/api/me', { headers: { cookie: await sessionCookie() } }), deps)
    expect(await me.json()).toEqual({ userId: '42', login: 'owner' })
    expect(me.headers.get('cache-control')).toBe('no-store')

    const post = (origin: string | null, body: unknown) => new Request('https://hecate.test/api/workspaces/work/ops', {
      method: 'POST', body: JSON.stringify(body), headers: { cookie: '', ...(origin ? { origin } : {}) },
    })
    const withCookie = async (r: Request) => { r.headers.set('cookie', await sessionCookie()); return r }
    expect((await handleApi(await withCookie(post(null, { ops: [{}] })), deps)).status).toBe(403)
    expect((await handleApi(await withCookie(post('https://evil.example', { ops: [{}] })), deps)).status).toBe(403)
    const ok = await handleApi(await withCookie(post('https://hecate.test', { ops: [{ type: 'x' }], opId: 'o', dryRun: true, ifVersion: 3, actor: 'claude' })), deps)
    expect(ok.status).toBe(200)
    expect(calls.at(-1)).toEqual(['apply', 'work', { ops: [{ type: 'x' }], actor: 'app', opId: 'o', dryRun: true, ifVersion: 3 }])
    expect((await handleApi(await withCookie(post('https://hecate.test', { ops: [] })), deps)).status).toBe(400)
    expect((await handleApi(await withCookie(post('https://hecate.test', { nope: 1 })), deps)).status).toBe(400)
  })

  it('lists workspaces from the branch and refuses unknown ones', async () => {
    const calls: unknown[] = []
    const deps = { settings: SETTINGS, workspaces: await listFor(await seededFake()), workspace: () => fakeRpc(calls), now: () => NOW }
    const get = async (path: string) => handleApi(new Request(`https://hecate.test${path}`, { headers: { cookie: await sessionCookie() } }), deps)
    expect(await (await get('/api/workspaces')).json()).toEqual({ workspaces: [{ dir: '_old', hidden: true, name: null, policy: null }, { dir: 'work', hidden: false, name: 'Work', policy: 'open' }] })
    expect((await get('/api/workspaces/club')).status).toBe(404)
    expect((await get('/api/workspaces/..%2Fwork')).status).toBe(404)
    expect((await get('/api/workspaces/work')).status).toBe(503)
    expect(calls).toEqual([['snapshot', 'work']])
  })
})

describe('/hooks/github', () => {
  const sign = async (body: string, secret = 'hook-secret') => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))
    return `sha256=${Buffer.from(mac).toString('hex')}`
  }
  const push = (paths: string[], ref = 'refs/heads/main') => JSON.stringify({
    ref, repository: { full_name: 'Owner/Data' }, commits: [{ added: [], modified: paths, removed: [] }],
  })

  it('finds the workspaces a push touched, or all of them when it cannot tell', () => {
    expect(touchedDirs(JSON.parse(push(['work/tasks.json', 'README.md', 'club/x.md'])) as never)).toEqual(['club', 'work'])
    expect(touchedDirs({ commits: [] })).toBe('all')
    expect(touchedDirs({ commits: Array.from({ length: 20 }, () => ({ added: [], modified: [], removed: [] })) })).toBe('all')
    expect(touchedDirs({ commits: [{ added: 'x' }] })).toBe('all')
  })

  it('verifies the signature, then refreshes only touched workspaces on the data branch', async () => {
    const calls: unknown[] = []
    const waiting: Promise<unknown>[] = []
    const fake = await seededFake()
    const deps = { secret: 'hook-secret', owner: 'owner', repo: 'data', branch: 'main', workspaces: await listFor(fake), workspace: () => fakeRpc(calls), waitUntil: (p: Promise<unknown>) => void waiting.push(p) }
    const hook = async (body: string, event = 'push', signature?: string) => githubHook(new Request('https://hecate.test/hooks/github', {
      method: 'POST', body, headers: { 'x-github-event': event, 'x-hub-signature-256': signature ?? await sign(body) },
    }), deps)

    expect((await hook(push(['work/a']), 'push', await sign(push(['work/a']), 'wrong'))).status).toBe(401)
    expect((await hook('{}', 'ping')).status).toBe(200)
    expect((await hook('{}', 'issues')).status).toBe(202)
    const accepted = await hook(push(['work/tasks.json', 'nonexistent/x']))
    expect(accepted.status).toBe(202)
    expect(await accepted.json()).toEqual({ refreshing: ['work'] })
    await Promise.all(waiting)
    expect(calls).toEqual([['refresh', 'work']])
    expect(await (await hook(push(['work/a'], 'refs/heads/other'))).json()).toEqual({ ignored: 'another branch or repository' })
    expect((await githubHook(new Request('https://hecate.test/hooks/github', { method: 'POST', body: '{}' }), { ...deps, secret: null })).status).toBe(503)
  })
})
