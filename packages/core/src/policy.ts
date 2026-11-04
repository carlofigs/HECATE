/**
 * policy.ts — structural checks for a sanitised workspace (ADR 0005).
 *
 * A sanitised workspace mirrors work data without colleagues' names or meeting
 * notes: people are roles, and meeting summaries stay on the work side. These
 * are the checks that can be made on a file's structure alone. Warnings about
 * names inside free text belong to the op layer, where a dry run can show them
 * before anything is written.
 */

import type { FileKind } from './kinds.ts'
import type { FileData } from './files.ts'

export type Policy = 'open' | 'sanitised'

export interface PolicyIssue {
  severity: 'error' | 'warning'
  code: 'name-in-sanitised' | 'meeting-in-sanitised'
  path: (string | number)[]
  message: string
}

export function checkPolicy<K extends FileKind>(kind: K, data: FileData<K>, policy: Policy): PolicyIssue[] {
  if (policy === 'open') return []
  const issues: PolicyIssue[] = []

  if (kind === 'people') {
    const people = (data as FileData<'people'>).people
    people.forEach((person, i) => {
      if (person.name !== null) {
        issues.push({
          severity: 'error',
          code: 'name-in-sanitised',
          path: ['people', i, 'name'],
          message: `This workspace is sanitised: record "${person.role}" by role only, without a name`,
        })
      }
      if (person.aliases.length > 0) {
        issues.push({
          severity: 'error',
          code: 'name-in-sanitised',
          path: ['people', i, 'aliases'],
          message: `This workspace is sanitised: "${person.role}" cannot carry aliases`,
        })
      }
    })
  }

  if (kind === 'meetingFrontmatter') {
    issues.push({
      severity: 'error',
      code: 'meeting-in-sanitised',
      path: [],
      message: 'This workspace is sanitised: meeting summaries stay on the work side and are not stored here',
    })
  }

  return issues
}
