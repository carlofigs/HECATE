/**
 * render.ts — markdown for the skills and for dry-run previews.
 *
 * renderFocusWeek writes a focus week in the shape the focus-drafter skill
 * has always used for FOCUS.md: Today, closed days, This Week's Priorities,
 * Week at a Glance, Last Week, Waiting On, Keep in Mind. The structure lives
 * in the data; this is only its markdown face, so a session can read and
 * compare it exactly as it reads the file today.
 */

import { OUTCOME_EMOJI, PERSONAL_BLOCKED, PRIORITY_TIER_EMOJI, URGENCY_EMOJI } from '../constants.ts'
import { addDays, formatDay, formatWeekOf, weekdayOf, type IsoWeekday } from '../dates.ts'
import type { IsoDate } from '../primitives.ts'
import type { WorkspaceState } from '../state.ts'
import type { ApplyFailure, ApplySuccess } from '../apply.ts'
import { cell, indentContinuation, keysSuffix, leadAndRest, quote, timeRange } from './markdown.ts'
import { sprintPosition, todayView, waitingOn, type Briefing, type SprintPosition } from './selectors.ts'
import type { FoundTask, SearchHit } from './query.ts'
import type { FileData } from '../files.ts'

const urgency = (u: keyof typeof URGENCY_EMOJI | null): string => (u ? `${URGENCY_EMOJI[u]} ` : '')

function sprintLine(position: SprintPosition | null): string | null {
  if (!position) return null
  const parts = [
    `Sprint ${position.n}`,
    `day ${position.day} of ${position.length}`,
    position.isLastDay ? 'closes today' : `closes ${formatDay(position.end)}`,
  ]
  if (position.externalLabel) parts.push(position.externalLabel)
  return parts.join(' · ')
}

/**
 * One focus week as markdown. `today` decides the Today section (shown only
 * when it falls in this week and the day is not yet closed) and the sprint
 * line; nothing reads a clock.
 */
export function renderFocusWeek(state: WorkspaceState, weekOf: IsoDate, options: { today: IsoDate }): string {
  const week = state.focusWeeks[weekOf]
  const sunday = addDays(weekOf, 6)
  const inWeek = options.today >= weekOf && options.today <= sunday
  const out: string[] = [`# Week of ${formatWeekOf(weekOf)}`]
  const sprint = sprintLine(sprintPosition(state, inWeek ? options.today : weekOf))
  if (sprint) out.push('', sprint)

  // Today
  const today = todayView(state, options.today)
  if (inWeek && !today.closed && (today.meetings.length + today.allDay.length + today.plan.length > 0)) {
    out.push('', `## Today: ${today.label}`)
    if (today.meetings.length + today.allDay.length > 0) {
      out.push('', '**Meetings:**')
      for (const row of [...today.allDay, ...today.meetings]) {
        if (row.personal) {
          out.push(`- ${timeRange(row.start, row.end)} ${PERSONAL_BLOCKED}`)
          continue
        }
        const text = `${timeRange(row.start, row.end)} ${row.title ?? ''}${row.note ? ` — ${row.note}` : ''}`
        out.push(`- ${row.important ? `**${text}**` : text}${keysSuffix(row.keys)}`)
      }
    }
    if (today.plan.length > 0) {
      out.push('', "**Today's tasks:**")
      today.plan.forEach((item, i) => {
        out.push(`${i + 1}. ${urgency(item.urgency)}${indentContinuation(leadAndRest(item.lead, item.detail), '   ')}${keysSuffix(item.keys)}`)
      })
    }
  }

  // Closed days, most recent first
  const closed = (week?.days ?? []).filter(d => d.closedAt !== null).sort((a, b) => b.date.localeCompare(a.date))
  for (const day of closed) {
    out.push('', `## ${formatDay(day.date)} — Done`)
    if (day.outcomes.length === 0) out.push('', 'Nothing recorded.')
    else out.push('', ...day.outcomes.map(o => `- ${OUTCOME_EMOJI[o.result]} ${indentContinuation(leadAndRest(o.lead, o.note))}${keysSuffix(o.keys)}`))
    if (day.note) out.push('', day.note.trim())
  }

  // This Week's Priorities
  if ((week?.callouts.length ?? 0) + (week?.priorities.length ?? 0) > 0) {
    out.push('', "## This Week's Priorities")
    for (const c of week?.callouts ?? []) out.push('', quote(`${leadAndRest(c.lead, c.text)}${keysSuffix(c.keys)}`))
    if (week?.priorities.length) {
      out.push('', ...week.priorities.map(p => `- ${PRIORITY_TIER_EMOJI[p.tier]} ${indentContinuation(leadAndRest(p.lead, p.detail))}${keysSuffix(p.keys)}`))
    }
  }

  // Week at a Glance (working days only)
  const workdays = new Set<IsoWeekday>(state.workspace.workdays as IsoWeekday[])
  const glance = (week?.schedule ?? [])
    .filter(r => workdays.has(weekdayOf(r.date)))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? '').localeCompare(b.start ?? ''))
  if (glance.length > 0) {
    out.push('', '## Week at a Glance', '', '| Day | Time | Event | Relevance |', '|---|---|---|---|')
    for (const r of glance) {
      const event = r.personal ? PERSONAL_BLOCKED : (r.title ?? '')
      const relevance = r.personal ? '—' : `${r.relevance ? `${URGENCY_EMOJI[r.relevance]} ` : ''}${r.note ?? ''}${keysSuffix(r.keys)}`.trim()
      out.push(`| ${formatDay(r.date)} | ${timeRange(r.start, r.end)} | ${cell(event)} | ${cell(relevance)} |`)
    }
  }

  // Last Week
  if (week?.lastWeek.length) {
    out.push('', '## Last Week', '', ...week.lastWeek.map(l => `- ${indentContinuation(l.text.trim())}${keysSuffix(l.keys)}`))
  }

  // Waiting On (always present: an empty list is information)
  const waiting = waitingOn(state, inWeek ? options.today : weekOf)
  out.push('', '## Waiting On', '')
  if (waiting.length === 0) {
    out.push('Nothing.')
  } else {
    out.push('| Item | Who | Impact |', '|---|---|---|')
    for (const w of waiting) {
      const item = `**${w.key}** ${urgency(w.urgency)}${w.title}`
      const who = [w.who, w.meeting ? `(${w.meeting})` : null].filter(Boolean).join(' ')
      const impact = w.unblocks.length > 0 ? `Unblocks ${w.unblocks.map(u => `${u.key} ${u.title}`).join('; ')}` : ''
      out.push(`| ${cell(item)} | ${cell(who)} | ${cell(impact)} |`)
    }
  }

  // Keep in Mind (always present)
  out.push('', '## Keep in Mind', '')
  if (state.keepInMind.items.length === 0) out.push('Nothing.')
  else out.push(...state.keepInMind.items.map(i => `- ${indentContinuation(leadAndRest(i.lead, i.text))}${keysSuffix(i.keys)}`))

  // Anything else the week carries
  for (const s of week?.sections ?? []) out.push('', `## ${s.title}`, '', s.content.trim())

  return `${out.join('\n')}\n`
}

