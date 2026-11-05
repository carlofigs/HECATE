/**
 * commit-message.ts — one commit message for the batches a commit carries.
 *
 * The subject names the workspace and the first change; the body lists every
 * change; trailers say who made them (ADR 0004: `Actor:`) and which batches
 * they were (`Op-Id:`), so a commit can be traced back to its ops.
 */

export interface CommittedBatch {
  opId: string
  actor: string
  /** One line per op, from applyBatch's summary. */
  summary: readonly string[]
}

const SUBJECT_MAX = 72

export function commitMessage(dir: string, batches: readonly CommittedBatch[]): string {
  const lines = batches.flatMap(b => b.summary)
  const first = lines[0] ?? 'Update'
  const more = lines.length > 1 ? ` (+${lines.length - 1} more)` : ''
  let subject = `${dir}: ${first}`
  if (subject.length + more.length > SUBJECT_MAX) subject = `${subject.slice(0, SUBJECT_MAX - more.length - 1).trimEnd()}…`
  const actors = [...new Set(batches.map(b => b.actor))].join(', ')
  return [
    `${subject}${more}`,
    '',
    ...lines.map(l => `- ${l}`),
    '',
    `Actor: ${actors}`,
    ...batches.map(b => `Op-Id: ${b.opId}`),
  ].join('\n')
}
