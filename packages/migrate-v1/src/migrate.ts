/**
 * migrate.ts — one v1 workspace to the v2 file tree (ADR 0008).
 *
 * migrateWorkspace is pure and deterministic: the same v1 files, config and
 * `at` always give the same bytes. It builds v2 files directly rather than
 * through ops, because the migration must keep what ops would replace: v1's
 * own task numbers (t-a89 stays A89) and timestamps. Every file is still
 * validated by its schema, and the whole tree is loaded and checked with the
 * same code every v2 reader uses, before the result counts as ready.
 */

import { generateNKeysBetween } from 'fractional-indexing'
import {
  CURRENT_VERSION, Instant, IsoDate, addDays, checkWorkspace, findPossibleNames, formatWeekOf, isoWeekKey, mondayOf,
  parseActivityLog, parseFile, serializeActivityEntry, serializeFile, slugify, sprintOf, stateFromFiles, todayIn,
  WorkspaceLoadError, type JsonFileKind, type StatusCategory, type WorkspaceState,
} from '@hecate/core'
import type { ResolvedConfig } from './config.ts'
import { FIELD_MAP, entryFor } from './fields.ts'
import { Counter, type KeyStats, type Problem, type WorkspaceReport } from './report.ts'
import { createSanitiser, type Sanitiser } from './sanitise.ts'
import { stableId } from './stable-id.ts'
import { cell, rewriteRefs, slugAllocator, toLine, toMarkdown } from './text.ts'
import { readV1, type V1ArchivedTask, type V1Data, type V1Files, type V1Snapshot, type V1Task } from './v1.ts'

export interface MigrateResult {
  /** Workspace-relative path → file content, ready to write. */
  files: Record<string, string>
  report: WorkspaceReport
  /** Sanitised workspaces: name-like phrases left in text. Local review only; never in the report. */
  possibleNames: string[]
}

type Prefix = 'A' | 'B'

/** A task on the board or in the archive, before it becomes a v2 task. */
interface Candidate {
  seq: number
  source: 'open' | 'archived'
  v1Id: string | null
  /** Creation time (ms), for allocating fresh keys in order. */
  time: number
  key: string | null
  keepLegacyId: boolean
  open?: { column: number; task: V1Task }
  archived?: { monday: IsoDate; bucket: 'done' | 'dropped'; task: V1ArchivedTask; archivedAt: string }
}

const CLAIM = /^t-([ab])([1-9]\d*)$/i
const SERIES = /^t-([ab])(?:\d|-|$)/i

const CATEGORY_FROM_TYPE: Record<string, StatusCategory> = {
  backlog: 'backlog',
  'in-progress': 'active',
  done: 'done',
  'not-doing': 'dropped',
}

const DEFAULT_STATUS: Record<'todo' | 'active' | 'done' | 'dropped', string> = {
  todo: 'To Do',
  active: 'In Progress',
  done: 'Done',
  dropped: 'Not Doing',
}

function inferCategory(name: string): StatusCategory {
  const n = name.toLowerCase()
  if (/not[\s_-]*doing|won'?t|drop|cancel/.test(n)) return 'dropped'
  if (/\bdone\b|complete|closed|finished/.test(n)) return 'done'
  if (/progress|review|block|doing|wip|active/.test(n)) return 'active'
  if (/backlog|icebox|someday|later/.test(n)) return 'backlog'
  return 'todo'
}

const PROJECT_STATUS: Record<string, string> = {
  active: 'active', 'in-progress': 'active', paused: 'paused', completed: 'done', planned: 'planned', blocked: 'blocked',
}
const TIMELINE_STATUS: Record<string, string> = { completed: 'done', active: 'active', pending: 'pending', deferred: 'deferred' }
const OQ_STATUS = new Set(['open', 'resolved', 'deferred'])
const URGENCY: Record<string, 'high' | 'med' | 'low'> = { high: 'high', medium: 'med', low: 'low' }

/** Compare strings with digit runs as numbers: `w-2` < `w-10`. No ICU, so every runtime agrees. */
function naturalCompare(a: string, b: string): number {
  const split = (v: string): string[] => v.toLowerCase().match(/\d+|\D+/g) ?? []
  const x = split(a)
  const y = split(b)
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const p = x[i] as string
    const q = y[i] as string
    if (p === q) continue
    const bothNumbers = /^\d/.test(p) && /^\d/.test(q)
    if (bothNumbers && Number(p) !== Number(q)) return Number(p) - Number(q)
    return p < q ? -1 : 1
  }
  return x.length - y.length
}

const IDENTITY: Sanitiser = { text: v => v, slug: v => v, roles: [], count: 0, rolesWithNames: 0 }