/** A batch result as markdown: what will change (dry run) or what changed. */
export function renderPreview(result: ApplySuccess, options: { dryRun?: boolean } = {}): string {
  const dryRun = options.dryRun ?? true
  const out: string[] = [dryRun ? '**Dry run — nothing has been written.**' : '**Applied.**', '']
  result.summary.forEach((s, i) => out.push(`${i + 1}. ${s.text}`))
  const keys = Object.entries(result.keyMap)
  if (keys.length > 0) out.push('', `**New keys:** ${keys.map(([ref, key]) => `${ref} → ${key}`).join(' · ')}`)
  if (result.warnings.length > 0) {
    out.push('', '**Warnings:**', ...result.warnings.map(w => `- ${w.message}${w.index !== null ? ` (step ${w.index + 1})` : ''}`))
  }
  const verb = dryRun ? 'Would' : 'Did'
  const files = [
    result.changed.length > 0 ? `${verb} write ${result.changed.map(p => `\`${p}\``).join(', ')}` : null,
    result.deleted.length > 0 ? `${verb} delete ${result.deleted.map(p => `\`${p}\``).join(', ')}` : null,
    result.activity.length > 0 ? `${result.activity.length} activity ${result.activity.length === 1 ? 'line' : 'lines'}` : null,
  ].filter(Boolean)
  if (files.length > 0) out.push('', files.join(' · '))
  return `${out.join('\n')}\n`
}

/** Why a batch was refused, as markdown. */
export function renderErrors(failure: ApplyFailure): string {
  const out = ['**Not applied — nothing was written.**', '']
  for (const e of failure.errors) {
    const where = e.index !== null ? `Step ${e.index + 1}${e.type ? ` (\`${e.type}\`)` : ''}` : 'Batch'
    const message = /[.!?]$/.test(e.message) ? e.message : `${e.message}.`
    const available = e.available && e.available.length > 0 ? ` Available: ${e.available.join(', ')}.` : ''
    out.push(`- ${where}: ${message}${available}`)
  }
  return `${out.join('\n')}\n`
}

/** A compact text form of get_briefing for clients that prefer prose. */
export function renderBriefing(b: Briefing): string {
  const out: string[] = [`# ${b.workspace.name} — ${b.todayLabel}`]
  const sprint = sprintLine(b.sprint)
  if (sprint) out.push('', sprint)

  const t = b.todayView
  if (t.meetings.length + t.allDay.length + t.plan.length > 0) {
    out.push('', '## Today')
    if (t.meetings.length + t.allDay.length > 0) {
      out.push('', '**Meetings:**')
      for (const r of [...t.allDay, ...t.meetings]) {
        const title = r.personal ? PERSONAL_BLOCKED : `${r.title ?? ''}${keysSuffix(r.keys)}`
        out.push(`- ${timeRange(r.start, r.end)} ${r.important ? `**${title}**` : title}`)
      }
    }
    if (t.plan.length > 0) {
      out.push('', '**Plan:**')
      t.plan.forEach((p, i) => out.push(`${i + 1}. ${urgency(p.urgency)}${p.lead}${keysSuffix(p.keys)}`))
    }
  }

  const section = (title: string, lines: string[]): void => {
    if (lines.length > 0) out.push('', `## ${title}`, '', ...lines)
  }
  section('Priorities', b.week.priorities.map(p => `- ${PRIORITY_TIER_EMOJI[p.tier]} ${p.lead}${keysSuffix(p.keys)}`))
  section('In progress', b.inProgress.map(s => `- ${urgency(s.urgency)}**${s.key}** ${s.title}${s.blockedBy.length ? ` — blocked by ${s.blockedBy.join(', ')}` : ''}`))
  section('Waiting on', b.waitingOn.map(w => `- ${urgency(w.urgency)}**${w.key}** ${w.title}${w.who ? ` — ${w.who}` : ''}${w.meeting ? ` (${w.meeting})` : ''}`))
  section('Blocked', b.blocked.map(s => `- **${s.key}** ${s.title} — waiting for ${s.blockedBy.join(', ')}`))
  section('Due soon', b.dueSoon.map(d => `- ${formatDay(d.date)}${d.overdue ? ' (overdue)' : ''}: ${d.key ? `**${d.key}** ` : ''}${d.title}${d.hard ? ' ⚠️ hard' : ''}${d.projectSlug ? ` · ${d.projectSlug}` : ''}`))
  section('Cutoffs and leave', b.cutoffs.map(c => `- ${c.kind === 'ooo' ? `${formatDay(c.start)} – ${formatDay(c.end)}` : formatDay(c.start)}: ${c.who}${c.what ? ` — ${c.what}` : ''}`))
  section('Keep in mind', b.keepInMind.map(k => `- ${leadAndRest(k.lead, k.text).split('\n')[0]}`))
  section('Recent activity', b.activity.map(a => `- ${a.date} · ${a.type}${a.area ? ` · ${a.area}` : ''}: ${a.delta}`))
  return `${out.join('\n')}\n`
}

