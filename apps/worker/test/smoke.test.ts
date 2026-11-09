import type { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seededFake } from './helpers.ts'
import { ORIGIN, startWorker } from './runtime.ts'

const ASSETS = new URL('./fixtures/assets', import.meta.url).pathname
import { smoke } from './smoke.ts'

let configured: Miniflare
let bare: Miniflare

beforeAll(async () => {
  const fake = await seededFake()
  configured = await startWorker(fake, {}, { assets: ASSETS })
  bare = await startWorker(fake, { PUBLIC_URL: '', AUTH_SECRET: '', GITHUB_WEBHOOK_SECRET: '' }, { assets: ASSETS })
})

afterAll(async () => {
  await configured.dispose()
  await bare.dispose()
})

describe('the deploy smoke check', () => {
  it('passes against a configured Worker', async () => {
    const checks = await smoke(ORIGIN, (url, init) => configured.dispatchFetch(url, init as never) as never)
    expect(checks.filter(c => !c.ok)).toEqual([])
    expect(checks).toHaveLength(8)
  })

  it('fails, naming what is missing, against an unconfigured one', async () => {
    const checks = await smoke(ORIGIN, (url, init) => bare.dispatchFetch(url, init as never) as never)
    expect(checks.find(c => c.name === 'health')?.ok).toBe(true)
    expect(checks.find(c => c.name.startsWith('configured'))).toMatchObject({ ok: false, detail: expect.stringContaining('PUBLIC_URL') })
  })
})
