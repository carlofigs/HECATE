/**
 * fake-github.ts — an in-memory GitHub for tests. Never point a test at the
 * real data repository.
 *
 * It implements exactly the endpoints @hecate/github-store uses, with
 * GitHub's own status codes: ETag 304s on the branch ref, 401 for a bad token,
 * 404 for an unknown object, 422 for a non-fast-forward ref update, and
 * whatever failNext() injects (rate limits, outages). Blob SHAs are real git
 * SHAs; tree and commit SHAs are opaque but stable.
 *
 * `push()` plays another writer (a Claude session with git access), so tests
 * can move the branch between a read and a write.
 */

import { bytesToBase64, base64ToBytes, textToBase64 } from '../base64.ts'
import type { Fetch } from '../http.ts'
import { gitBlobSha } from '../store.ts'

export interface FakeGitHubOptions {
  owner?: string
  repo?: string
  branch?: string
  /** Installation tokens accepted on repository endpoints, besides those minted through the App flow. */
  tokens?: string[]
  /** Enables the App endpoints: JWTs are verified against `publicKey`. */
  app?: { appId: string | number; installationId: number; publicKey: CryptoKey }
  now?: () => number
  tokenLifetimeMs?: number
}

export interface FakeResponse {
  status: number
  headers?: Record<string, string>
  body?: unknown
}

export interface FakeGitHub {
  fetch: Fetch
  owner: string
  repo: string
  branch: string
  /** Every request received, in order, as `METHOD /path?query`. */
  requests: string[]
  /** Installation tokens minted so far. */
  tokensIssued: number
  /** Create the branch with these files as its first commit. */
  seed(files: Record<string, string>, message?: string): Promise<string>
  /** Commit on top of the branch head as someone else would (null deletes). */
  push(changes: Record<string, string | null>, message?: string): Promise<string>
  head(): string | null
  /** Files at a commit (the head by default). */
  files(commit?: string): Record<string, string>
  /** Commit messages from the head back to the root. */
  log(): string[]
  /** Answer the next `times` requests with `response` instead of handling them. */
  failNext(response: FakeResponse, times?: number): void
}

interface Commit {
  tree: string
  parents: string[]
  message: string
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } })

async function sha1Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text)))
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('')
}

async function verifyJwt(jwt: string, key: CryptoKey): Promise<Record<string, unknown> | null> {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  const [header, payload, signature] = parts as [string, string, string]
  const fromUrl = (s: string): Uint8Array<ArrayBuffer> => base64ToBytes(s.replace(/-/g, '+').replace(/_/g, '/'))
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromUrl(signature), new TextEncoder().encode(`${header}.${payload}`))
  if (!valid) return null
  return JSON.parse(new TextDecoder().decode(fromUrl(payload))) as Record<string, unknown>
}