/** Tasks as a list: key, urgency, title, then status, waiting, project, tags and due date. */
export function renderTasks(tasks: readonly FoundTask[], total = tasks.length): string {
  if (tasks.length === 0) return 'No matching tasks.\n'
  const lines = tasks.map(t => {
    const facts = [
      t.where === 'archived' ? `${t.statusName}, sprint ${t.sprint ?? '?'}` : t.statusName,
      t.waitingOn ? `waiting on ${t.waitingOn}` : null,
      t.blockedBy.length > 0 ? `blocked by ${t.blockedBy.join(', ')}` : null,
      t.projectSlug,
      ...t.tags.map(tag => `#${tag}`),
      t.due ? `due ${formatDay(t.due)}` : null,
    ].filter(Boolean)
    return `- ${urgency(t.urgency)}**${t.key}** ${t.title} — ${facts.join(' · ')}`
  })
  if (total > tasks.length) lines.push(`- … ${total - tasks.length} more`)
  return `${lines.join('\n')}\n`
}

/** Search hits: what, where to look, and the matching text. */
export function renderSearch(hits: readonly SearchHit[], total = hits.length): string {
  if (hits.length === 0) return 'Nothing found.\n'
  const lines = hits.map(h => `- **${h.title}** (\`${h.ref}\`)${h.snippet ? `: ${h.snippet}` : ''}`)
  if (total > hits.length) lines.push(`- … ${total - hits.length} more`)
  return `${lines.join('\n')}\n`
}

/** Activity entries, newest first. */
export function renderActivity(entries: readonly FileData<'activityEntry'>[]): string {
  if (entries.length === 0) return 'Nothing new.\n'
  return `${entries.map(a => `- ${a.date} · ${a.type}${a.area ? ` · ${a.area}` : ''}: ${a.delta}${keysSuffix(a.keys)}`).join('\n')}\n`
}
