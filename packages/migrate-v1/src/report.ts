/**
 * report.ts — the dry-run report.
 *
 * Counts, key mappings, field dispositions and validation results: never a
 * title, a note or a person's name. It does name each workspace directory, and
 * a validation error can quote the field that failed; a ready report has none.
 */

import type { FieldEntry } from './fields.ts'

/** Every adjustment the migration can make to fit v1 data into v2, in report order. */
const NORMALISATIONS = {
  'week-moved': 'weekOf moved to its Monday',
  'category-inferred': 'Status category inferred from the column name',
  'status-added': 'Status added for a category the board lacked',
  'unknown-value': 'Unrecognised value replaced by a default',
  'completed-at': 'completedAt taken from updatedAt (finished tasks on the board)',
  'archived-times': 'Archived task timestamps taken from archivedAt',
  'blocked-since': 'blockedSince appended to the note',
  'project-linked': 'Tasks linked to a project by its tag',
  'tag-conflict': 'Tags claimed by more than one project (first kept)',
  'ref-rewritten': 'Task references rewritten to keys',
  'ref-unresolved': 'Task references left as written (no such task)',
  'snapshot-unmatched': 'Week-log items whose task no longer exists',
  'collapsed': 'Text collapsed to one line',
  'truncated': 'Text truncated to 500 characters',
  'blank-to-null': 'Blank text stored as null',
  'untitled': 'Missing title or name given a placeholder',
  'date-to-instant': 'Date-only updatedAt read as midnight UTC',
  'invalid-time': 'Missing or invalid timestamp replaced',
  'invalid-date': 'Invalid date left empty',
  'oq-renumbered': 'Open questions numbered afresh (missing or repeated number)',
  'resolution-missing': 'Resolved question without a resolution: placeholder added',
  'terms-merged': 'Glossary entries merged into an earlier one with the same term',
  'summary-from-memory': 'Project summary taken from memory',
  'memory-project-notes': 'Memory project notes moved to references/project-notes.md',
  'calendar-dropped': 'Calendar events dropped (ADR 0006)',
  'focus-empty': 'Empty focus page not carried over',
  'unlisted-person': '1:1 notes for someone not in memory (name hidden)',
  'role-had-name': 'Role that named someone, recorded as "Colleague"',
} as const

export type NormalisationId = keyof typeof NORMALISATIONS

export class Counter {
  private readonly counts = new Map<NormalisationId, number>()

  add(id: NormalisationId, n = 1): void {
    if (n > 0) this.counts.set(id, (this.counts.get(id) ?? 0) + n)
  }

  get(id: NormalisationId): number {
    return this.counts.get(id) ?? 0
  }

  list(): { id: NormalisationId; label: string; count: number }[] {
    return (Object.keys(NORMALISATIONS) as NormalisationId[])
      .filter(id => this.get(id) > 0)
      .map(id => ({ id, label: NORMALISATIONS[id], count: this.get(id) }))
  }
}

export interface KeyStats {
  open: number
  archived: number
  /** t-a12 → A12, t-b3 → B3. */
  fromId: number
  /** Allocated after the highest kept number, in creation order. */
  fresh: number
  /** A second open task with an id already used: fresh key, no legacy id. */
  duplicateOpen: number
  /** Archived in more than one week: the earliest copy is kept. */
  archivedDuplicates: number
  /** Archived but still on the board: the board copy is kept. */
  archivedAlsoOpen: number
  archivedWithoutId: number
  nextKey: { A: number; B: number }
}

export interface Problem {
  path: string
  message: string
}

export interface WorkspaceReport {
  dir: string
  settings: { policy: 'open' | 'sanitised'; timezone: string; sprint: string | null; workdays: string; fromConfig: boolean }
  input: { file: string; summary: string }[]
  output: { file: string; summary: string }[]
  keys: KeyStats
  fields: { path: string; entry: FieldEntry; count: number }[]
  unaccounted: { path: string; count: number }[]
  normalisations: { id: NormalisationId; label: string; count: number }[]
  sanitised: { replacements: number; possibleNames: number } | null
  /** The output loaded as a v2 workspace (stateFromFiles). */
  loaded: boolean
  errors: Problem[]
  warnings: Problem[]
}

export const isReady = (r: WorkspaceReport): boolean => r.errors.length === 0 && r.unaccounted.length === 0

