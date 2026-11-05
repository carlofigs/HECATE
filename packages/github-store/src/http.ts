/**
 * http.ts — one way to call the GitHub REST API.
 *
 * Sends the headers GitHub asks for, retries what is worth retrying (network
 * failures, 5xx, secondary rate limits) a bounded number of times, and turns
 * everything else into a typed error. A primary rate limit is not retried: the
 * caller (the Durable Object's alarm) reschedules for the reset time instead.
 */

export const GITHUB_API = 'https://api.github.com'
const API_VERSION = '2022-11-28'

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export class GitHubError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, message: string, body: unknown) {
    super(`GitHub ${status}: ${message}`)
    this.name = 'GitHubError'
    this.status = status
    this.body = body
  }
}

/** The primary rate limit is spent; nothing more until `resetAt` (ms since the epoch). */
export class RateLimitError extends GitHubError {
  readonly resetAt: number | null
  constructor(status: number, message: string, body: unknown, resetAt: number | null) {
    super(status, message, body)
    this.name = 'RateLimitError'
    this.resetAt = resetAt
  }
}

export interface ClientOptions {
  fetch: Fetch
  baseUrl: string
  userAgent: string
  /** The default Authorization header value (`Bearer …`). */
  authorization: () => Promise<string>
  sleep: (ms: number) => Promise<void>
  /** Total attempts for a retryable failure. */
  maxAttempts: number
}

interface RequestOptions {
  body?: unknown
  /** Overrides the default Authorization header (an App JWT, for instance). */
  authorization?: string
  headers?: Record<string, string>
}

interface ApiResponse<T> {
  status: number
  headers: Headers
  /** Null for 204 and 304. */
  data: T
}

export interface Client {
  request<T>(method: string, path: string, options?: RequestOptions): Promise<ApiResponse<T>>
}

const MAX_WAIT_MS = 30_000

const messageOf = (body: unknown, fallback: string): string =>
  typeof body === 'object' && body !== null && typeof (body as { message?: unknown }).message === 'string'
    ? (body as { message: string }).message
    : fallback

export const defaultSleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

export function createClient(options: ClientOptions): Client {
  const backoff = (attempt: number): number => Math.min(MAX_WAIT_MS, 1000 * 2 ** (attempt - 1))

  return {
    async request<T>(method: string, path: string, init: RequestOptions = {}): Promise<ApiResponse<T>> {
      for (let attempt = 1; ; attempt++) {
        const last = attempt >= options.maxAttempts
        let response: Response
        try {
          response = await options.fetch(`${options.baseUrl}${path}`, {
            method,
            headers: {
              accept: 'application/vnd.github+json',
              'x-github-api-version': API_VERSION,
              'user-agent': options.userAgent,
              authorization: init.authorization ?? (await options.authorization()),
              ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
              ...init.headers,
            },
            body: init.body !== undefined ? JSON.stringify(init.body) : null,
          })
        } catch (error) {
          if (last) throw error
          await options.sleep(backoff(attempt))
          continue
        }

        if (response.status === 304 || response.status === 204) return { status: response.status, headers: response.headers, data: null as T }
        const text = await response.text()
        let body: unknown
        try {
          body = text ? JSON.parse(text) : null
        } catch {
          body = text
        }
        if (response.ok) return { status: response.status, headers: response.headers, data: body as T }

        const message = messageOf(body, response.statusText)
        if (response.status === 403 || response.status === 429) {
          const retryAfter = response.headers.get('retry-after')
          const remaining = response.headers.get('x-ratelimit-remaining')
          if (remaining === '0' && retryAfter === null) {
            const reset = Number(response.headers.get('x-ratelimit-reset'))
            throw new RateLimitError(response.status, message, body, Number.isFinite(reset) && reset > 0 ? reset * 1000 : null)
          }
          const secondary = retryAfter !== null || response.status === 429 || /secondary rate limit/i.test(message)
          if (secondary) {
            if (last) throw new RateLimitError(response.status, message, body, null)
            const wait = retryAfter !== null && Number.isFinite(Number(retryAfter)) ? Number(retryAfter) * 1000 : backoff(attempt)
            await options.sleep(Math.min(MAX_WAIT_MS, wait))
            continue
          }
        }
        if (response.status >= 500 && !last) {
          await options.sleep(backoff(attempt))
          continue
        }
        throw new GitHubError(response.status, message, body)
      }
    },
  }
}
