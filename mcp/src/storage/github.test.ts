import { describe, it, expect } from 'vitest'
import { GitHubStorage, type FetchLike } from './github'
import { NotFoundError } from './types'
import type { McpConfig } from '../config'

const config: McpConfig = {
  token: 'ghp_test', owner: 'carlofigs', repo: 'HECATE_Data', workspace: 'kickball',
}

/** Minimal stand-in for the bits of Response the adapter touches. */
function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? 'Not Found' : 'Error',
    json: async () => body,
  } as Response
}

function contentsResponse(value: unknown, sha = 'abc123'): Response {
  return res(200, { content: Buffer.from(JSON.stringify(value), 'utf8').toString('base64'), sha })
}

function storageReturning(response: Response | ((url: string) => Response)) {
  const calls: string[] = []
  const fetchImpl: FetchLike = async (url) => {
    calls.push(url)
    return typeof response === 'function' ? response(url) : response
  }
  return { storage: new GitHubStorage(config, fetchImpl), calls }
}

describe('listWorkspaces', () => {
  it('keeps real workspace directories and drops hidden, archived and infra ones', async () => {
    const { storage } = storageReturning(res(200, [
      { name: 'kickball', type: 'dir' },
      { name: 'woolworths', type: 'dir' },
      { name: '_edg_attribution', type: 'dir' },
      { name: '.github', type: 'dir' },
      { name: 'scripts', type: 'dir' },
      { name: 'README.md', type: 'file' },
    ]))
    expect(await storage.listWorkspaces()).toEqual(['kickball', 'woolworths'])
  })

  it('surfaces the GitHub error message rather than a bare status', async () => {
    const { storage } = storageReturning(res(401, { message: 'Bad credentials' }))
    await expect(storage.listWorkspaces()).rejects.toThrow('Bad credentials')
  })
})

describe('readFile', () => {
  it('requests the workspace-scoped path', async () => {
    const { storage, calls } = storageReturning(contentsResponse({ columns: [] }))
    await storage.readFile('kickball', 'tasks')
    expect(calls[0]).toBe('https://api.github.com/repos/carlofigs/HECATE_Data/contents/kickball/tasks.json')
  })

  it('decodes non-ASCII content correctly', async () => {
    const title = 'Café — naïve ✅'
    const { storage } = storageReturning(contentsResponse({
      columns: [{ id: 'c1', name: 'Backlog', tasks: [{ id: 't-a1', title, tags: [] }] }],
    }))
    const { data } = await storage.readFile('kickball', 'tasks')
    expect(data.columns[0].tasks[0].title).toBe(title)
  })

  it('returns the blob sha alongside the data', async () => {
    const { storage } = storageReturning(contentsResponse({ columns: [] }, 'deadbeef'))
    expect((await storage.readFile('kickball', 'tasks')).sha).toBe('deadbeef')
  })

  it('migrates on read, so an unversioned file arrives stamped', async () => {
    const { storage } = storageReturning(contentsResponse({ columns: [] }))
    const { data } = await storage.readFile('kickball', 'tasks')
    expect((data as { schemaVersion?: number }).schemaVersion).toBe(1)
  })

  // The guard from PR #11 has to hold on this side too: the server is the second
  // writer it was built for, so it must refuse a file a newer build wrote.
  it('refuses a file written by a newer build', async () => {
    const { storage } = storageReturning(contentsResponse({ columns: [], schemaVersion: 99 }))
    await expect(storage.readFile('kickball', 'tasks')).rejects.toThrow(/newer version of HECATE/)
  })

  it('validates structure, so a malformed file fails on read not at use', async () => {
    const { storage } = storageReturning(contentsResponse({ columns: 'not an array' }))
    await expect(storage.readFile('kickball', 'tasks')).rejects.toThrow(/malformed/)
  })

  it('raises NotFoundError for a missing file', async () => {
    const { storage } = storageReturning(res(404, { message: 'Not Found' }))
    await expect(storage.readFile('kickball', 'archive')).rejects.toThrow(NotFoundError)
  })

  it('reports undecodable content rather than throwing a raw parse error', async () => {
    const { storage } = storageReturning(res(200, { content: 'not-valid-base64-json!!', sha: 'x' }))
    await expect(storage.readFile('kickball', 'tasks')).rejects.toThrow(/could not be decoded/)
  })
})
