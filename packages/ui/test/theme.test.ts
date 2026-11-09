/**
 * theme.css compiled by Tailwind exactly as an app compiles it: HECATE's
 * semantic tokens are the only vocabulary (R-15, T-04). A utility built on
 * Tailwind's default scale, or on a primitive, generates nothing.
 */
import { compile } from '@tailwindcss/node'
import { describe, expect, it } from 'vitest'

const BASE = new URL('..', import.meta.url).pathname
const ENTRY = `@import 'tailwindcss';\n@import './src/theme.css';\n`
const compiler = () => compile(ENTRY, { base: BASE, onDependency: () => {} })

/** The body of the utilities layer one class generates, from a fresh compiler (builds accumulate). */
async function rule(className: string): Promise<string> {
  const css = (await compiler()).build([className])
  const start = css.indexOf('@layer utilities {')
  if (start < 0) return ''
  let depth = 0
  for (let i = start; i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', start) + 1, i).trim()
  }
  throw new Error('Unbalanced CSS')
}

describe('the Tailwind theme', () => {
  it.each([
    'bg-bg-canvas', 'bg-bg-surface-hover', 'text-text-primary', 'text-text-on-accent', 'bg-accent-default', 'border-border-default',
    'text-status-danger-text', 'p-inset-md', 'gap-stack-sm', 'px-inline-lg', 'p-0', 'text-body-md', 'text-heading-1', 'font-mono',
    'rounded-control', 'rounded-pill', 'shadow-raised', 'max-w-prose', 'ease-standard',
    'min-h-(--size-control-default)', 'z-(--z-modal)', 'duration-(--motion-duration-fast)',
  ])('generates %s from a token', async className => {
    expect(await rule(className)).toMatch(/var\(--/)
  })

  it.each([['sm:flex', '40rem'], ['md:flex', '48rem'], ['lg:grid', '64rem'], ['xl:flex', '80rem'], ['2xl:flex', '96rem']])(
    'resolves the %s breakpoint from breakpoint tokens (%s)', async (className, width) => {
      expect(await rule(className)).toContain(`(width >= ${width})`)
    },
  )

  it.each([
    'p-4', 'gap-2', 'w-64', 'bg-slate-500', 'text-neutral-950', 'bg-neutral-50', 'bg-amber-400', 'text-sm', 'text-xs',
    'rounded-md', 'rounded-lg', 'shadow-md', 'font-bold', 'leading-tight', 'tracking-tight', 'max-w-md', 'ease-in-out', '3xl:flex',
  ])('generates nothing for %s, which is off the token scale', async className => {
    expect(await rule(className)).toBe('')
  })

  it('emits the dark theme and the touch-first density as re-maps', async () => {
    const css = (await compiler()).build([])
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)/)
    expect(css).toMatch(/@media \(any-pointer: coarse\), \(width < 48rem\)/)
    expect(css).toContain('--color-text-primary: var(--color-neutral-950)')
  })
})
