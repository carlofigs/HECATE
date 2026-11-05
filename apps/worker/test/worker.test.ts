/**
 * The Worker in the real Workers runtime (workerd, through Miniflare), with
 * GitHub answered by the in-memory fake: Durable Object storage, RPC-free
 * routes and the alarm that commits, end to end.
 */
import { build } from 'esbuild'
import { Miniflare, type Request as MiniflareRequest } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FakeGitHub } from '@hecate/github-store/testing'
import { DIR, addTask, seededFake } from './helpers.ts'

let mf: Miniflare
let fake: FakeGitHub

beforeAll(async () => {
  fake = await seededFake()
  const bundle = await build({
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
  })
  mf = new Miniflare({
    modules: true,
    script: bundle.outputFiles[0]?.text ?? '',
    compatibilityDate: '2026-08-01',
    durableObjects: { WORKSPACE: { className: 'WorkspaceDO', useSQLite: true } },
    bindings: { GITHUB_OWNER: fake.owner, GITHUB_REPO: fake.repo, GITHUB_BRANCH: fake.branch, GITHUB_TOKEN: 'test-token', COMMIT_INTERVAL_MS: '200' },
    outboundService: async (request: MiniflareRequest) => {
      const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text()
      const response = await fake.fetch(request.url, { method: request.method, headers: Object.fromEntries(request.headers), ...(body !== undefined ? { body } : {}) })
      return new Response(response.body, { status: response.status, headers: response.headers }) as never
    },
  })
})

afterAll(async () => {
  await mf.dispose()
})

async function call<T>(verb: string, body: Record<string, unknown>): Promise<T> {
  const ns = await mf.getDurableObjectNamespace('WORKSPACE')
  const response = await ns.get(ns.idFromName(DIR)).fetch(`http://do/${verb}`, { method: 'POST', body: JSON.stringify({ dir: DIR, ...body }) })
  return (await response.json()) as T
}

describe('the Worker in workerd', () => {
  it('answers a health check, and nothing else yet', async () => {
    expect(await (await mf.dispatchFetch('http://hecate.test/health')).json()).toEqual({ ok: true })
    expect((await mf.dispatchFetch('http://hecate.test/api/workspaces')).status).toBe(404)
  })

  it('applies ops in the Durable Object and commits them when its alarm fires', async () => {
    const applied = await call<{ status: string; keyMap: Record<string, string> }>('apply', { ops: [addTask('From the runtime')], actor: 'claude', opId: 'rt-1' })
    expect(applied).toMatchObject({ status: 'applied', keyMap: { $1: 'A3' } })
    await expect.poll(() => fake.log()[0], { timeout: 10_000 }).toMatch(/^work: .*\n[\s\S]*Op-Id: rt-1$/)
    expect(fake.files()[`${DIR}/tasks.json`]).toContain('From the runtime')
    expect(await call('snapshot', {})).toMatchObject({ status: 'ok', version: 2, pending: 0, head: fake.head() })
  })

  it('picks up an external push on refresh', async () => {
    await fake.push({ [`${DIR}/references/notes.md`]: '# Notes\n' })
    expect(await call('refresh', {})).toMatchObject({ status: 'updated', head: fake.head() })
    const snapshot = await call<{ state: { references: Record<string, string> } }>('snapshot', {})
    expect(snapshot.state.references).toEqual({ notes: '# Notes\n' })
  })

  it('refuses a request without a workspace directory', async () => {
    const ns = await mf.getDurableObjectNamespace('WORKSPACE')
    const response = await ns.get(ns.idFromName(DIR)).fetch('http://do/snapshot', { method: 'POST', body: JSON.stringify({ dir: '../etc' }) })
    expect(response.status).toBe(400)
  })
})
