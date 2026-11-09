/**
 * The e2e harness: the bundled Worker in workerd (Miniflare), serving the
 * built web app as its static assets, with GitHub replaced by the in-memory
 * fake seeded from fixture.ts. Never deployed.
 *
 *   pnpm --filter @hecate/web build && pnpm --filter @hecate/worker harness
 *
 * Then open http://localhost:8788. Sign-in runs the Worker's real flow; only
 * GitHub's own consent page is skipped: the redirect to it is answered here
 * with the callback the Worker expects (fake code `good`, the allowlisted
 * user). For `vite dev`, start it with PUBLIC_URL=http://localhost:5173 so
 * cookies and the Origin check match the dev server, which proxies /api and
 * /auth here.
 */
import { createServer, type IncomingMessage } from 'node:http'
import { existsSync } from 'node:fs'
import { createFakeGitHub } from '@hecate/github-store/testing'
import { startWorker } from '../test/runtime.ts'
import { fixtureFiles } from './fixture.ts'

const PORT = Number(process.env.E2E_PORT ?? 8788)
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`
const ASSETS = new URL('../../web/dist', import.meta.url).pathname
const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize'

if (!existsSync(`${ASSETS}/index.html`)) {
  process.stderr.write('apps/web/dist is missing: run `pnpm --filter @hecate/web build` first.\n')
  process.exit(1)
}

const fake = createFakeGitHub()
await fake.seed(fixtureFiles())
const worker = await startWorker(fake, { PUBLIC_URL, DEFAULT_WORKSPACE: 'planning', COMMIT_INTERVAL_MS: '1000' }, { assets: ASSETS })

async function body(request: IncomingMessage): Promise<Buffer | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

const server = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url ?? '/', PUBLIC_URL)

    // GitHub's consent page, answered as if the allowlisted user approved.
    if (url.pathname === '/__harness/authorize') {
      const back = new URL(url.searchParams.get('redirect_uri') ?? `${PUBLIC_URL}/auth/callback`)
      back.searchParams.set('code', 'good')
      back.searchParams.set('state', url.searchParams.get('state') ?? '')
      response.writeHead(302, { location: back.href }).end()
      return
    }

    const headers = new Headers()
    for (const [name, value] of Object.entries(request.headers)) {
      if (value === undefined || name === 'host' || name === 'connection') continue
      for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v)
    }
    const payload = await body(request)
    const answer = await worker.dispatchFetch(url.href, {
      method: request.method ?? 'GET',
      headers: headers as never,
      ...(payload ? { body: payload } : {}),
      redirect: 'manual',
    })

    const out: Record<string, string | string[]> = {}
    answer.headers.forEach((value, name) => {
      if (name !== 'set-cookie' && name !== 'content-encoding' && name !== 'content-length' && name !== 'transfer-encoding') out[name] = value
    })
    const cookies = answer.headers.getSetCookie()
    if (cookies.length > 0) out['set-cookie'] = cookies
    const location = answer.headers.get('location')
    if (location?.startsWith(GITHUB_AUTHORIZE)) out.location = `/__harness/authorize${location.slice(GITHUB_AUTHORIZE.length)}`
    response.writeHead(answer.status, out)
    response.end(Buffer.from(await answer.arrayBuffer()))
  })().catch((error: unknown) => {
    process.stderr.write(`harness: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
    if (!response.headersSent) response.writeHead(502)
    response.end()
  })
})

server.listen(PORT, () => process.stdout.write(`HECATE harness on ${PUBLIC_URL} (assets: apps/web/dist)\n`))

const stop = (): void => {
  server.close()
  void worker.dispose().then(() => process.exit(0))
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