const table = (head: string[], rows: string[][]): string[] => [
  `| ${head.join(' | ')} |`,
  `|${head.map(() => '---').join('|')}|`,
  ...rows.map(r => `| ${r.map(c => c.replace(/\|/g, '\\|')).join(' | ')} |`),
]

function renderWorkspace(r: WorkspaceReport): string[] {
  const out: string[] = [`## ${r.dir}`, '']
  const s = r.settings
  out.push(
    `${isReady(r) ? '**Ready**' : `**Not ready** — ${r.errors.length} ${r.errors.length === 1 ? 'error' : 'errors'}, ${r.unaccounted.length} unaccounted ${r.unaccounted.length === 1 ? 'field' : 'fields'}`}`,
    '',
    `Policy \`${s.policy}\` · time zone ${s.timezone} · working days ${s.workdays} · sprints: ${s.sprint ?? 'none'} · settings from ${s.fromConfig ? 'the config file' : 'defaults'}`,
  )

  out.push('', '### Input (v1)', '', ...table(['File', 'Contents'], r.input.map(i => [i.file, i.summary])))
  out.push('', '### Output (v2)', '', ...table(['File', 'Contents'], r.output.map(o => [o.file, o.summary])))

  const k = r.keys
  out.push('', '### Task keys', '', ...table(['', 'Tasks'], [
    ['On the board', String(k.open)],
    ['Archived (kept)', String(k.archived)],
    ['Key taken from the v1 id (t-a12 → A12)', String(k.fromId)],
    ['Key allocated after the highest kept number', String(k.fresh)],
    ['Second board task with the same id (fresh key, no legacy id)', String(k.duplicateOpen)],
    ['Archived in more than one week (earliest kept)', String(k.archivedDuplicates)],
    ['Archived but still on the board (board copy kept)', String(k.archivedAlsoOpen)],
    ['Archived without an id', String(k.archivedWithoutId)],
  ]), '', `nextKey: A${k.nextKey.A} · B${k.nextKey.B}`)

  out.push('', '### Field accounting', '')
  if (r.unaccounted.length > 0) {
    out.push('**Unaccounted fields** (not in the field map; nothing is migrated until each has a decision):', '')
    out.push(...table(['v1 field', 'Seen'], r.unaccounted.map(u => [`\`${u.path}\``, String(u.count)])), '')
  }
  out.push(...table(['v1 field', 'Disposition', 'v2', 'Seen'], r.fields.map(f => [`\`${f.path}\``, f.entry.disposition, f.entry.target, String(f.count)])))

  out.push('', '### Normalisations', '')
  if (r.normalisations.length === 0) out.push('None.')
  else out.push(...table(['', 'Count'], r.normalisations.map(n => [n.label, String(n.count)])))

  if (r.sanitised) {
    out.push('', '### Sanitising', '', ...table(['', 'Count'], [
      ['Names replaced with roles', String(r.sanitised.replacements)],
      ['Possible names left in text (warnings; `--names` lists them locally)', String(r.sanitised.possibleNames)],
    ]))
  }

  out.push('', '### Validation', '', `- Loads as a v2 workspace: ${r.loaded ? 'yes' : 'no'}`, `- Errors: ${r.errors.length}`, `- Warnings: ${r.warnings.length}`)
  if (r.errors.length > 0) out.push('', '**Errors:**', '', ...r.errors.map(e => `- \`${e.path}\`: ${e.message.replace(/\n/g, ' ')}`))
  if (r.warnings.length > 0) out.push('', '**Warnings:**', '', ...r.warnings.map(w => `- \`${w.path}\`: ${w.message.replace(/\n/g, ' ')}`))
  return out
}

export function renderReport(reports: readonly WorkspaceReport[], meta: { at: string }): string {
  const ready = reports.filter(isReady).length
  const out: string[] = [
    '# HECATE v1 → v2 migration',
    '',
    `Run at ${meta.at} · ${reports.length} ${reports.length === 1 ? 'workspace' : 'workspaces'} · ${ready} ready`,
  ]
  out.push('', ...table(['Workspace', 'Policy', 'Tasks', 'Errors', 'Unaccounted', 'Result'], reports.map(r => [
    r.dir, r.settings.policy, String(r.keys.open + r.keys.archived), String(r.errors.length), String(r.unaccounted.length), isReady(r) ? 'ready' : 'not ready',
  ])))
  for (const r of reports) out.push('', ...renderWorkspace(r))
  return `${out.join('\n')}\n`
}
