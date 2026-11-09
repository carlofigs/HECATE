/**
 * The token layer's conformance checks (DESIGN-STANDARD R-02, R-03, R-07,
 * R-16, R-17, R-21, T-02, T-05, T-07, T-09, T-14, T-15, T-19), run on the
 * stylesheet itself so they cannot drift from what the app renders.
 */
import { readFileSync } from 'node:fs'
import { wcagContrast } from 'culori'
import { describe, expect, it } from 'vitest'
import { buildTokens, isToken, readTokenSource, resolveTheme, serialiseTokens, tokenPath } from '../scripts/tokens.ts'
import { VOCABULARY, tokenTerms } from '../scripts/vocabulary.ts'

const CSS = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8')
const TOKENS_JSON = new URL('../../../design/tokens/tokens.json', import.meta.url)
const FOUNDATIONS = readFileSync(new URL('../../../design/foundations.md', import.meta.url), 'utf8')
const source = readTokenSource(CSS)
const names = [...source.primitives.keys(), ...source.semantic.keys()].filter(isToken)
const THEMES = { light: resolveTheme(source, null), dark: resolveTheme(source, 'dark') }

/** A CSS length in px (rem at the 16 px root). */
function px(value: string): number {
  const m = /^(-?[\d.]+)(px|rem)$/.exec(value)
  if (!m) throw new Error(`Not a length: ${value}`)
  return Number(m[1]) * (m[2] === 'rem' ? 16 : 1)
}

describe('tokens.json', () => {
  it('is generated from theme.css and committed (T-09); run `pnpm tokens` after changing the stylesheet', () => {
    expect(readFileSync(TOKENS_JSON, 'utf8')).toBe(serialiseTokens(buildTokens(CSS, 'packages/ui/src/theme.css')))
  })
})

describe('names', () => {
  it('use only declared vocabulary (T-06, T-07)', () => {
    const terms = tokenTerms()
    const unknown = names.flatMap(name => {
      const [category, ...rest] = tokenPath(name)
      return [
        ...(VOCABULARY.categories.includes(category as never) ? [] : [`${name}: category ${category}`]),
        ...rest.filter(s => !terms.has(s)).map(s => `${name}: ${s}`),
      ]
    })
    expect(unknown).toEqual([])
  })

  it('use every declared term, and foundations.md lists each one (T-07)', () => {
    const used = new Set(names.flatMap(tokenPath))
    const terms = [...tokenTerms()]
    expect(terms.filter(t => !used.has(t))).toEqual([])
    const props = Object.values(VOCABULARY.props).flat()
    expect([...terms, ...props].filter(t => !FOUNDATIONS.includes(`\`${t}\``))).toEqual([])
  })
})

describe('tiers', () => {
  it('define every semantic colour role before anything is styled (R-21)', () => {
    const required = [
      'bg-canvas', 'bg-surface', 'bg-raised', 'bg-subtle',
      'text-primary', 'text-secondary', 'text-muted', 'text-inverse', 'text-link',
      'border-default', 'border-strong', 'border-subtle', 'border-focus',
      'accent-default', 'accent-hover', 'accent-active', 'accent-text', 'accent-bg-subtle',
      ...['success', 'warning', 'danger', 'info'].flatMap(s => ['bg', 'text', 'border', 'icon'].map(p => `status-${s}-${p}`)),
    ].map(r => `--color-${r}`)
    expect(required.filter(r => !source.semantic.has(r))).toEqual([])
  })

  it('keep literal colours in Tier 1: every semantic colour aliases a primitive (T-01, T-02)', () => {
    const literal = [...source.semantic].filter(([k, v]) => k.startsWith('--color-') && !v.includes('var(--color-'))
    expect(literal).toEqual([])
  })

  it('re-map only Tier 2 tokens under a theme or density condition (T-05)', () => {
    for (const { decls } of source.conditions.values()) for (const name of decls.keys()) expect(source.semantic.has(name)).toBe(true)
    expect([...source.conditions.keys()].sort()).toEqual(['dark', 'touch'])
  })

  it('take dark accent and status colours from ramp steps 200–400 (T-15)', () => {
    const dark = source.conditions.get('dark')?.decls ?? new Map<string, string>()
    const offRamp = [...dark].filter(([k, v]) => /^--color-(accent|status)-/.test(k) && !k.endsWith('-bg') && !k.endsWith('-bg-subtle') && !/-(200|300|400)\)$/.test(v))
    expect(offRamp).toEqual([])
  })

  it('set exactly one control and one container radius (T-19)', () => {
    expect([...source.semantic.keys()].filter(k => k.startsWith('--radius-'))).toEqual(['--radius-control', '--radius-container', '--radius-pill'])
  })
})

