import { describe, expect, it } from 'vitest'
import { createApi } from './api.ts'

const respond = (status: number, body?: unknown) => () =>
  Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))

describe('the API client', () => {
  it('returns the data on success', async () => {
    const api = createApi(respond(200, { userId: 42, login: 'owner' }))
    expect(await api.me()).toEqual({ kind: 'ok', data: { userId: 42, login: 'owner' } })
  })

  it('names each failure instead of throwing', async () => {
    expect(await createApi(respond(401, { error: 'Not signed in' })).me()).toEqual({ kind: 'signed-out' })
    expect(await createApi(respond(404, { error: 'No workspace "x"' })).snapshot('x')).toEqual({ kind: 'not-found', message: 'No workspace "x"' })
    expect(await createApi(respond(503, { status: 'unavailable', message: 'GitHub is down' })).snapshot('w')).toEqual({ kind: 'unavailable', message: 'GitHub is down' })
    expect(await createApi(respond(500, { error: 'Boom' })).me()).toEqual({ kind: 'unexpected', status: 500, message: 'Boom' })
    expect(await createApi(() => Promise.reject(new TypeError('Failed to fetch'))).me()).toEqual({ kind: 'network' })
  })

  it('refuses a body of the wrong shape', async () => {
    expect((await createApi(respond(200, { nope: true })).workspaces()).kind).toBe('unexpected')
    expect((await createApi(respond(200, { status: 'ok' })).snapshot('w')).kind).toBe('unexpected')
  })

  it('reads the workspace list with its default', async () => {
    const list = { workspaces: [{ dir: 'w', hidden: false, name: 'Work', policy: 'open' }], default: 'w' }
    expect(await createApi(respond(200, list)).workspaces()).toEqual({ kind: 'ok', data: list })
    expect(await createApi(respond(200, { workspaces: [] })).workspaces()).toEqual({ kind: 'ok', data: { workspaces: [], default: null } })
  })

  it('reads a snapshot, and encodes the workspace in the path', async () => {
    let asked = ''
    const api = createApi(path => {
      asked = path
      return respond(200, { status: 'ok', version: 3, state: { tasks: {} }, head: 'abc', pending: 1, lastError: null })()
    })
    const result = await api.snapshot('a b')
    expect(asked).toBe('/api/workspaces/a%20b')
    expect(result).toEqual({ kind: 'ok', data: { version: 3, state: { tasks: {} }, pending: 1, lastError: null } })
  })

  it('signs out with a POST and accepts the empty answer', async () => {
    let method = ''
    const api = createApi((_path, init) => {
      method = init?.method ?? 'GET'
      return Promise.resolve(new Response(null, { status: 204 }))
    })
    expect(await api.signOut()).toEqual({ kind: 'ok', data: null })
    expect(method).toBe('POST')
  })
})
