import { describe, expect, it } from 'vitest'
import { GitHubError, RateLimitError, createClient } from './http.ts'

type Step = Response | Error

function scripted(steps: Step[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const sleeps: number[] = []
  const client = createClient({
    fetch: (url, init = {}) => {
      calls.push({ url, init })
      const step = steps.shift()
      if (!step) throw new Error('No more scripted responses')
      return step instanceof Error ? Promise.reject(step) : Promise.resolve(step)
    },
    baseUrl: 'https://api.example.test',
    userAgent: 'hecate-test',
    authorization: () => Promise.resolve('Bearer t'),
    sleep: ms => {
      sleeps.push(ms)
      return Promise.resolve()
    },
    maxAttempts: 3,
  })
  return { client, calls, sleeps }
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers })

describe('GitHub HTTP client', () => {
  it('sends the headers GitHub expects, and JSON bodies', async () => {
    const { client, calls } = scripted([json(201, { sha: 'abc' })])
    const res = await client.request<{ sha: string }>('POST', '/x', { body: { a: 1 } })
    expect(res).toMatchObject({ status: 201, data: { sha: 'abc' } })
    const headers = new Headers(calls[0]?.init.headers)
    expect(calls[0]?.url).toBe('https://api.example.test/x')
    expect(Object.fromEntries(headers)).toMatchObject({
      accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'hecate-test',
      authorization: 'Bearer t', 'content-type': 'application/json',
    })
    expect(calls[0]?.init.body).toBe('{"a":1}')
  })

  it('retries 5xx and network failures with backoff', async () => {
    const { client, sleeps } = scripted([json(502, { message: 'Bad gateway' }), new TypeError('network'), json(200, { ok: true })])
    await expect(client.request('GET', '/x')).resolves.toMatchObject({ data: { ok: true } })
    expect(sleeps).toEqual([1000, 2000])
  })

  it('waits out a secondary rate limit for retry-after', async () => {
    const { client, sleeps } = scripted([json(403, { message: 'You have exceeded a secondary rate limit' }, { 'retry-after': '7' }), json(200, {})])
    await client.request('GET', '/x')
    expect(sleeps).toEqual([7000])
  })

  it('gives up after three attempts', async () => {
    const { client, calls } = scripted([json(429, {}), json(429, {}), json(429, {})])
    await expect(client.request('GET', '/x')).rejects.toBeInstanceOf(RateLimitError)
    expect(calls).toHaveLength(3)
  })

  it('does not retry a spent primary rate limit, and says when it resets', async () => {
    const { client, calls } = scripted([json(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' })])
    const error = await client.request('GET', '/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RateLimitError)
    expect((error as RateLimitError).resetAt).toBe(1_800_000_000_000)
    expect(calls).toHaveLength(1)
  })

  it('does not retry other client errors', async () => {
    const { client, calls } = scripted([json(401, { message: 'Bad credentials' })])
    await expect(client.request('GET', '/x')).rejects.toThrow(new GitHubError(401, 'Bad credentials', null).message)
    expect(calls).toHaveLength(1)
  })

  it('returns 304 with no data', async () => {
    const { client } = scripted([new Response(null, { status: 304, headers: { etag: 'W/"x"' } })])
    await expect(client.request('GET', '/x')).resolves.toMatchObject({ status: 304, data: null })
  })
})
