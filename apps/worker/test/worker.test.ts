/**
 * The Worker in the real Workers runtime (workerd, through Miniflare), with
 * GitHub answered by the in-memory fake: Durable Object storage, its JSON
 * routes and the alarm that commits, end to end.
 */
import type { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FakeGitHub } from '@hecate/github-store/testing'
import { DIR, addTask, seededFake } from './helpers.ts'
import { ORIGIN, startWorker } from './runtime.ts'

let mf: Miniflare
let fake: FakeGitHub

beforeAll(async () => {
  fake = await seededFake()
  mf = await startWorker(fake)
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
  it('answers a health check; everything else needs sign-in', async () => {
    expect(await (await mf.dispatchFetch(`${ORIGIN}/health`)).json()).toEqual({ ok: true })
    expect((await mf.dispatchFetch(`${ORIGIN}/api/workspaces`)).status).toBe(401)
    expect((await mf.dispatchFetch(`${ORIGIN}/nowhere`)).status).toBe(404)
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