export function migrateWorkspace(dir: string, v1Files: V1Files, config: ResolvedConfig, options: { at: string }): MigrateResult {
  const at = Instant.parse(options.at)
  const atMs = Date.parse(at)
  const counter = new Counter()
  const errors: Problem[] = []
  const warnings: Problem[] = []
  const v1 = readV1(v1Files)
  for (const p of v1.problems) errors.push({ path: `${p.file}.json (v1)`, message: p.message })
  const d: V1Data = v1.data
  const seed = (s: string): string => `${dir}:${s}`
  const sanitised = config.policy === 'sanitised'

  // ─── Time helpers ─────────────────────────────────────────────────────────
  const instant = (value: string | null, fallback: string): string => {
    if (value !== null && Instant.safeParse(value).success) return value
    counter.add('invalid-time')
    return fallback
  }
  const ms = (value: string): number => Date.parse(value)
  const date = (value: string | null): IsoDate | null => {
    if (value === null || value === '') return null
    const parsed = IsoDate.safeParse(value)
    if (parsed.success) return parsed.data
    counter.add('invalid-date')
    return null
  }
  const weekMonday = (weekOf: string, where: string): IsoDate | null => {
    const parsed = IsoDate.safeParse(weekOf)
    if (!parsed.success) {
      errors.push({ path: where, message: `weekOf ${JSON.stringify(weekOf)} is not a date` })
      return null
    }
    const monday = mondayOf(parsed.data)
    if (monday !== parsed.data) counter.add('week-moved')
    return monday
  }
  const memoryAt = instant(d.memory.updatedAt ?? at, at)

  // ─── Sanitising ───────────────────────────────────────────────────────────
  const s: Sanitiser = sanitised
    ? createSanitiser(d.memory.people.map(p => ({ name: p.name, aliases: p.aliases, role: toLine(p.role, new Counter()) ?? 'Person' })), config.replacements)
    : IDENTITY
  counter.add('role-had-name', s.rolesWithNames)

  // ─── Statuses ─────────────────────────────────────────────────────────────
  const statusSlug = slugAllocator()
  const statuses: { id: string; name: string; category: StatusCategory }[] = d.tasks.columns.map(c => {
    let category: StatusCategory
    if (c.columnType && CATEGORY_FROM_TYPE[c.columnType]) category = CATEGORY_FROM_TYPE[c.columnType] as StatusCategory
    else {
      counter.add(c.columnType ? 'unknown-value' : 'category-inferred')
      category = inferCategory(c.name)
    }
    const name = toLine(c.name, counter) ?? 'Untitled'
    return { id: statusSlug(name, 'status'), name, category }
  })
  for (const category of ['todo', 'active', 'done', 'dropped'] as const) {
    if (!statuses.some(st => st.category === category)) {
      statuses.push({ id: statusSlug(DEFAULT_STATUS[category], category), name: DEFAULT_STATUS[category], category })
      counter.add('status-added')
    }
  }
  const categoryOf = new Map(statuses.map(st => [st.id, st.category]))
  const firstOf = (category: StatusCategory): string => statuses.find(st => st.category === category)?.id ?? category

  // ─── Keys ─────────────────────────────────────────────────────────────────
  let seq = 0
  const candidates: Candidate[] = []
  d.tasks.columns.forEach((c, column) => {
    for (const task of c.tasks) {
      const created = task.createdAt !== null && Instant.safeParse(task.createdAt).success ? ms(task.createdAt) : atMs
      candidates.push({ seq: seq++, source: 'open', v1Id: task.id, time: created, key: null, keepLegacyId: false, open: { column, task } })
    }
  })
  const keys: KeyStats = {
    open: candidates.length, archived: 0, fromId: 0, fresh: 0, duplicateOpen: 0,
    archivedDuplicates: 0, archivedAlsoOpen: 0, archivedWithoutId: 0, nextKey: { A: 1, B: 1 },
  }

  const archiveWeeks = d.archive.weeks
    .map((w, i) => ({ w, i, monday: weekMonday(w.weekOf, `archive.json weeks[${i}]`) }))
    .filter((x): x is { w: (typeof d.archive.weeks)[number]; i: number; monday: IsoDate } => x.monday !== null)
    .sort((a, b) => a.monday.localeCompare(b.monday) || a.w.weekOf.localeCompare(b.w.weekOf) || a.i - b.i)
  const openIds = new Set(candidates.flatMap(c => (c.v1Id ? [c.v1Id.toLowerCase()] : [])))
  const archivedIds = new Set<string>()
  for (const { w, monday } of archiveWeeks) {
    const archivedAt = instant(w.archivedAt, `${monday}T00:00:00.000Z`)
    for (const [bucket, list] of [['done', w.done], ['dropped', w.notDoing]] as const) {
      for (const task of list) {
        const id = task.id?.toLowerCase() ?? null
        if (id === null) keys.archivedWithoutId++
        else if (openIds.has(id)) {
          keys.archivedAlsoOpen++
          continue
        } else if (archivedIds.has(id)) {
          keys.archivedDuplicates++
          continue
        }
        if (id !== null) archivedIds.add(id)
        candidates.push({
          seq: seq++, source: 'archived', v1Id: task.id, time: ms(archivedAt), key: null, keepLegacyId: false,
          archived: { monday, bucket, task, archivedAt },
        })
        counter.add('archived-times')
      }
    }
  }
  keys.archived = candidates.length - keys.open

  const owner = new Map<string, Candidate>()
  const claimed = { A: new Set<number>(), B: new Set<number>() }
  for (const c of candidates) {
    if (c.v1Id === null) continue
    const id = c.v1Id.toLowerCase()
    if (owner.has(id)) {
      keys.duplicateOpen++
      continue
    }
    owner.set(id, c)
    c.keepLegacyId = true
    const m = CLAIM.exec(c.v1Id)
    if (m) {
      const prefix = (m[1] as string).toUpperCase() as Prefix
      const n = Number(m[2])
      if (!claimed[prefix].has(n)) {
        claimed[prefix].add(n)
        c.key = `${prefix}${n}`
        keys.fromId++
      }
    }
  }
  const max = { A: Math.max(0, ...claimed.A), B: Math.max(0, ...claimed.B) }
  const prefixOf = (c: Candidate): Prefix => ((c.v1Id && SERIES.exec(c.v1Id)?.[1]?.toUpperCase()) === 'B' ? 'B' : 'A')
  // Creation order; ties (v1 imports stamped many tasks at once) by the v1 id, so w-01 comes before w-05.
  const fresh = [...candidates].filter(x => x.key === null)
  fresh.sort((a, b) => a.time - b.time || naturalCompare(a.v1Id ?? '', b.v1Id ?? '') || a.seq - b.seq)
  for (const c of fresh) {
    const prefix = prefixOf(c)
    c.key = `${prefix}${++max[prefix]}`
    keys.fresh++
  }
  keys.nextKey = { A: max.A + 1, B: max.B + 1 }
  const keyOf = (v1Id: string): string | null => owner.get(v1Id.toLowerCase())?.key ?? null

  // ─── Text pipeline: references → keys, then names → roles ─────────────────
  const prose = (value: string | null): { text: string | null; keys: string[] } => {
    if (value === null) return { text: null, keys: [] }
    const r = rewriteRefs(value, keyOf, counter)
    return { text: s.text(r.text), keys: r.keys }
  }
  const md = (value: string | null): string | null => toMarkdown(prose(value).text)
  const line = (value: string | null): string | null => toLine(prose(value).text, counter)
  const titled = (value: string | null, placeholder: string): string => {
    const out = line(value)
    if (out === null) counter.add('untitled')
    return out ?? placeholder
  }

  // ─── Tags and projects ────────────────────────────────────────────────────
  const tagSlug = (raw: string): string => s.slug(slugify(s.text(raw)))
  const tags = new Map<string, string | null>()
  const taskTags = (raw: readonly string[]): string[] => {
    const out: string[] = []
    for (const t of raw) {
      const slug = tagSlug(t)
      if (slug === '' || out.includes(slug)) continue
      out.push(slug)
      if (!tags.has(slug)) {
        const label = toLine(s.text(t.replace(/^#/, '')), counter)
        tags.set(slug, label === slug ? null : label)
      }
    }
    return out
  }

  const projectSlug = slugAllocator()
  const projects = d.projects.projects.map(p => {
    const slug = projectSlug(s.slug(slugify(p.id.replace(/^p-/i, ''))), s.slug(slugify(p.name)) || 'project')
    let updatedAt: string
    if (p.updatedAt !== null && IsoDate.safeParse(p.updatedAt).success) {
      updatedAt = `${p.updatedAt}T00:00:00.000Z`
      counter.add('date-to-instant')
    } else updatedAt = instant(p.updatedAt, at)
    return { v1: p, slug, updatedAt, id: stableId(seed(`project:${p.id}`), ms(updatedAt)) }
  })
  const projectOfTag = new Map<string, string>()
  for (const p of projects) {
    if (!p.v1.tag) continue
    const slug = tagSlug(p.v1.tag)
    if (slug === '') continue
    if (projectOfTag.has(slug)) counter.add('tag-conflict')
    else projectOfTag.set(slug, p.id)
  }
  const projectFor = (slugs: readonly string[]): string | null => {
    for (const t of slugs) {
      const id = projectOfTag.get(t)
      if (id) return id
    }
    return null
  }

  // ─── Tasks ────────────────────────────────────────────────────────────────
  const taskSeed = (c: Candidate): string => (c.keepLegacyId ? `task:${c.v1Id}` : `task:#${c.seq}`)
  const buildTask = (c: Candidate, status: string, order: string, times: { createdAt: string; updatedAt: string; completedAt: string | null }, extra: { urgency: string | null; note: string | null }, raw: { title: string; tags: readonly string[] }) => {
    const slugs = taskTags(raw.tags)
    const projectId = projectFor(slugs)
    if (projectId) counter.add('project-linked')
    const prefix = (c.key as string).charAt(0) as Prefix
    return {
      id: stableId(seed(taskSeed(c)), c.time),
      key: c.key,
      legacyIds: c.keepLegacyId && c.v1Id ? [c.v1Id] : [],
      kind: prefix === 'B' ? 'waiting' : 'action',
      title: titled(raw.title, '(untitled)'),
      note: extra.note,
      status,
      order,
      urgency: extra.urgency,
      tags: slugs,
      projectId,
      waitingOn: null,
      dependsOn: [],
      due: null,
      ...times,
    }
  }

  const openTasks: unknown[] = []
  d.tasks.columns.forEach((_, column) => {
    const inColumn = candidates.filter(c => c.open?.column === column)
    const orders = generateNKeysBetween(null, null, inColumn.length)
    const status = statuses[column]?.id as string
    const finished = ['done', 'dropped'].includes(categoryOf.get(status) ?? '')
    inColumn.forEach((c, i) => {
      const t = (c.open as { task: V1Task }).task
      const createdAt = instant(t.createdAt, at)
      const updatedAt = instant(t.updatedAt, createdAt)
      if (finished) counter.add('completed-at')
      let note = md(t.note)
      if (t.blockedSince) {
        note = `${note ? `${note}\n\n` : ''}Blocked since ${t.blockedSince}.`
        counter.add('blocked-since')
      }
      let urgency: string | null = null
      if (t.priority !== null) {
        urgency = URGENCY[t.priority] ?? null
        if (urgency === null) counter.add('unknown-value')
      }
      openTasks.push(buildTask(c, status, orders[i] as string, { createdAt, updatedAt, completedAt: finished ? updatedAt : null }, { urgency, note }, t))
    })
  })

  const archivedTask = (c: Candidate, order: string): unknown => {
    const a = c.archived as NonNullable<Candidate['archived']>
    const status = firstOf(a.bucket)
    return buildTask(c, status, order, { createdAt: a.archivedAt, updatedAt: a.archivedAt, completedAt: a.archivedAt }, { urgency: null, note: md(a.task.note) }, a.task)
  }

  // ─── Focus ────────────────────────────────────────────────────────────────
  const focusFiles: { path: string; raw: unknown; sections: number }[] = []
  if (d.focus) {
    const f = d.focus
    counter.add('calendar-dropped', f.calendarEvents.length)
    const label = toLine(f.sprintLabel, counter)
    if (f.sections.length === 0 && label === null) counter.add('focus-empty')
    else {
      const monday = weekMonday(f.weekOf, 'focus.json')
      if (monday) {
        const sectionId = slugAllocator()
        const sections = [
          ...(label ? [{ id: sectionId('sprint', 'sprint'), title: 'Sprint', content: s.text(label) }] : []),
          ...f.sections.map(sec => ({
            id: sectionId(sec.id ?? sec.title ?? '', 'section'),
            title: titled(sec.title, 'Untitled'),
            content: prose(sec.content ?? '').text ?? '',
          })),
        ]
        focusFiles.push({
          path: `focus/${monday}.json`,
          sections: sections.length,
          raw: {
            schemaVersion: CURRENT_VERSION.focusWeek, weekOf: monday, updatedAt: instant(f.updatedAt, at), scheduleCapturedAt: null,
            schedule: [], days: [], callouts: [], priorities: [], lastWeek: [], sections,
          },
        })
      }
    }
  }

  // ─── Projects ─────────────────────────────────────────────────────────────
  const memoryNotes: { name: string; summary: string }[] = []
  const summaryFromMemory = new Map<string, string>()
  for (const mp of d.memory.projects) {
    const summary = md(mp.summary)
    if (summary === null) continue
    const match = projects.find(p => p.v1.name.trim().toLowerCase() === mp.name.trim().toLowerCase() && toMarkdown(p.v1.summary) === null && !summaryFromMemory.has(p.slug))
    if (match) {
      summaryFromMemory.set(match.slug, summary)
      counter.add('summary-from-memory')
    } else {
      memoryNotes.push({ name: titled(mp.name, 'Project'), summary })
      counter.add('memory-project-notes')
    }
  }

  const projectFiles = projects.map(({ v1: p, slug, updatedAt, id }) => {
    const t = ms(updatedAt)
    let status = PROJECT_STATUS[p.status ?? ''] ?? null
    if (status === null) {
      counter.add('unknown-value')
      status = 'active'
    }
    const used = new Set<number>()
    const numbered = p.openQuestions.map(q => {
      const n = Number(/^oq-0*([1-9]\d*)$/i.exec(q.id ?? '')?.[1] ?? NaN)
      if (Number.isInteger(n) && !used.has(n)) {
        used.add(n)
        return n
      }
      return null
    })
    let nextN = Math.max(0, ...used)
    const openQuestions = p.openQuestions.map((q, i) => {
      let n = numbered[i] ?? null
      if (n === null) {
        n = ++nextN
        counter.add('oq-renumbered')
      }
      let qStatus = q.status ?? 'open'
      if (!OQ_STATUS.has(qStatus)) {
        counter.add('unknown-value')
        qStatus = 'open'
      }
      const question = prose(q.question ?? '')
      const resolution = prose(q.resolution)
      let resolutionText = toMarkdown(resolution.text)
      if (qStatus === 'resolved' && resolutionText === null) {
        resolutionText = 'Resolved in v1; no resolution was recorded.'
        counter.add('resolution-missing')
      }
      if (toMarkdown(question.text) === null) counter.add('untitled')
      return {
        id: stableId(seed(`oq:${p.id}:${i}`), t), n, question: toMarkdown(question.text) ?? '(no question recorded)', blocker: q.blocker,
        status: qStatus, resolution: resolutionText, keys: [...new Set([...question.keys, ...resolution.keys])],
      }
    })
    const next = prose(p.nextAction)
    const nextText = toLine(next.text, counter)
    const sectionId = slugAllocator()
    const sections = p.sections.map(sec => ({ id: sectionId(sec.id ?? sec.title ?? '', 'section'), title: titled(sec.title, 'Untitled'), content: prose(sec.content ?? '').text ?? '' }))
    if (p.models.length > 0) {
      const rows = p.models.map(m => `| ${[m.name, m.layer, m.materialisationDev, m.materialisationProd, m.status].map(v => cell(s.text(v ?? ''))).join(' | ')} |`)
      sections.push({ id: sectionId('models', 'models'), title: 'Models', content: ['| Model | Layer | Dev | Prod | Status |', '|---|---|---|---|---|', ...rows].join('\n') })
    }
    return {
      path: `projects/${slug}.json`,
      openQuestions: openQuestions.length,
      raw: {
        schemaVersion: CURRENT_VERSION.project,
        id,
        slug,
        name: titled(p.name, slug),
        subtitle: line(p.subtitle),
        summary: md(p.summary) ?? summaryFromMemory.get(slug) ?? null,
        status,
        phase: line(p.phase),
        currentFocus: md(p.currentFocus),
        owner: line(p.owner),
        refs: [
          ...(line(p.jira) ? [{ label: 'Jira', value: line(p.jira) }] : []),
          ...(line(p.branch) ? [{ label: 'Branch', value: line(p.branch) }] : []),
        ],
        deadlines: [],
        cutoffs: [],
        openQuestions,
        nextActions: nextText ? [{ id: stableId(seed(`next:${p.id}`), t), text: nextText, keys: next.keys }] : [],
        timeline: p.timeline.map((e, i) => {
          let tStatus = TIMELINE_STATUS[e.status ?? ''] ?? null
          if (tStatus === null) {
            counter.add('unknown-value')
            tStatus = 'pending'
          }
          return { id: stableId(seed(`timeline:${p.id}:${i}`), t), phase: titled(e.phase, 'Phase'), start: date(e.start), end: date(e.end), status: tStatus }
        }),
        sections,
        updatedAt,
      },
    }
  })

  // ─── Legacy sprints: archive weeks and week logs ──────────────────────────
  const logWeeks = d.weekly_log.weeks
    .map((w, i) => ({ w, monday: weekMonday(w.weekOf, `weekly_log.json weeks[${i}]`) }))
    .filter((x): x is { w: (typeof d.weekly_log.weeks)[number]; monday: IsoDate } => x.monday !== null)
  const mondays = [...new Set([...archiveWeeks.map(a => a.monday), ...logWeeks.map(l => l.monday)])].sort()
  const cadence = config.sprint
  const sprintOfMonday = new Map<string, { n: number; start: IsoDate; end: IsoDate }>()
  mondays.forEach((monday, i) => {
    if (cadence) sprintOfMonday.set(monday, sprintOf(monday, cadence))
    else sprintOfMonday.set(monday, { n: i - mondays.length, start: monday, end: addDays(monday, 6) })
  })
  const sprintNumbers = [...new Set([...sprintOfMonday.values()].map(x => x.n))].sort((a, b) => a - b)

  const snapshotItem = (snap: V1Snapshot): string => {
    const key = snap.id ? keyOf(snap.id) : null
    if (snap.id && key === null) counter.add('snapshot-unmatched')
    const title = titled(snap.title, '(untitled)')
    const tagText = snap.tags.map(tagSlug).filter(Boolean).map(t => `#${t}`).join(' ')
    const note = md(snap.note)
    let item = `- ${key ? `**${key}** ` : ''}${title}${tagText ? ` ${tagText}` : ''}`
    if (note && !note.includes('\n')) item += ` — ${note.trim()}`
    else if (note) item += `\n${note.trim().split('\n').map(l => (l ? `  ${l}` : l)).join('\n')}`
    return item
  }

  const sprintFiles = sprintNumbers.map(n => {
    const weeks = mondays.filter(m => sprintOfMonday.get(m)?.n === n)
    const range = sprintOfMonday.get(weeks[0] as string) as { start: IsoDate; end: IsoDate }
    const inSprint = candidates.filter(c => c.archived && weeks.includes(c.archived.monday))
    const doneC = inSprint.filter(c => c.archived?.bucket === 'done')
    const droppedC = inSprint.filter(c => c.archived?.bucket === 'dropped')
    const doneOrders = generateNKeysBetween(null, null, doneC.length)
    const droppedOrders = generateNKeysBetween(null, null, droppedC.length)
    const archivedAts = archiveWeeks.filter(a => weeks.includes(a.monday)).map(a => a.w.archivedAt).filter((x): x is string => x !== null && Instant.safeParse(x).success).sort()
    const logs = logWeeks.filter(l => weeks.includes(l.monday))
    const generatedAts = logs.map(l => l.w.generatedAt).filter((x): x is string => x !== null && Instant.safeParse(x).success).sort()
    const closedAt = archivedAts.at(-1) ?? generatedAts.at(-1) ?? null

    const sectionId = slugAllocator()
    const sections: { id: string; title: string; content: string }[] = []
    const multi = weeks.length > 1
    for (const { w, monday } of logs.sort((a, b) => a.monday.localeCompare(b.monday))) {
      const add = (idBase: string, title: string, content: string | null): void => {
        if (content === null || content.trim() === '') return
        sections.push({
          id: sectionId(multi ? `${monday}-${idBase}` : idBase, 'section'),
          title: multi ? `Week of ${formatWeekOf(monday)} — ${title}` : title,
          content,
        })
      }
      const list = (items: readonly V1Snapshot[]): string | null => (items.length > 0 ? items.map(snapshotItem).join('\n') : null)
      add('completed', 'Completed', list(w.completed))
      add('carried-forward', 'Carried forward', list(w.carriedForward))
      add('delayed', 'Delayed', list(w.delayed))
      const nextWeek = w.nextWeek.map(x => md(x)).filter((x): x is string => x !== null)
      add('next-week', 'Next week', nextWeek.length > 0 ? nextWeek.map(x => `- ${x.trim()}`).join('\n') : null)
      add('meetings', 'Meetings and discussions', md(w.narrative?.meetingsAndDiscussions ?? null))
      add('decisions', 'Decisions made', md(w.narrative?.decisionsMade ?? null))
      add('frustrations', 'Frustrations', md(w.narrative?.frustrations ?? null))
      for (const [person, content] of Object.entries(w.narrative?.oneOnOnePrep?.sections ?? {})) {
        let who = toLine(s.text(person), counter) ?? 'someone'
        if (sanitised && who === person.trim()) {
          who = '[person not in memory]'
          counter.add('unlisted-person')
        }
        add(`one-on-one-${s.slug(slugify(who)) || 'person'}`, `1:1 prep — ${who}`, md(content))
      }
    }

    return {
      path: `sprints/${n}.json`,
      counts: { done: doneC.length, dropped: droppedC.length, sections: sections.length },
      raw: {
        schemaVersion: CURRENT_VERSION.sprint,
        n,
        start: range.start,
        end: range.end,
        goal: null,
        closedAt,
        done: doneC.map((c, i) => archivedTask(c, doneOrders[i] as string)),
        dropped: droppedC.map((c, i) => archivedTask(c, droppedOrders[i] as string)),
        carried: [],
        retro: null,
        velocity: null,
        sections,
        legacy: true,
      },
    }
  })

  // ─── Memory: profile, people, glossary, references ────────────────────────
  const memMs = ms(memoryAt)
  const people = d.memory.people.map((p, i) => ({
    id: stableId(seed(`person:${i}`), memMs),
    name: sanitised ? null : toLine(p.name, counter),
    aliases: sanitised ? [] : p.aliases.map(a => toLine(a, counter)).filter((a): a is string => a !== null),
    role: sanitised ? (toLine(s.roles[i] ?? null, counter) ?? 'Person') : titled(p.role, 'Person'),
    notes: md(p.notes),
    ooo: [],
  }))

  const terms = new Map<string, { id: string; term: string; aliases: string[]; meaning: string; projectId: null }>()
  d.memory.terms.forEach((t, i) => {
    const term = line(t.term)
    if (term === null) {
      counter.add('untitled')
      return
    }
    const meaning = md(t.meaning) ?? ''
    const existing = terms.get(term.toLowerCase())
    if (existing) {
      existing.meaning = [existing.meaning, meaning].filter(Boolean).join('\n\n')
      counter.add('terms-merged')
    } else terms.set(term.toLowerCase(), { id: stableId(seed(`term:${i}`), memMs), term, aliases: [], meaning, projectId: null })
  })

  const references: Record<string, string> = {}
  const referenceSlug = slugAllocator()
  for (const [path, content] of Object.entries(d.memory.referenceFiles).sort(([a], [b]) => a.localeCompare(b))) {
    const name = referenceSlug(s.slug(slugify(path.replace(/\.md$/i, ''))), 'reference')
    references[`references/${name}.md`] = `${(prose(content).text ?? '').trim()}\n`
  }
  if (memoryNotes.length > 0) {
    const name = referenceSlug('project-notes', 'project-notes')
    references[`references/${name}.md`] = `${['# Project notes', '', 'Carried over from HECATE v1 memory.', ...memoryNotes.flatMap(n => ['', `## ${n.name}`, '', n.summary.trim()])].join('\n')}\n`
  }

  // ─── Write and validate every file ────────────────────────────────────────
  const files: Record<string, string> = {}
  const write = (path: string, kind: JsonFileKind, raw: unknown): void => {
    try {
      files[path] = serializeFile(kind, parseFile(kind, raw) as never)
    } catch (error) {
      errors.push({ path, message: error instanceof Error ? error.message : String(error) })
    }
  }

  write('workspace.json', 'workspace', {
    schemaVersion: CURRENT_VERSION.workspace,
    name: toLine(config.name, counter) ?? 'Workspace',
    timezone: config.timezone,
    policy: config.policy,
    workdays: config.workdays,
    sprint: config.sprint,
    statuses,
    tags: [...tags].map(([id, label]) => ({ id, label })),
    areas: [],
  })
  write('profile.json', 'profile', {
    schemaVersion: CURRENT_VERSION.profile,
    updatedAt: memoryAt,
    me: md(d.memory.me) ?? '',
    preferences: md(d.memory.preferences) ?? '',
    productivitySystem: md(d.memory.productivitySystem) ?? '',
    responsibilities: d.memory.recurringResponsibilities.map((r, i) => ({
      id: stableId(seed(`responsibility:${i}`), memMs), name: titled(r.name, 'Responsibility'), cadence: line(r.cadence) ?? 'As needed', notes: md(r.notes),
    })),
  })
  write('tasks.json', 'tasks', { schemaVersion: CURRENT_VERSION.tasks, nextKey: keys.nextKey, tasks: openTasks })
  write('focus/keep-in-mind.json', 'keepInMind', { schemaVersion: CURRENT_VERSION.keepInMind, updatedAt: at, items: [] })
  write('people.json', 'people', { schemaVersion: CURRENT_VERSION.people, updatedAt: memoryAt, people })
  write('glossary.json', 'glossary', { schemaVersion: CURRENT_VERSION.glossary, terms: [...terms.values()] })
  for (const f of focusFiles) write(f.path, 'focusWeek', f.raw)
  for (const p of projectFiles) write(p.path, 'project', p.raw)
  for (const sp of sprintFiles) write(sp.path, 'sprint', sp.raw)
  Object.assign(files, references)

  const today = todayIn(config.timezone, new Date(atMs))
  const activityPath = `activity/${isoWeekKey(today)}.jsonl`
  const summary = `Migrated from HECATE v1: ${openTasks.length} tasks, ${projectFiles.length} projects, ${sprintFiles.length} legacy sprints`
  try {
    files[activityPath] = serializeActivityEntry(parseActivityLog(JSON.stringify({
      schemaVersion: CURRENT_VERSION.activityEntry, id: stableId(seed('activity:import'), atMs), at, date: today, actor: 'import',
      type: 'event', area: null, delta: summary, pointers: [], keys: [], opId: 'migrate-v1',
    }))[0] as never)
  } catch (error) {
    errors.push({ path: activityPath, message: error instanceof Error ? error.message : String(error) })
  }

  let state: WorkspaceState | null = null
  if (errors.length === 0) {
    try {
      state = stateFromFiles(files)
    } catch (error) {
      if (error instanceof WorkspaceLoadError) errors.push(...error.problems)
      else errors.push({ path: '(workspace)', message: error instanceof Error ? error.message : String(error) })
    }
  }
  if (state) {
    for (const issue of checkWorkspace(state)) (issue.severity === 'error' ? errors : warnings).push({ path: issue.path, message: issue.message })
  }

  let possibleNames: string[] = []
  if (sanitised && state) {
    const texts: string[] = []
    const collect = (value: unknown): void => {
      if (typeof value === 'string') texts.push(value)
      else if (Array.isArray(value)) value.forEach(collect)
      else if (value && typeof value === 'object') Object.values(value).forEach(collect)
    }
    collect({ ...state, references: undefined })
    texts.push(...Object.values(state.references))
    possibleNames = findPossibleNames(state, texts).sort()
  }

  // ─── Report ───────────────────────────────────────────────────────────────
  const fields = Object.entries(FIELD_MAP)
    .map(([path, entry]) => ({ path, entry, count: v1.paths.get(path) ?? 0 }))
    .filter(f => f.count > 0)
  const unaccounted = [...v1.paths].filter(([path]) => entryFor(path) === null).map(([path, count]) => ({ path, count }))

  const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`
  const v1Present = (file: keyof V1Data): boolean => v1.present.has(file)
  const input = [
    { file: 'tasks.json', summary: v1Present('tasks') ? `${plural(d.tasks.columns.length, 'column')}, ${plural(keys.open, 'task')}` : 'absent' },
    { file: 'focus.json', summary: d.focus ? `${plural(d.focus.sections.length, 'section')}, ${plural(d.focus.calendarEvents.length, 'calendar event')}` : 'absent' },
    { file: 'projects.json', summary: v1Present('projects') ? `${plural(d.projects.projects.length, 'project')}, ${plural(d.projects.projects.reduce((n, p) => n + p.openQuestions.length, 0), 'open question')}` : 'absent' },
    { file: 'weekly_log.json', summary: v1Present('weekly_log') ? plural(d.weekly_log.weeks.length, 'week') : 'absent' },
    {
      file: 'archive.json',
      summary: v1Present('archive')
        ? `${plural(d.archive.weeks.length, 'week')}, ${d.archive.weeks.reduce((n, w) => n + w.done.length, 0)} done, ${d.archive.weeks.reduce((n, w) => n + w.notDoing.length, 0)} not doing`
        : 'absent',
    },
    {
      file: 'memory.json',
      summary: v1Present('memory')
        ? `${plural(d.memory.people.length, 'person', 'people')}, ${plural(d.memory.terms.length, 'term')}, ${plural(d.memory.projects.length, 'project note')}, ${plural(d.memory.recurringResponsibilities.length, 'responsibility', 'responsibilities')}, ${plural(Object.keys(d.memory.referenceFiles).length, 'reference file')}`
        : 'absent',
    },
    { file: 'settings.json', summary: v1Present('settings') ? plural(Object.keys(d.settings).length, 'setting') : 'absent' },
  ]
  const added = counter.get('status-added')
  const output = [
    { file: 'workspace.json', summary: `${plural(statuses.length, 'status', 'statuses')}${added ? ` (${added} added)` : ''}, ${plural(tags.size, 'tag')}` },
    { file: 'profile.json', summary: plural(d.memory.recurringResponsibilities.length, 'responsibility', 'responsibilities') },
    { file: 'tasks.json', summary: `${plural(openTasks.length, 'task')} (${openTasks.filter(t => (t as { kind: string }).kind === 'waiting').length} waiting)` },
    ...focusFiles.map(f => ({ file: f.path, summary: plural(f.sections, 'section') })),
    { file: 'focus/keep-in-mind.json', summary: 'empty' },
    ...(projectFiles.length > 0 ? [{ file: 'projects/*.json', summary: `${plural(projectFiles.length, 'project')}, ${plural(projectFiles.reduce((n, p) => n + p.openQuestions, 0), 'open question')}` }] : []),
    ...(sprintFiles.length > 0 ? [{
      file: 'sprints/*.json',
      summary: `${plural(sprintFiles.length, 'legacy sprint')} (${sprintNumbers.join(', ')}), ${sprintFiles.reduce((n, x) => n + x.counts.done, 0)} done, ${sprintFiles.reduce((n, x) => n + x.counts.dropped, 0)} dropped, ${plural(sprintFiles.reduce((n, x) => n + x.counts.sections, 0), 'section')}`,
    }] : []),
    { file: 'people.json', summary: plural(people.length, 'person', 'people') },
    { file: 'glossary.json', summary: plural(terms.size, 'term') },
    ...(Object.keys(references).length > 0 ? [{ file: 'references/*.md', summary: plural(Object.keys(references).length, 'file') }] : []),
    { file: activityPath, summary: '1 entry (the import)' },
  ]

  const sprintText = cadence
    ? `${plural(cadence.lengthWeeks, 'week')} from ${cadence.anchor} (sprint ${cadence.anchorNumber})`
    : null
  const report: WorkspaceReport = {
    dir,
    settings: { policy: config.policy, timezone: config.timezone, sprint: sprintText, workdays: config.workdays.join(','), fromConfig: config.fromConfig },
    input,
    output,
    keys,
    fields,
    unaccounted,
    normalisations: counter.list(),
    sanitised: sanitised ? { replacements: s.count, possibleNames: possibleNames.length } : null,
    loaded: state !== null,
    errors,
    warnings,
  }
  return { files, report, possibleNames }
}
