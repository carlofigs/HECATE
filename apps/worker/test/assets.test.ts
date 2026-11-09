/**
 * The web app is the Worker's static assets (wrangler.jsonc `assets`). Every
 * path the Worker answers must reach it before the assets do — sign-in above
 * all, which a navigation fallback would otherwise swallow — and every other
 * path is a file or the app's index.html.
 */
import type { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seededFake } from './helpers.ts'
import { ORIGIN, RUN_WORKER_FIRST, startWorker } from './runtime.ts'

let mf: Miniflare
const ASSETS = new URL('./fixtures/assets', import.meta.url).pathname

beforeAll(async () => {
  mf = await startWorker(await seededFake(), {}, { assets: ASSETS })
})
afterAll(() => mf.dispose())

const get = (path: string, init: Record<string, unknown> = {}) => mf.dispatchFetch(`${ORIGIN}${path}`, { redirect: 'manual', ...init })

describe('static assets', () => {
  it('serves the app for any page, as a navigation and as a fetch', async () => {
    for (const path of ['/', '/w/work/today', '/w/work/board?task=A1']) {
      for (const mode of ['navigate', 'cors']) {
        const response = await get(path, { headers: { 'sec-fetch-mode': mode } })
        expect(response.status, `${path} (${mode})`).toBe(200)
        expect(await response.text()).toContain('fixture app')
      }
    }
  })

  it('applies _headers to the app, including the fallback', async () => {
    const response = await get('/w/work/today', { headers: { 'sec-fetch-mode': 'navigate' } })
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    await response.text()
  })

  it('serves built files as themselves', async () => {
    const response = await get('/assets/app-abc123.css')
    expect(response.headers.get('content-type')).toContain('text/css')
    expect(await response.text()).toContain('.fixture')
  })

  it('routes every Worker path to the Worker before the assets', async () => {
    const login = await get('/auth/login', { headers: { 'sec-fetch-mode': 'navigate' } })
    expect(login.status).toBe(302)
    expect(login.headers.get('location')).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize/)

    const me = await get('/api/me')
    expect(me.status).toBe(401)
    expect(await me.json()).toMatchObject({ error: 'Not signed in' })
    expect((await get('/api')).status).toBe(401)

    expect(await (await get('/health')).json()).toEqual({ ok: true })
    const discovery = await get('/.well-known/oauth-authorization-server')
    expect(await discovery.json()).toMatchObject({ issuer: ORIGIN })
    const register = await get('/oauth/register', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })
    expect(register.status).toBe(400)
    await register.text()
    expect((await get('/mcp', { method: 'POST' })).status).toBe(401)
    expect((await get('/authorize', { headers: { 'sec-fetch-mode': 'navigate' } })).status).toBe(400)
    expect((await get('/hooks/github', { method: 'POST', body: '{}' })).status).toBe(401)
  })

  it('reads the routing list from wrangler.jsonc', () => {
    expect(RUN_WORKER_FIRST).toContain('/auth/*')
    expect(RUN_WORKER_FIRST).toContain('/api')
  })
})
