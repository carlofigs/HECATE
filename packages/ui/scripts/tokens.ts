/**
 * Reads the token source (src/theme.css) and builds design/tokens/tokens.json
 * from it (DESIGN-STANDARD T-08 option B, T-09). The stylesheet's shape is
 * fixed by its header comment, and this reads exactly that shape:
 *
 * - `@layer theme { :root { … } }`: Tier 1 primitives.
 * - `@theme static { … }`: Tier 2 roles and directly consumed scales.
 * - `@layer base { @media <condition> { :root { … } } }`: re-maps of Tier 2,
 *   one block per condition (the dark theme, touch-first density).
 *
 * Custom property names map to DTCG paths through Tailwind's namespaces
 * (`--spacing-*` is the standard's `space.*`, `--ease-*` is `motion.easing.*`).
 */

import { COMPOUND_TERMS, VOCABULARY } from './vocabulary.ts'

interface CssBlock {
  prelude: string
  decls: [string, string][]
  children: CssBlock[]
}

/** A minimal parser for the token stylesheet: comments, nested blocks, declarations. */
function parseCss(source: string): CssBlock {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '')
  let i = 0
  const block = (prelude: string): CssBlock => {
    const node: CssBlock = { prelude, decls: [], children: [] }
    let buffer = ''
    while (i < css.length) {
      const ch = css[i++] as string
      if (ch === '{') {
        node.children.push(block(buffer.trim()))
        buffer = ''
      } else if (ch === '}') {
        break
      } else if (ch === ';') {
        const text = buffer.trim()
        buffer = ''
        const colon = text.indexOf(':')
        if (text.startsWith('--') && colon > 0) node.decls.push([text.slice(0, colon).trim(), text.slice(colon + 1).trim()])
      } else {
        buffer += ch
      }
    }
    return node
  }
  return block('')
}

export interface TokenSource {
  /** Tier 1, by custom property name. */
  primitives: Map<string, string>
  /** Tier 2, by custom property name. */
  semantic: Map<string, string>
  /** Re-maps of Tier 2 under a media condition, keyed by condition name. */
  conditions: Map<string, { media: string; decls: Map<string, string> }>
}

const CONDITION_NAMES: [RegExp, string][] = [
  [/prefers-color-scheme:\s*dark/, 'dark'],
  [/any-pointer:\s*coarse/, 'touch'],
]

export function readTokenSource(css: string): TokenSource {
  const root = parseCss(css)
  const source: TokenSource = { primitives: new Map(), semantic: new Map(), conditions: new Map() }
  for (const node of root.children) {
    if (node.prelude === '@theme static') for (const [k, v] of node.decls) source.semantic.set(k, v)
    else if (node.prelude === '@layer theme') {
      for (const rule of node.children) if (rule.prelude === ':root') for (const [k, v] of rule.decls) source.primitives.set(k, v)
    } else if (node.prelude === '@layer base') {
      for (const media of node.children) {
        const named = CONDITION_NAMES.find(([re]) => re.test(media.prelude))
        if (!named || !media.prelude.startsWith('@media')) throw new Error(`Unrecognised re-map block: ${media.prelude}`)
        const decls = new Map<string, string>()
        for (const rule of media.children) if (rule.prelude === ':root') for (const [k, v] of rule.decls) decls.set(k, v)
        source.conditions.set(named[1], { media: media.prelude.replace(/^@media\s*/, ''), decls })
      }
    } else if (node.prelude !== '@theme' && !node.prelude.startsWith('@import')) {
      throw new Error(`Unexpected block in the token source: ${node.prelude}`)
    }
  }
  for (const { decls } of source.conditions.values()) {
    for (const name of decls.keys()) if (!source.semantic.has(name)) throw new Error(`${name} is re-mapped but is not a Tier 2 token (T-05)`)
  }
  return source
}

// --- Names ------------------------------------------------------------------

/** Tailwind plumbing that points at tokens but is not one. */
const NOT_TOKENS = /^--(default-|\*$)/

