/**
 * smoke.ts — check a deployed Worker from outside:
 *
 *   pnpm --filter @hecate/worker smoke https://hecate-preview.<subdomain>.workers.dev
 *
 * Anonymous and read-only: it never signs in and never writes. It checks that
 * the Worker is up and fully configured, that it serves the web app, and that
 * every guarded route refuses a stranger. The deploy workflow runs it after each deploy.
 */

import { pathToFileURL } from 'node:url'

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export interface Check {
  name: string
  ok: boolean
  detail: string
}

export async function smoke(origin: string, call: Fetch = (url, init) => fetch(url, init)): Promise<Check[]> {
  const base = new URL(origin).origin
  const checks: Check[] = []
  const check = async (name: string, run: () => Promise<[boolean, string]>): Promise<void> => {
    try {
      const [ok, detail] = await run()
      checks.push({ name, ok, detail })
    } catch (error) {
      checks.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) })
    }
  }

  await check('the app is served, with its security headers', async () => {
    const r = await call(`${base}/`, { headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate' } })
    const html = await r.text()
    const csp = r.headers.get('content-security-policy') ?? ''
    return [r.status === 200 && html.includes('<div id="root">') && csp.includes("frame-ancestors 'none'"), `${r.status}${csp ? '' : ', no CSP'}`]
  })
  await check('health', async () => {
    const r = await call(`${base}/health`)
    return [r.status === 200, `${r.status}`]
  })
  await check('configured, and /api needs a session', async () => {
    const r = await call(`${base}/api/me`)
    if (r.status === 503) return [false, `not configured: ${JSON.stringify(((await r.json()) as { missing?: string[] }).missing ?? [])}`]
    return [r.status === 401, `${r.status}`]
  })
  await check('/mcp challenges a stranger', async () => {
    const r = await call(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    const challenge = r.headers.get('www-authenticate') ?? ''
    return [r.status === 401 && challenge.includes('resource_metadata='), `${r.status}`]
  })
  await check('resource metadata names this Worker', async () => {
    const r = await call(`${base}/.well-known/oauth-protected-resource/mcp`)
    const body = (await r.json()) as { resource?: string }
    return [body.resource === `${base}/mcp`, body.resource ?? `${r.status}`]
  })
  await check('authorization server metadata', async () => {
    const r = await call(`${base}/.well-known/oauth-authorization-server`)
    const body = (await r.json()) as { issuer?: string; registration_endpoint?: string }
    return [body.issuer === base && body.registration_endpoint === `${base}/oauth/register`, body.issuer ?? `${r.status}`]
  })
  await check('registration refuses a foreign redirect', async () => {
    const r = await call(`${base}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'smoke', redirect_uris: ['https://example.invalid/callback'], token_endpoint_auth_method: 'none' }),
    })
    return [r.status === 400, `${r.status}`]
  })
  await check('webhook refuses an unsigned delivery', async () => {
    const r = await call(`${base}/hooks/github`, { method: 'POST', headers: { 'x-github-event': 'ping' }, body: '{}' })
    return [r.status === 401, r.status === 503 ? '503: GITHUB_WEBHOOK_SECRET is not set' : `${r.status}`]
  })
  return checks
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const origin = process.argv[2] ?? process.env.HECATE_URL
  if (!origin) {
    process.stderr.write('Usage: pnpm --filter @hecate/worker smoke <https://…workers.dev>\n')
    process.exit(2)
  }
  const checks = await smoke(origin)
  for (const c of checks) process.stdout.write(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name} (${c.detail})\n`)
  process.exitCode = checks.every(c => c.ok) ? 0 : 1
}