export function createFakeGitHub(options: FakeGitHubOptions = {}): FakeGitHub {
  const owner = options.owner ?? 'owner'
  const repo = options.repo ?? 'data'
  const branch = options.branch ?? 'main'
  const now = options.now ?? Date.now
  const lifetime = options.tokenLifetimeMs ?? 60 * 60_000

  const blobs = new Map<string, string>()
  const trees = new Map<string, Map<string, string>>()
  const commits = new Map<string, Commit>()
  const refs = new Map<string, string>()
  const tokens = new Map<string, number>((options.tokens ?? ['test-token']).map(t => [t, Number.POSITIVE_INFINITY]))
  const failures: FakeResponse[] = []
  let counter = 0

  const putBlob = async (text: string): Promise<string> => {
    const sha = await gitBlobSha(text)
    blobs.set(sha, text)
    return sha
  }
  const putTree = async (entries: Map<string, string>): Promise<string> => {
    const sorted = new Map([...entries].sort(([a], [b]) => (a < b ? -1 : 1)))
    const sha = await sha1Hex(`tree\n${[...sorted].map(([p, s]) => `${p} ${s}`).join('\n')}`)
    trees.set(sha, sorted)
    return sha
  }
  const putCommit = async (commit: Commit): Promise<string> => {
    const sha = await sha1Hex(`commit ${commit.tree} ${commit.parents.join(',')} ${commit.message} ${counter++}`)
    commits.set(sha, commit)
    return sha
  }
  const isAncestor = (ancestor: string, of: string): boolean => {
    const stack = [of]
    const seen = new Set<string>()
    while (stack.length > 0) {
      const sha = stack.pop() as string
      if (sha === ancestor) return true
      if (seen.has(sha)) continue
      seen.add(sha)
      stack.push(...(commits.get(sha)?.parents ?? []))
    }
    return false
  }
  const commitOn = async (parent: string | null, changes: Record<string, string | null>, message: string): Promise<string> => {
    const entries = new Map(parent ? trees.get((commits.get(parent) as Commit).tree) : [])
    for (const [path, content] of Object.entries(changes)) {
      if (content === null) entries.delete(path)
      else entries.set(path, await putBlob(content))
    }
    return putCommit({ tree: await putTree(entries), parents: parent ? [parent] : [], message })
  }

  const fake: FakeGitHub = {
    owner,
    repo,
    branch,
    requests: [],
    tokensIssued: 0,

    async seed(files, message = 'Seed') {
      if (refs.has(branch)) throw new Error(`heads/${branch} already exists`)
      const sha = await commitOn(null, files, message)
      refs.set(branch, sha)
      return sha
    },

    async push(changes, message = 'Pushed by another writer') {
      const head = refs.get(branch)
      if (!head) throw new Error('Seed the branch first')
      const sha = await commitOn(head, changes, message)
      refs.set(branch, sha)
      return sha
    },

    head: () => refs.get(branch) ?? null,

    files(commit) {
      const sha = commit ?? refs.get(branch)
      const entries = sha ? trees.get(commits.get(sha)?.tree ?? '') : undefined
      return Object.fromEntries([...(entries ?? [])].map(([path, blob]) => [path, blobs.get(blob) as string]))
    },

    log() {
      const out: string[] = []
      for (let sha = refs.get(branch); sha; sha = commits.get(sha)?.parents[0]) out.push((commits.get(sha) as Commit).message)
      return out
    },

    failNext(response, times = 1) {
      for (let i = 0; i < times; i++) failures.push(response)
    },

    async fetch(input, init = {}) {
      const url = new URL(input)
      const method = (init.method ?? 'GET').toUpperCase()
      fake.requests.push(`${method} ${url.pathname}${url.search}`)
      const failure = failures.shift()
      if (failure) return json(failure.status, failure.body ?? { message: 'Injected failure' }, failure.headers)

      const headers = new Headers(init.headers)
      const bearer = /^Bearer (.+)$/.exec(headers.get('authorization') ?? '')?.[1] ?? ''
      const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {}
      const path = url.pathname

      // ── App endpoints (JWT) ──────────────────────────────────────────────
      const appRoute = /^\/repos\/([^/]+)\/([^/]+)\/installation$/.exec(path) ?? /^\/app\/installations\/(\d+)\/access_tokens$/.exec(path)
      if (appRoute) {
        if (!options.app) return json(404, { message: 'Not Found' })
        const claims = await verifyJwt(bearer, options.app.publicKey)
        const t = Math.floor(now() / 1000)
        if (!claims || claims.iss !== String(options.app.appId) || (claims.exp as number) <= t || (claims.iat as number) > t + 60) {
          return json(401, { message: 'A JSON web token could not be decoded' })
        }
        if (method === 'GET' && path.endsWith('/installation')) {
          if (appRoute[1] !== owner || appRoute[2] !== repo) return json(404, { message: 'Not Found' })
          return json(200, { id: options.app.installationId })
        }
        if (method === 'POST' && Number(appRoute[1]) === options.app.installationId) {
          const token = `ghs_fake_${++fake.tokensIssued}`
          const expiresAt = now() + lifetime
          tokens.set(token, expiresAt)
          return json(201, { token, expires_at: new Date(expiresAt).toISOString(), permissions: body.permissions ?? {}, repositories: body.repositories ?? [] })
        }
        return json(404, { message: 'Not Found' })
      }

      // ── Repository endpoints (installation token) ────────────────────────
      const expiry = tokens.get(bearer)
      if (expiry === undefined || expiry <= now()) return json(401, { message: 'Bad credentials' })
      const m = /^\/repos\/([^/]+)\/([^/]+)\/git\/(.+)$/.exec(path)
      if (!m || m[1] !== owner || m[2] !== repo) return json(404, { message: 'Not Found' })
      const rest = decodeURIComponent(m[3] as string)

      if (method === 'GET' && rest.startsWith('ref/heads/')) {
        const sha = refs.get(rest.slice('ref/heads/'.length))
        if (!sha) return json(404, { message: 'Not Found' })
        const etag = `W/"${sha}"`
        if (headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag } })
        return json(200, { ref: `refs/heads/${branch}`, object: { sha, type: 'commit' } }, { etag })
      }
      if (method === 'GET' && rest.startsWith('commits/')) {
        const sha = rest.slice('commits/'.length)
        const commit = commits.get(sha)
        if (!commit) return json(404, { message: 'Not Found' })
        return json(200, { sha, tree: { sha: commit.tree }, parents: commit.parents.map(p => ({ sha: p })), message: commit.message })
      }
      if (method === 'GET' && rest.startsWith('trees/')) {
        const sha = rest.slice('trees/'.length)
        const entries = trees.get(sha)
        if (!entries) return json(404, { message: 'Not Found' })
        const recursive = url.searchParams.get('recursive') !== null
        const dirs = new Set<string>()
        for (const p of entries.keys()) for (let i = p.indexOf('/'); i > 0; i = p.indexOf('/', i + 1)) dirs.add(p.slice(0, i))
        const listed = [
          ...[...dirs].map(d => ({ path: d, mode: '040000', type: 'tree', sha: `tree-${d}` })),
          ...[...entries].map(([p, s]) => ({ path: p, mode: '100644', type: 'blob', sha: s, size: new TextEncoder().encode(blobs.get(s) ?? '').length })),
        ].filter(e => recursive || !e.path.includes('/')).sort((a, b) => (a.path < b.path ? -1 : 1))
        return json(200, { sha, tree: listed, truncated: false })
      }
      if (method === 'GET' && rest.startsWith('blobs/')) {
        const sha = rest.slice('blobs/'.length)
        const text = blobs.get(sha)
        if (text === undefined) return json(404, { message: 'Not Found' })
        const content = `${textToBase64(text).replace(/.{60}/g, '$&\n')}\n`
        return json(200, { sha, size: new TextEncoder().encode(text).length, encoding: 'base64', content })
      }
      if (method === 'POST' && rest === 'trees') {
        const baseSha = body.base_tree as string | undefined
        const base = baseSha === undefined ? new Map<string, string>() : trees.get(baseSha)
        if (!base) return json(422, { message: 'Invalid tree info' })
        const entries = new Map(base)
        for (const e of body.tree as { path: string; content?: string; sha?: string | null }[]) {
          if (typeof e.content === 'string') entries.set(e.path, await putBlob(e.content))
          else if (e.sha === null) {
            if (!entries.has(e.path)) return json(422, { message: `tree.path ${e.path} does not exist in the base tree` })
            entries.delete(e.path)
          } else if (typeof e.sha === 'string' && blobs.has(e.sha)) entries.set(e.path, e.sha)
          else return json(422, { message: 'Invalid tree info' })
        }
        const sha = await putTree(entries)
        return json(201, { sha, tree: [...entries].map(([p, s]) => ({ path: p, sha: s, type: 'blob', mode: '100644' })), truncated: false })
      }
      if (method === 'POST' && rest === 'commits') {
        const tree = body.tree as string
        const parents = (body.parents as string[] | undefined) ?? []
        if (!trees.has(tree) || parents.some(p => !commits.has(p))) return json(422, { message: 'Invalid commit' })
        const sha = await putCommit({ tree, parents, message: typeof body.message === 'string' ? body.message : '' })
        return json(201, { sha, tree: { sha: tree }, parents: parents.map(p => ({ sha: p })), message: body.message })
      }
      if (method === 'PATCH' && rest.startsWith('refs/heads/')) {
        const name = rest.slice('refs/heads/'.length)
        const current = refs.get(name)
        const next = body.sha as string
        if (!current) return json(422, { message: 'Reference does not exist' })
        if (!commits.has(next)) return json(422, { message: 'Object does not exist' })
        if (body.force !== true && !isAncestor(current, next)) return json(422, { message: 'Update is not a fast forward' })
        refs.set(name, next)
        return json(200, { ref: `refs/heads/${name}`, object: { sha: next, type: 'commit' } })
      }
      return json(404, { message: 'Not Found' })
    },
  }
  return fake
}

/** A fresh RSA key pair for App tests, with the private key as PKCS#8 PEM (never committed). */
export async function generateAppKey(): Promise<{ privateKeyPem: string; publicKey: CryptoKey; pkcs8: Uint8Array<ArrayBuffer> }> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${bytesToBase64(pkcs8).replace(/.{64}/g, '$&\n')}\n-----END PRIVATE KEY-----\n`
  return { privateKeyPem, publicKey: pair.publicKey, pkcs8 }
}
