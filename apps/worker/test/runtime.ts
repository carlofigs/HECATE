/**
 * The bundled Worker in workerd (through Miniflare), for tests. GitHub is
 * answered in Node: the git endpoints by the fake GitHub, and sign-in by a
 * fake of GitHub's OAuth (code `good` is user 42, the allowlisted owner;
 * code `other` is user 7).
 */

import { build } from 'esbuild'
import { Miniflare, type Request as MiniflareRequest } from 'miniflare'
import type { FakeGitHub } from '@hecate/github-store/testing'

export const ORIGIN = 'https://hecate.test'
const AUTH_SECRET = 'test-secret-that-is-long-enough-1234567890'
export const WEBHOOK_SECRET = 'hook-secret'

let bundled: Promise<string> | null = null

function bundle(): Promise<string> {
  bundled ??= build({
    entryPoints: [new URL('../src/index.ts', import.meta.url).pathname],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    conditions: ['workerd', 'worker', 'browser'],
    mainFields: ['module', 'main'],
    external: ['cloudflare:*'],
    // As wrangler does: libraries such as immer read process.env.NODE_ENV.
    define: { 'process.env.NODE_ENV': '"production"' },
    write: false,
  }).then(result => result.outputFiles[0]?.text ?? '')
  return bundled
}

function githubOAuth(url: URL, body: string, headers: Headers): Response | null {
  if (url.href === 'https://github.com/login/oauth/access_token') {
    const form = JSON.parse(body) as Record<string, string>
    if (form.client_secret !== 'client-secret' || !form.code_verifier) return Response.json({ error: 'incorrect_client_credentials' })
    const token = { good: 'gho_owner', other: 'gho_other' }[form.code ?? '']
    return Response.json(token ? { access_token: token, token_type: 'bearer' } : { error: 'bad_verification_code' })
  }
  if (url.href === 'https://api.github.com/user') {
    const auth = headers.get('authorization')
    if (auth === 'Bearer gho_owner') return Response.json({ id: 42, login: 'owner' })
    if (auth === 'Bearer gho_other') return Response.json({ id: 7, login: 'someone' })
    return Response.json({ message: 'Bad credentials' }, { status: 401 })
  }
  return null
}

export async function startWorker(fake: FakeGitHub, bindings: Record<string, string> = {}): Promise<Miniflare> {
  return new Miniflare({
    modules: true,
    script: await bundle(),
    compatibilityDate: '2026-08-01',
    compatibilityFlags: ['global_fetch_strictly_public'],
    durableObjects: { WORKSPACE: { className: 'WorkspaceDO', useSQLite: true } },
    kvNamespaces: ['OAUTH_KV'],
    bindings: {
      GITHUB_OWNER: fake.owner, GITHUB_REPO: fake.repo, GITHUB_BRANCH: fake.branch, GITHUB_TOKEN: 'test-token', COMMIT_INTERVAL_MS: '200',
      PUBLIC_URL: ORIGIN, GITHUB_CLIENT_ID: 'Iv1.client', GITHUB_CLIENT_SECRET: 'client-secret', ALLOWED_GITHUB_USER_ID: '42',
      AUTH_SECRET, GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
      ...bindings,
    },
    outboundService: async (request: MiniflareRequest) => {
      const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text()
      const headers = new Headers(Object.fromEntries(request.headers))
      const url = new URL(request.url)
      const response = githubOAuth(url, body ?? '', headers)
        ?? await fake.fetch(request.url, { method: request.method, headers: Object.fromEntries(headers), ...(body !== undefined ? { body } : {}) })
      return new Response(response.body, { status: response.status, headers: response.headers }) as never
    },
  })
}

/** A browser's cookies, enough for these tests. */
export class CookieJar {
  private readonly cookies = new Map<string, string>()

  store(response: { headers: { getSetCookie(): string[] } }): void {
    for (const line of response.headers.getSetCookie()) {
      const [pair = '', ...attributes] = line.split(';')
      const eq = pair.indexOf('=')
      const name = pair.slice(0, eq).trim()
      if (attributes.some(a => /^\s*max-age=0\s*$/i.test(a))) this.cookies.delete(name)
      else this.cookies.set(name, pair.slice(eq + 1).trim())
    }
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
  }

  has(name: string): boolean {
    return this.cookies.has(name)
  }
}
