/**
 * Test helpers: a valid v2 workspace built through @hecate/core's own ops,
 * seeded into the in-memory fake GitHub, and an engine wired to a fake clock
 * and alarm. Generic names only — this repository is public.
 */

import {
  applyBatch, changedFiles, CURRENT_VERSION, createUlid, emptyState, filesFromState, parseFile, prepareBatch, stateFromFiles,
} from '@hecate/core'
import { createGitStore, type Fetch } from '@hecate/github-store'
import { createFakeGitHub, type FakeGitHub } from '@hecate/github-store/testing'
import { WorkspaceEngine } from '../src/engine.ts'
import { memoryPersistence, type Persistence } from '../src/persistence.ts'
import type { WorkspaceRpc } from '../src/routes/workspace-rpc.ts'

const SEED_AT = '2026-11-04T23:00:00.000Z'
export const START = Date.parse('2026-11-05T00:00:00.000Z')
export const DIR = 'work'

/** Statuses, three tasks (A1, A2, B1). */
function workspaceFiles(): Record<string, string> {
  const workspace = parseFile('workspace', {
    schemaVersion: CURRENT_VERSION.workspace, name: 'Work', timezone: 'Australia/Sydney', policy: 'open', workdays: [1, 2, 3, 4, 5], sprint: null,
    statuses: [
      { id: 'to-do', name: 'To Do', category: 'todo' },
      { id: 'in-progress', name: 'In Progress', category: 'active' },
      { id: 'done', name: 'Done', category: 'done' },
      { id: 'not-doing', name: 'Not Doing', category: 'dropped' },
    ],
    tags: [], areas: [],
  })
  const batch = prepareBatch({
    ops: [
      { type: 'task.add', kind: 'action', title: 'Draft the scorecard' },
      { type: 'task.add', kind: 'action', title: 'Publish the scorecard' },
      { type: 'task.add', kind: 'waiting', title: 'Targets from finance', waitingOn: { text: 'Finance' } },
    ],
  }, { opId: 'seed', at: SEED_AT, actor: 'import', newId: createUlid({ now: () => Date.parse(SEED_AT) }) })
  const result = applyBatch(emptyState(workspace, SEED_AT), batch)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return filesFromState(result.state)
}

const under = (dir: string, files: Record<string, string | null>): Record<string, string | null> =>
  Object.fromEntries(Object.entries(files).map(([path, content]) => [`${dir}/${path}`, content]))

export async function seededFake(): Promise<FakeGitHub> {
  const fake = createFakeGitHub()
  await fake.seed({ 'README.md': '# Data\n', ...(under(DIR, workspaceFiles()) as Record<string, string>), 'club/notes.md': 'Another workspace\n' })
  return fake
}

/** Another writer applies ops to the workspace and pushes the result (as a Claude session with git access might). */
export async function pushOps(fake: FakeGitHub, ops: unknown[], message = 'Pushed by another writer'): Promise<void> {
  const prefix = `${DIR}/`
  const files = Object.fromEntries(Object.entries(fake.files()).filter(([p]) => p.startsWith(prefix)).map(([p, c]) => [p.slice(prefix.length), c]))
  const result = applyBatch(stateFromFiles(files), prepareBatch({ ops }, { opId: `upstream-${fake.requests.length}`, at: SEED_AT, actor: 'claude' }))
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  await fake.push(under(DIR, { ...changedFiles(result.state, result.changed), ...Object.fromEntries(result.deleted.map(p => [p, null])) }), message)
}

export interface Harness {
  fake: FakeGitHub
  persistence: Persistence
  engine: WorkspaceEngine
  /** A new engine over the same storage, as after the Durable Object is evicted. */
  restart(): WorkspaceEngine
  now(): number
  alarmAt(): number | null
  /** Advance the clock, firing the alarm if it falls due. */
  tick(ms: number): Promise<void>
  /** GitHub requests made since the harness started. */
  requests(): string[]
}

export async function harness(options: { dir?: string; fetch?: (fake: FakeGitHub) => Fetch } = {}): Promise<Harness> {
  const fake = await seededFake()
  let now = START
  let alarmAt: number | null = null
  const persistence = memoryPersistence()
  const start = fake.requests.length
  const make = (): WorkspaceEngine => {
    const blobs = new Map<string, string>()
    return new WorkspaceEngine({
      dir: options.dir ?? DIR,
      store: createGitStore({
        owner: fake.owner, repo: fake.repo, branch: fake.branch, token: () => Promise.resolve('test-token'),
        fetch: options.fetch ? options.fetch(fake) : fake.fetch, sleep: () => Promise.resolve(),
        blobCache: { get: sha => blobs.get(sha), set: (sha, text) => void blobs.set(sha, text) },
      }),
      blobs,
      persistence,
      alarm: { get: () => Promise.resolve(alarmAt), set: at => { alarmAt = at; return Promise.resolve() } },
      now: () => now,
      newId: createUlid({ now: () => now }),
      commitIntervalMs: 30_000,
      freshnessMs: 30_000,
      sleep: () => Promise.resolve(),
    })
  }
  const h: Harness = {
    fake,
    persistence,
    engine: make(),
    restart: () => (h.engine = make()),
    now: () => now,
    alarmAt: () => alarmAt,
    async tick(ms) {
      now += ms
      if (alarmAt !== null && alarmAt <= now) {
        alarmAt = null
        await h.engine.onAlarm()
      }
    },
    requests: () => fake.requests.slice(start),
  }
  return h
}

export const addTask = (title: string, ref = '$1') => ({ type: 'task.add', ref, kind: 'action', title })

/** A WorkspaceRpc over an engine in this process, as the Durable Object stub would be. */
export function rpcFor(engine: () => WorkspaceEngine): WorkspaceRpc {
  return {
    apply: (_dir, request) => engine().apply(request),
    snapshot: () => engine().snapshot(),
    flush: () => engine().flush(),
    refresh: () => engine().refresh(),
    read: (_dir, query) => engine().read(query),
    ackActivity: (_dir, cursor, upTo) => engine().ackActivity(cursor, upTo),
  }
}