const PREFIXES: [string, string[]][] = ([
  ['--color-', ['color']],
  ['--space-', ['space']],
  ['--spacing-', ['space']],
  ['--font-size-', ['font', 'size']],
  ['--font-weight-', ['font', 'weight']],
  ['--font-line-height-', ['font', 'lineHeight']],
  ['--font-letter-spacing-', ['font', 'letterSpacing']],
  ['--font-', ['font', 'family']],
  ['--text-', ['text']],
  ['--radius-', ['radius']],
  ['--border-width-', ['border', 'width']],
  ['--shadow-', ['shadow']],
  ['--size-', ['size']],
  ['--container-', ['size', 'container']],
  ['--breakpoint-', ['breakpoint']],
  ['--grid-', ['grid']],
  ['--z-', ['z']],
  ['--motion-', ['motion']],
  ['--ease-', ['motion', 'easing']],
  ['--opacity-', ['opacity']],
] as [string, string[]][]).sort((a, b) => b[0].length - a[0].length)

export const isToken = (name: string): boolean => !NOT_TOKENS.test(name) && !name.slice(2).includes('--')

/** The DTCG path of a custom property, e.g. `--color-text-on-accent` → color.text.on-accent. */
export function tokenPath(name: string): string[] {
  const prefix = PREFIXES.find(([p]) => name.startsWith(p))
  if (!prefix) throw new Error(`${name} is in no token namespace`)
  const parts = name.slice(prefix[0].length).split('-')
  const segments: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const pair = `${parts[i]}-${parts[i + 1]}`
    if (i + 1 < parts.length && COMPOUND_TERMS.includes(pair)) {
      segments.push(pair)
      i++
    } else {
      segments.push(parts[i] as string)
    }
  }
  return [...prefix[1], ...segments]
}

const pathOf = (name: string): string => tokenPath(name).join('.')

// --- Values -----------------------------------------------------------------

const VAR = /^var\((--[\w-]+)\)$/

function alias(value: string): string | null {
  const m = VAR.exec(value)
  return m ? `{${pathOf(m[1] as string)}}` : null
}

/** A literal that embeds other tokens (color-mix, shadows) names them as `{path}`. */
const embedAliases = (value: string): string => value.replace(/var\((--[\w-]+)\)/g, (_m, name: string) => `{${pathOf(name)}}`)

function splitTopLevel(value: string, separator: RegExp): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const ch of value) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (depth === 0 && separator.test(ch)) {
      if (current.trim()) out.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) out.push(current.trim())
  return out
}

function shadowValue(value: string): unknown {
  return splitTopLevel(value, /,/).map(layer => {
    const [offsetX, offsetY, blur, spread, ...color] = splitTopLevel(layer, /\s/)
    return { color: embedAliases(color.join(' ')), offsetX, offsetY, blur, spread }
  })
}

function typeOf(path: string[]): string {
  const [category = '', concept = ''] = path
  switch (category) {
    case 'color': return 'color'
    case 'text': return 'typography'
    case 'shadow': return 'shadow'
    case 'z': case 'opacity': return 'number'
    case 'grid': return concept === 'columns' ? 'number' : 'dimension'
    case 'motion': return concept === 'duration' ? 'duration' : 'cubicBezier'
    case 'font':
      if (concept === 'family') return 'fontFamily'
      if (concept === 'weight') return 'fontWeight'
      if (concept === 'lineHeight') return 'number'
      return 'dimension'
    default: return 'dimension'
  }
}

function dtcgValue(type: string, value: string): unknown {
  const ref = alias(value)
  if (ref) return ref
  switch (type) {
    case 'number': case 'fontWeight': return Number(value)
    case 'fontFamily': return splitTopLevel(value, /,/).map(f => f.replace(/^"|"$/g, ''))
    case 'cubicBezier': {
      if (value === 'linear') return [0, 0, 1, 1]
      const m = /^cubic-bezier\(([^)]*)\)$/.exec(value)
      if (!m) throw new Error(`Not an easing: ${value}`)
      return (m[1] as string).split(',').map(Number)
    }
    case 'shadow': return shadowValue(value)
    default: return embedAliases(value)
  }
}

// --- tokens.json --------------------------------------------------------------

type Group = Record<string, unknown>

function place(tree: Group, path: string[], token: Group): void {
  let node = tree
  for (const segment of path.slice(0, -1)) {
    const next = node[segment] as Group | undefined
    if (next === undefined) node[segment] = {}
    else if ('$value' in next) node[segment] = { $root: next }
    node = node[segment] as Group
  }
  const leaf = path[path.length - 1] as string
  const existing = node[leaf] as Group | undefined
  if (existing === undefined) node[leaf] = token
  else if ('$value' in existing) throw new Error(`Duplicate token ${path.join('.')}`)
  else existing.$root = token
}

