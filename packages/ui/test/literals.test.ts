/**
 * R-15: every visual value in component and page code resolves to a token.
 * Tailwind's reset theme already refuses off-scale utilities (theme.test.ts);
 * this catches what still gets through: arbitrary values, Tailwind's
 * scale-free numeric utilities, raw colours and theme logic in components.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = new URL('../../../', import.meta.url).pathname
/** Where v2 UI code lives. theme.css is the token source, so it is the one place literals belong. */
const ROOTS = ['packages/ui/src', 'apps/web/src']
const TOKEN_SOURCE = 'packages/ui/src/theme.css'

const RULES: [RegExp, string][] = [
  [/#[0-9a-fA-F]{3,8}\b/, 'hex colour'],
  [/\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\(/, 'colour function'],
  [/(?<![\w-])-?\d*\.?\d+(?:px|ms)\b/, 'px or ms literal'],
  [/z-index:\s*\d/, 'z-index literal'],
  [/(?<![\w-])[a-z][\w:-]*-\[[^\]]+\]/, 'arbitrary Tailwind value'],
  [/(?<![\w-])(?:[a-z-]+:)*(?:z|duration|delay|opacity|border(?:-[xytrbl])?|outline|ring|ring-offset|stroke)-\d/, 'scale-free numeric utility'],
  [/(?<![\w-])dark:/, 'theme logic in a component (T-05)'],
]

function files(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' || name.startsWith('__') ? [] : files(path)
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('literal values outside the token layer (R-15)', () => {
  const sources = ROOTS.flatMap(root => files(join(REPO, root))).filter(f => relative(REPO, f) !== TOKEN_SOURCE)

  it('scans the token layer and every v2 UI source', () => {
    expect(sources.map(f => relative(REPO, f))).toContain('packages/ui/src/base.css')
  })

  it('finds none', () => {
    const found: string[] = []
    for (const file of sources) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$|\/\*.*?\*\//g, '')
        for (const [pattern, what] of RULES) if (pattern.test(code)) found.push(`${relative(REPO, file)}:${i + 1} ${what}: ${line.trim()}`)
      })
    }
    expect(found).toEqual([])
  })

  it('catches what it is meant to', () => {
    const samples = ['color: #fff', 'p-[13px]', 'z-10', 'hover:opacity-50', 'border-2', 'dark:bg-x', 'width: 12px', 'oklch(1 0 0)', 'duration-200']
    for (const sample of samples) expect(RULES.some(([p]) => p.test(sample)), sample).toBe(true)
    for (const fine of ['p-inset-md', 'min-h-(--size-control-default)', 'z-(--z-modal)', 'border', 'w-full', 'grid-cols-2']) {
      expect(RULES.some(([p]) => p.test(fine)), fine).toBe(false)
    }
  })
})
