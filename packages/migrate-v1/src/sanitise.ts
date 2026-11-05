/**
 * sanitise.ts — names to roles, for sanitised workspaces (ADR 0005).
 *
 * v1 memory lists the people a workspace mentions, with their aliases and
 * role. In a sanitised workspace every mention of a name or alias in migrated
 * text becomes `[role]`. A first name counts as a mention when no one else
 * shares it. The private migration config can add people v1 memory never
 * recorded (name → role). A role that itself contains a name is not a role,
 * so it becomes "Colleague". What is left is caught (as warnings) by core's
 * findPossibleNames heuristic.
 */

import { slugify } from '@hecate/core'

export interface NamedPerson {
  name: string
  aliases: readonly string[]
  role: string
}

export interface Sanitiser {
  /** Replace names in prose. Case-sensitive, whole words only. */
  text(value: string): string
  /** Replace names in a slug (a file name, a tag id). */
  slug(value: string): string
  /** Each memory person's role, safe to store (same order as the input). */
  readonly roles: readonly string[]
  /** How many replacements were made. */
  readonly count: number
  /** Roles that contained a name and were stored as "Colleague". */
  readonly rolesWithNames: number
}

/** What a role that names someone is recorded as. */
const NAMELESS_ROLE = 'Colleague'

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const byLength = (a: string, b: string): number => b.length - a.length || a.localeCompare(b)
const wordsPattern = (terms: readonly string[]): string => `(?<![\\p{L}\\p{N}])(?:${terms.map(escape).join('|')})(?![\\p{L}\\p{N}])`

export function createSanitiser(memoryPeople: readonly NamedPerson[], extra: Readonly<Record<string, string>>): Sanitiser {
  const people: NamedPerson[] = [
    ...memoryPeople,
    ...Object.entries(extra).map(([name, role]) => ({ name, aliases: [], role })),
  ]
  const firstNameCount = new Map<string, number>()
  const namesOf = people.map(p => {
    const full = p.name.trim()
    const first = full.split(/\s+/)[0] ?? ''
    if (full.includes(' ')) firstNameCount.set(first, (firstNameCount.get(first) ?? 0) + 1)
    return { full, first, aliases: p.aliases.map(a => a.trim()) }
  })
  const termsOf = namesOf.map(({ full, first, aliases }) => {
    const terms = [full, ...aliases]
    if (full.includes(' ') && first.length > 2 && firstNameCount.get(first) === 1) terms.push(first)
    return terms.filter(t => t.length > 1)
  })
  const allTerms = [...new Set(termsOf.flat())].sort(byLength)
  const mentionsName = allTerms.length > 0 ? new RegExp(wordsPattern(allTerms), 'u') : null

  let rolesWithNames = 0
  const safeRoles = people.map(p => {
    if (mentionsName?.test(p.role)) {
      rolesWithNames++
      return NAMELESS_ROLE
    }
    return p.role
  })

  const roleOf = new Map<string, string>()
  termsOf.forEach((terms, i) => {
    for (const t of terms) if (!roleOf.has(t)) roleOf.set(t, safeRoles[i] as string)
  })
  const prose = allTerms.length > 0 ? new RegExp(wordsPattern(allTerms), 'gu') : null

  const slugRole = new Map<string, string>()
  for (const t of allTerms) {
    const s = slugify(t)
    if (s && !slugRole.has(s)) slugRole.set(s, slugify(roleOf.get(t) ?? '') || 'person')
  }
  const slugTerms = [...slugRole.keys()].sort(byLength)
  const inSlug = slugTerms.length > 0 ? new RegExp(`(?<=^|-)(?:${slugTerms.map(escape).join('|')})(?=-|$)`, 'g') : null

  let count = 0
  return {
    text(value) {
      if (!prose) return value
      return value.replace(prose, (m: string) => {
        count++
        return `[${roleOf.get(m) ?? NAMELESS_ROLE}]`
      })
    },
    slug(value) {
      if (!inSlug) return value
      return value.replace(inSlug, (m: string) => {
        count++
        return slugRole.get(m) ?? 'person'
      })
    },
    roles: safeRoles.slice(0, memoryPeople.length),
    get count() {
      return count
    },
    rolesWithNames,
  }
}
