import { describe, it, expect, vi, afterEach } from 'vitest'
import { getFile, putFile } from './github'
import type { GitHubError } from './github'

const creds = { token: 't', owner: 'o', repo: 'r', workspace: 'ws' }

function b64(s: string): string {
  // UTF-8 → base64 the same way GitHub's Contents API returns it
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  bytes.forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin)
}

afterEach(() => { vi.restoreAllMocks() })

describe('getFile', () => {
  it('decodes base64 UTF-8 content including emoji and accents', async () => {
    const payload = { title: 'Café ☕ — déjà vu 🎉', n: 1 }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ content: b64(JSON.stringify(payload)), sha: 'abc', path: 'ws/focus.json' }),
      { status: 200 },
    ))
    const out = await getFile<typeof payload>(creds, 'focus')
    expect(out.data).toEqual(payload)
    expect(out.sha).toBe('abc')
  })

  it('throws a readable error when content is undecodable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ content: '@@@not base64@@@', sha: 'x', path: 'p' }),
      { status: 200 },
    ))
    await expect(getFile(creds, 'tasks')).rejects.toMatchObject({
      message: expect.stringMatching(/could not be decoded/),
    })
  })

  it('surfaces the HTTP status and message on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ message: 'Not Found' }), { status: 404 },
    ))
    await expect(getFile(creds, 'tasks')).rejects.toMatchObject<Partial<GitHubError>>({
      status: 404,
      message: 'Not Found',
    })
  })
})

describe('putFile', () => {
  it('round-trips UTF-8 data: the encoded body decodes back to the original', async () => {
    const data = { note: 'naïve façade 日本語 🚀' }
    let sentBody = ''
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      sentBody = String((init as RequestInit).body)
      return new Response(JSON.stringify({ content: { sha: 'newsha' } }), { status: 200 })
    })

    const sha = await putFile(creds, 'memory', data, 'oldsha')
    expect(sha).toBe('newsha')

    // Decode the content we sent and confirm it matches the original data
    const body = JSON.parse(sentBody)
    const bin = atob(body.content)
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
    const decoded = JSON.parse(new TextDecoder('utf-8').decode(bytes))
    expect(decoded).toEqual(data)
    expect(body.sha).toBe('oldsha')
  })

  it('omits sha when creating a new file', async () => {
    let sentBody = ''
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      sentBody = String((init as RequestInit).body)
      return new Response(JSON.stringify({ content: { sha: 's' } }), { status: 200 })
    })
    await putFile(creds, 'tasks', { columns: [] }, null)
    expect(JSON.parse(sentBody)).not.toHaveProperty('sha')
  })

  it('propagates a 409 with its status for conflict recovery upstream', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ message: 'is at abc but expected def' }), { status: 409 },
    ))
    await expect(putFile(creds, 'focus', { sections: [] }, 'stale')).rejects.toMatchObject({
      status: 409,
    })
  })
})