const TYPOGRAPHY_FIELDS: Record<string, string> = {
  'line-height': 'lineHeight', 'font-weight': 'fontWeight', 'letter-spacing': 'letterSpacing', 'font-family': 'fontFamily',
}

export function buildTokens(css: string, origin: string): Group {
  const source = readTokenSource(css)
  const tree: Group = {
    $description: `Generated from ${origin} by \`pnpm tokens\`. Do not edit: change the stylesheet and regenerate.`,
    $extensions: {
      dls: {
        standard: '1.4.0',
        implementation: 'T-08 option B: Tailwind v4 @theme is the source; this file is generated from it.',
        typeScale: 'Major third (1.25) on a 16 px base, T-16 option (a)',
        conditions: Object.fromEntries([...source.conditions].map(([name, { media }]) => [name, media])),
        vocabulary: VOCABULARY,
      },
    },
  }
  /** Re-maps as Appendix A.5 records them: the dark theme under dls.theme, density under dls.condition. */
  const remaps = (name: string): Record<string, Record<string, string>> => {
    const out: Record<string, Record<string, string>> = {}
    for (const [condition, { decls }] of source.conditions) {
      const value = decls.get(name)
      if (value === undefined) continue
      const key = condition === 'dark' ? 'dls.theme' : 'dls.condition'
      out[key] = { ...out[key], [condition]: alias(value) ?? embedAliases(value) }
    }
    return out
  }
  const add = (name: string, value: string, tier: 1 | 2, sub: Map<string, string>): void => {
    const path = tokenPath(name)
    const type = typeOf(path)
    let $value: unknown
    if (type === 'typography') {
      $value = {
        fontFamily: '{font.family.sans}',
        fontSize: dtcgValue('dimension', value),
        ...Object.fromEntries([...sub].map(([field, v]) => {
          const key = TYPOGRAPHY_FIELDS[field]
          if (!key) throw new Error(`${name}--${field} is not a typography field`)
          return [key, alias(v) ?? v]
        })),
      }
    } else {
      $value = dtcgValue(type, value)
    }
    place(tree, path, { $type: type, $value, $extensions: { 'dls.tier': tier, ...remaps(name) } })
  }
  const subProperties = (decls: Map<string, string>, name: string): Map<string, string> => {
    const out = new Map<string, string>()
    for (const [k, v] of decls) if (k.startsWith(`${name}--`)) out.set(k.slice(name.length + 2), v)
    return out
  }
  for (const [name, value] of source.primitives) if (isToken(name)) add(name, value, 1, new Map())
  for (const [name, value] of source.semantic) if (isToken(name)) add(name, value, 2, subProperties(source.semantic, name))
  return tree
}

export function serialiseTokens(tree: Group): string {
  return `${JSON.stringify(tree, null, 2)}\n`
}

// --- Resolution, for the contrast and vocabulary checks -------------------------

/** Every custom property's concrete value under a condition, var() chains followed. */
export function resolveTheme(source: TokenSource, condition: string | null): Map<string, string> {
  const raw = new Map<string, string>([...source.primitives, ...source.semantic])
  if (condition) {
    const remap = source.conditions.get(condition)
    if (!remap) throw new Error(`No condition ${condition}`)
    for (const [k, v] of remap.decls) raw.set(k, v)
  }
  const resolved = new Map<string, string>()
  const resolve = (name: string, seen: string[]): string => {
    const done = resolved.get(name)
    if (done !== undefined) return done
    if (seen.includes(name)) throw new Error(`Circular token: ${[...seen, name].join(' → ')}`)
    const value = raw.get(name)
    if (value === undefined) throw new Error(`Undefined token ${name}${seen.length ? ` (from ${seen.at(-1)})` : ''}`)
    const out = value.replace(/var\((--[\w-]+)\)/g, (_m, ref: string) => resolve(ref, [...seen, name]))
    resolved.set(name, out)
    return out
  }
  for (const name of raw.keys()) resolve(name, [])
  return resolved
}
