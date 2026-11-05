import { describe, expect, it } from 'vitest'
import { GitHubError } from './http.ts'
import { createGitStore, gitBlobSha, type GitStore, type Head } from './store.ts'
import { createFakeGitHub, type FakeGitHub } from './testing/fake-github.ts'

const SEED = {
  'README.md': '# data\n',
  'work/workspace.json': '{ "name": "Work" }\n',
  'work/focus/2026-11-02.json': '{ "lead": "🔴 Draft the scorecard — today" }\n',
  'work/tasks.json': '{ "tasks": [] }\n',
  'club/tasks.json': '{ "tasks": [] }\n',
}

async function setup(branch = 'main'): Promise<{ fake: FakeGitHub; store: GitStore; head: Head & { etag: string | null } }> {
  const fake = createFakeGitHub({ branch })
  await fake.seed(SEED)
  const store = createGitStore({ owner: fake.owner, repo: fake.repo, branch, token: () => Promise.resolve('test-token'), fetch: fake.fetch, sleep: () => Promise.resolve() })
  const head = await store.readHead()
  if ('unchanged' in head) throw new Error('expected a head')
  // As the Durable Object does: read the files before writing.
  await store.readFiles(head.tree, '')
  return { fake, store, head }
}

const requestsDuring = async (fake: FakeGitHub, run: () => Promise<unknown>): Promise<string[]> => {
  const before = fake.requests.length
  await run()
  return fake.requests.slice(before)
}

