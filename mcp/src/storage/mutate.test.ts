import { describe, it, expect } from 'vitest'
import { GitHubStorage, type FetchLike } from './github'
import { ConflictError } from './types'
import type { McpConfig } from '../config'
import type { TasksData } from '../../../src/lib/schemas'

const config: McpConfig = {
  token: 'ghp_test', owner: 'carlofigs', repo: 'HECATE_Data', workspace: 'kickball',
}

function col(id: string, name: string, tasks: { id: string }[] = []) {
  return { id, name, tasks: tasks as never[] }
}

/**
 * A stand-in remote holding one file. `conflictsRemaining` makes the next N PUTs
 * fail the way GitHub does when the supplied SHA is stale, optionally mutating
 * the stored content first to simulate another writer having landed.
 */
function fakeRemote(initial: unknown, opts: { conflicts?: number; onConflict?: (doc: TasksData) => void } = {}) {
  let doc = initial
  let sha = 'sha-0'
  let conflictsRemaining = opts.conflicts ?? 0
  const puts: { sha: string; doc: TasksData }[] = []
  let gets = 0

  const fetchImpl: FetchLike = async (_url, init) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(init.body!) as { content: string; sha: string }
      const sent = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')) as TasksData
      if (conflictsRemaining > 0) {
        conflictsRemaining--
        opts.onConflict?.(doc as TasksData)   // another writer lands between our read and write
        sha = `sha-${puts.length + 1}-remote`
        return { ok: false, status: 409, statusText: 'Conflict', json: async () => ({ message: 'is at' }) } as Response
      }
      puts.push({ sha: body.sha, doc: sent })
      doc = sent
      sha = `sha-${puts.length}`
      return { ok: true, status: 200, json: async () => ({ content: { sha } }) } as Response
    }
    gets++
    return {
      ok: true, status: 200, json: async () => ({
        content: Buffer.from(JSON.stringify(doc), 'utf8').toString('base64'), sha,
      }),
    } as Response
  }

  return {
    storage: new GitHubStorage(config, fetchImpl),
    puts,
    get gets() { return gets },
    get doc() { return doc as TasksData },
  }
}

describe('mutateFile', () => {
  it('reads, applies the mutation, and writes it back', async () => {
    const remote = fakeRemote({ columns: [col('c1', 'Backlog')] })
    await remote.storage.mutateFile('kickball', 'tasks', data => {
      data.columns[0].tasks.push({ id: 't-a1' } as never)
    }, 'test')

    expect(remote.puts).toHaveLength(1)
    expect(remote.doc.columns[0].tasks.map(t => t.id)).toEqual(['t-a1'])
  })

  it('sends the sha it read, so a stale write is rejected rather than silently winning', async () => {
    const remote = fakeRemote({ columns: [col('c1', 'Backlog')] })
    await remote.storage.mutateFile('kickball', 'tasks', () => {}, 'test')
    expect(remote.puts[0].sha).toBe('sha-0')
  })

  it('stamps schemaVersion on the way through, since the read migrates', async () => {
    const remote = fakeRemote({ columns: [col('c1', 'Backlog')] })
    await remote.storage.mutateFile('kickball', 'tasks', () => {}, 'test')
    expect((remote.doc as { schemaVersion?: number }).schemaVersion).toBe(1)
  })

  // The property that justifies scoped verbs over whole-file writes: a retry
  // re-reads, so a concurrent change to a different path is preserved rather
  // than overwritten by our stale copy.
  it('re-applies the mutation to fresh data on conflict, keeping the other writer\'s change', async () => {
    const remote = fakeRemote(
      { columns: [col('c1', 'Backlog')] },
      {
        conflicts: 1,
        onConflict: doc => { doc.columns.push(col('c2', 'Done') as never) },
      },
    )

    await remote.storage.mutateFile('kickball', 'tasks', data => {
      data.columns[0].tasks.push({ id: 't-mine' } as never)
    }, 'test')

    // Our task landed …
    expect(remote.doc.columns[0].tasks.map(t => t.id)).toEqual(['t-mine'])
    // … and so did the column that appeared underneath us.
    expect(remote.doc.columns.map(c => c.name)).toEqual(['Backlog', 'Done'])
    expect(remote.gets).toBe(2)
    expect(remote.puts).toHaveLength(1)
  })

  it('gives up after one retry rather than looping', async () => {
    const remote = fakeRemote({ columns: [col('c1', 'Backlog')] }, { conflicts: 5 })
    await expect(
      remote.storage.mutateFile('kickball', 'tasks', () => {}, 'test'),
    ).rejects.toThrow(ConflictError)
    expect(remote.gets).toBe(2)
    expect(remote.puts).toHaveLength(0)
  })

  it('refuses to write a shape the app could not load', async () => {
    const remote = fakeRemote({ columns: [col('c1', 'Backlog')] })
    await expect(
      remote.storage.mutateFile('kickball', 'tasks', data => {
        ;(data as { columns: unknown }).columns = 'not an array'
      }, 'test'),
    ).rejects.toThrow(/malformed/)
    expect(remote.puts).toHaveLength(0)
  })

  it('propagates a non-conflict failure without retrying', async () => {
    const fetchImpl: FetchLike = async (_url, init) => {
      if (init?.method === 'PUT') {
        return { ok: false, status: 403, statusText: 'Forbidden',
                 json: async () => ({ message: 'Resource not accessible by personal access token' }) } as Response
      }
      return { ok: true, status: 200, json: async () => ({
        content: Buffer.from(JSON.stringify({ columns: [] }), 'utf8').toString('base64'), sha: 's',
      }) } as Response
    }
    const storage = new GitHubStorage(config, fetchImpl)
    await expect(storage.mutateFile('kickball', 'tasks', () => {}, 'test'))
      .rejects.toThrow(/not accessible by personal access token/)
  })
})