/** The pairs each theme must pass, with the ratio each needs (R-02, R-03, T-14). */
const BACKGROUNDS = ['bg-canvas', 'bg-surface', 'bg-surface-hover', 'bg-raised', 'bg-subtle']
const PAIRS: [string, string, number][] = [
  ...['text-primary', 'text-secondary', 'text-muted', 'text-link', 'accent-text'].flatMap(t => BACKGROUNDS.map(b => [t, b, 4.5] as [string, string, number])),
  ['text-primary', 'accent-bg-subtle', 4.5],
  ['accent-text', 'accent-bg-subtle', 4.5],
  ['text-on-accent', 'accent-default', 4.5],
  ['text-on-accent', 'accent-hover', 4.5],
  ['text-on-accent', 'accent-active', 4.5],
  ['text-inverse', 'text-primary', 4.5],
  ...['border-default', 'border-strong', 'border-focus'].flatMap(t => BACKGROUNDS.map(b => [t, b, 3] as [string, string, number])),
  ['border-focus', 'accent-bg-subtle', 3],
  ...['success', 'warning', 'danger', 'info'].flatMap(s => [
    [`status-${s}-text`, `status-${s}-bg`, 4.5],
    [`status-${s}-text`, 'bg-surface', 4.5],
    [`status-${s}-border`, `status-${s}-bg`, 3],
    [`status-${s}-border`, 'bg-surface', 3],
    [`status-${s}-icon`, `status-${s}-bg`, 3],
    [`status-${s}-icon`, 'bg-surface', 3],
  ] as [string, string, number][]),
]

describe.each(Object.entries(THEMES))('the %s theme', (_name, theme) => {
  it.each(PAIRS)('%s on %s reaches %s:1 (R-02, R-03, T-14, T-15)', (fg, bg, needed) => {
    const ratio = wcagContrast(theme.get(`--color-${fg}`) as string, theme.get(`--color-${bg}`) as string)
    expect(ratio).toBeGreaterThanOrEqual(needed)
  })
})

describe('type', () => {
  const light = THEMES.light
  it('keeps body text at 16 px or more and captions at 12 px or more (R-16)', () => {
    expect(px(light.get('--text-body-md') as string)).toBeGreaterThanOrEqual(16)
    for (const small of ['--text-body-sm', '--text-label', '--text-caption', '--text-code']) expect(px(light.get(small) as string)).toBeGreaterThanOrEqual(12)
  })

  it('keeps body leading within 1.4–1.6 and headings within 1.1–1.3 (R-17)', () => {
    for (const body of ['body-lg', 'body-md', 'body-sm']) {
      const lh = Number(light.get(`--text-${body}--line-height`))
      expect(lh).toBeGreaterThanOrEqual(1.4)
      expect(lh).toBeLessThanOrEqual(1.6)
    }
    for (const heading of ['display', 'heading-1', 'heading-2', 'heading-3', 'heading-4']) {
      const lh = Number(light.get(`--text-${heading}--line-height`))
      expect(lh).toBeGreaterThanOrEqual(1.1)
      expect(lh).toBeLessThanOrEqual(1.3)
    }
  })
})

describe('targets', () => {
  const touch = resolveTheme(source, 'touch')
  it('meet 24 px with a fine pointer and 44 px when touch-first (R-07, M-app-01)', () => {
    expect(px(THEMES.light.get('--size-target-default') as string)).toBeGreaterThanOrEqual(24)
    expect(px(THEMES.light.get('--size-control-default') as string)).toBeGreaterThanOrEqual(24)
    expect(px(touch.get('--size-target-default') as string)).toBeGreaterThanOrEqual(44)
    expect(px(touch.get('--size-control-default') as string)).toBeGreaterThanOrEqual(44)
    expect(source.conditions.get('touch')?.media).toMatch(/any-pointer:\s*coarse/)
  })
})