describe('gitBlobSha', () => {
  it('matches git', async () => {
    expect(await gitBlobSha('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
    expect(await gitBlobSha('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a')
  })
})

describe('readHead', () => {
  it('returns the head commit and its tree, and a 304 when it has not moved', async () => {
    const { fake, store, head } = await setup()
    expect(head).toMatchObject({ commit: fake.head(), etag: `W/"${fake.head()}"` })
    expect(typeof head.tree).toBe('string')
    const { etag } = head
    const requests = await requestsDuring(fake, async () => expect(await store.readHead({ etag })).toEqual({ unchanged: true }))
    expect(requests).toEqual([`GET /repos/owner/data/git/ref/heads/main`])

    const moved = await fake.push({ 'club/tasks.json': '{ "tasks": [1] }\n' })
    expect(await store.readHead({ etag })).toMatchObject({ commit: moved })
  })

  it('works on a branch with a slash in its name', async () => {
    const { fake, head } = await setup('data/v2')
    expect(head.commit).toBe(fake.head())
  })

  it('fails clearly on a missing branch or a bad token, without retrying', async () => {
    const { fake } = await setup()
    const missing = createGitStore({ owner: 'owner', repo: 'data', branch: 'nope', token: () => Promise.resolve('test-token'), fetch: fake.fetch })
    await expect(missing.readHead()).rejects.toMatchObject({ status: 404 })
    const before = fake.requests.length
    const bad = createGitStore({ owner: 'owner', repo: 'data', branch: 'main', token: () => Promise.resolve('wrong'), fetch: fake.fetch })
    await expect(bad.readHead()).rejects.toBeInstanceOf(GitHubError)
    expect(fake.requests.length - before).toBe(1)
  })
})

describe('readFiles', () => {
  it('returns the files under a directory, relative to it, with their blob SHAs', async () => {
    const { store, head } = await setup()
    const { files, shas } = await store.readFiles(head.tree, 'work')
    expect(files).toEqual({
      'focus/2026-11-02.json': SEED['work/focus/2026-11-02.json'],
      'tasks.json': SEED['work/tasks.json'],
      'workspace.json': SEED['work/workspace.json'],
    })
    expect(shas['tasks.json']).toBe(await gitBlobSha(SEED['work/tasks.json']))
    expect(Object.keys((await store.readFiles(head.tree, '')).files)).toHaveLength(5)
  })

  it('reads one blob by SHA, through the cache', async () => {
    const { fake, store, head } = await setup()
    const entry = (await store.readTree(head.tree)).find(e => e.path === 'work/workspace.json')
    expect(await requestsDuring(fake, async () => expect(await store.readBlob(entry?.sha ?? '')).toBe(SEED['work/workspace.json']))).toEqual([])
  })

  it('reads each blob once, and after an upstream change only what changed', async () => {
    const { fake, store, head } = await setup()
    expect(await requestsDuring(fake, () => store.readFiles(head.tree, 'work'))).toEqual([])

    await fake.push({ 'work/tasks.json': '{ "tasks": ["new"] }\n', 'club/tasks.json': 'elsewhere\n' })
    const requests = await requestsDuring(fake, async () => {
      const next = await store.readHead()
      if ('unchanged' in next) throw new Error('expected a new head')
      expect((await store.readFiles(next.tree, 'work')).files['tasks.json']).toBe('{ "tasks": ["new"] }\n')
    })
    expect(requests.map(r => r.replace(/[0-9a-f]{40}/g, '…'))).toEqual([
      'GET /repos/owner/data/git/ref/heads/main',
      'GET /repos/owner/data/git/commits/…',
      'GET /repos/owner/data/git/trees/…?recursive=1',
      'GET /repos/owner/data/git/blobs/…',
    ])
  })
})

describe('commitChanges', () => {
  it('writes adds, edits and deletes across files as one commit', async () => {
    const { fake, store, head } = await setup()
    const changes = {
      'work/people.json': '{ "people": [] }\n',
      'work/workspace.json': '{ "name": "Work", "policy": "sanitised" }\n',
      'work/focus/2026-11-02.json': null,
      'work/never-existed.json': null,
      'club/tasks.json': SEED['club/tasks.json'],
    }
    let result
    const requests = await requestsDuring(fake, async () => {
      result = await store.commitChanges({ parent: head, changes, message: 'Update work\n\nActor: app' })
    })
    expect(requests.map(r => r.split(' ').slice(0, 2).join(' '))).toEqual([
      'POST /repos/owner/data/git/trees', 'POST /repos/owner/data/git/commits', 'PATCH /repos/owner/data/git/refs/heads/main',
    ])
    expect(result).toMatchObject({ ok: true, commit: fake.head() })
    expect(result).toHaveProperty('blobs', {
      'work/people.json': await gitBlobSha(changes['work/people.json']),
      'work/workspace.json': await gitBlobSha(changes['work/workspace.json']),
      'work/focus/2026-11-02.json': null,
    })
    expect(fake.log()).toEqual(['Update work\n\nActor: app', 'Seed'])
    expect(fake.files()).toEqual({
      'README.md': SEED['README.md'],
      'club/tasks.json': SEED['club/tasks.json'],
      'work/people.json': changes['work/people.json'],
      'work/tasks.json': SEED['work/tasks.json'],
      'work/workspace.json': changes['work/workspace.json'],
    })
  })

  it('primes its caches with exactly what GitHub stored', async () => {
    const { fake, store, head } = await setup()
    const result = await store.commitChanges({ parent: head, changes: { 'work/tasks.json': '{ "tasks": ["🟢"] }\n' }, message: 'm' })
    if (!result.ok) throw new Error('expected success')
    const fresh = createGitStore({ owner: 'owner', repo: 'data', branch: 'main', token: () => Promise.resolve('test-token'), fetch: fake.fetch })
    expect(await requestsDuring(fake, () => store.readFiles(result.tree, 'work'))).toEqual([])
    expect(await store.readFiles(result.tree, 'work')).toEqual(await fresh.readFiles(result.tree, 'work'))
    expect(await store.readTree(result.tree)).toEqual(await fresh.readTree(result.tree))
  })

  it('reads the base tree first when it has not seen it', async () => {
    const { fake } = await setup()
    const cold = createGitStore({ owner: 'owner', repo: 'data', branch: 'main', token: () => Promise.resolve('test-token'), fetch: fake.fetch })
    const head = await cold.readHead()
    if ('unchanged' in head) throw new Error('expected a head')
    const requests = await requestsDuring(fake, () => cold.commitChanges({ parent: head, changes: { 'work/tasks.json': 'x\n' }, message: 'm' }))
    expect(requests.map(r => r.split(' ')[0])).toEqual(['GET', 'POST', 'POST', 'PATCH'])
    expect(fake.files()['work/tasks.json']).toBe('x\n')
  })

  it('makes no request when nothing would change', async () => {
    const { fake, store, head } = await setup()
    const requests = await requestsDuring(fake, async () => {
      expect(await store.commitChanges({ parent: head, changes: {}, message: 'm' })).toEqual({ ok: true, commit: head.commit, tree: head.tree, blobs: {} })
      expect(await store.commitChanges({ parent: head, changes: { 'work/tasks.json': SEED['work/tasks.json'], 'gone.json': null }, message: 'm' }))
        .toMatchObject({ ok: true, commit: head.commit })
    })
    expect(requests).toEqual([])
  })

  it('refuses unsafe paths', async () => {
    const { store, head } = await setup()
    for (const path of ['../x', '/x', 'a//b', 'a/', 'a/./b', 'a/../b', '.']) {
      await expect(store.commitChanges({ parent: head, changes: { [path]: 'x' }, message: 'm' })).rejects.toBeInstanceOf(RangeError)
    }
    await expect(store.commitChanges({ parent: head, changes: { '.github/x.yml': 'x' }, message: 'm' })).resolves.toMatchObject({ ok: true })
  })
})

describe('another writer moved the branch', () => {
  it('reports non-fast-forward, overwrites nothing, and the diff says what moved', async () => {
    const { fake, store, head } = await setup()
    const theirs = await fake.push({ 'club/tasks.json': 'theirs\n', 'work/notes.md': 'theirs\n' })
    const result = await store.commitChanges({ parent: head, changes: { 'work/workspace.json': 'mine\n' }, message: 'mine' })
    expect(result).toEqual({ ok: false, reason: 'non-fast-forward' })
    expect(fake.head()).toBe(theirs)
    expect(fake.files()['club/tasks.json']).toBe('theirs\n')
    expect(fake.files()['work/workspace.json']).toBe(SEED['work/workspace.json'])

    const next = await store.readHead()
    if ('unchanged' in next) throw new Error('expected a new head')
    expect(await store.diffTrees(head.tree, next.tree)).toEqual({ added: ['work/notes.md'], modified: ['club/tasks.json'], deleted: [] })
    expect(await store.diffTrees(head.tree, next.tree, 'work')).toEqual({ added: ['notes.md'], modified: [], deleted: [] })

    // None of my paths moved upstream, so rebuilding on the new head is safe.
    const retried = await store.commitChanges({ parent: next, changes: { 'work/workspace.json': 'mine\n' }, message: 'mine' })
    expect(retried).toMatchObject({ ok: true })
    expect(fake.files()).toMatchObject({ 'club/tasks.json': 'theirs\n', 'work/notes.md': 'theirs\n', 'work/workspace.json': 'mine\n' })
  })

  it('reports a deletion in the diff', async () => {
    const { fake, store, head } = await setup()
    await fake.push({ 'work/tasks.json': null })
    const next = await store.readHead()
    if ('unchanged' in next) throw new Error('expected a new head')
    expect(await store.diffTrees(head.tree, next.tree, 'work')).toEqual({ added: [], modified: [], deleted: ['tasks.json'] })
  })
})

describe('resilience', () => {
  it('rides out a secondary rate limit on a read', async () => {
    const { fake, store, head } = await setup()
    fake.failNext({ status: 403, headers: { 'retry-after': '1' }, body: { message: 'You have exceeded a secondary rate limit' } })
    expect((await store.readFiles(head.tree, 'work')).files['tasks.json']).toBe(SEED['work/tasks.json'])
  })
})
