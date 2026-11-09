/**
 * Markdown fields render safely and keep the page outline: no raw HTML,
 * headings demoted, task keys as chips (but not inside code or links).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown } from '../src/Markdown.tsx'
import { splitKeys } from '../src/taskKeys.ts'

const html = (md: string, props: { inline?: boolean; taskHref?: (k: string) => string } = {}): string =>
  renderToStaticMarkup(<Markdown {...props}>{md}</Markdown>)

describe('splitKeys', () => {
  it('finds A and B keys as whole words', () => {
    expect(splitKeys('Ship A12 after B3 lands')).toEqual([{ text: 'Ship ' }, { key: 'A12' }, { text: ' after ' }, { key: 'B3' }, { text: ' lands' }])
    expect(splitKeys('A0, AB12, XA1 and a12 are not keys')).toEqual([{ text: 'A0, AB12, XA1 and a12 are not keys' }])
  })
})

describe('Markdown', () => {
  it('renders task keys as chips, and links them when asked', () => {
    expect(html('Draft it (A12)')).toContain('>A12</span>')
    expect(html('Draft it (A12)', { taskHref: k => `/w/x/board?task=${k}` })).toContain('href="/w/x/board?task=A12"')
  })

  it('leaves keys inside code and links alone', () => {
    const out = html('`A12` and [B3](https://example.com)')
    expect(out).toContain('<code class="rounded-control bg-bg-subtle px-inline-xs text-code">A12</code>')
    expect(out).toContain('>B3</a>')
    expect(out).not.toContain('font-mono')
  })

  it('never renders raw HTML', () => {
    const out = html('Hello <script>alert(1)</script><b onclick="x">bold</b>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('onclick')
  })

  it('demotes headings so a field never adds to the page outline (R-13)', () => {
    const out = html('# Big\n\n## Smaller')
    expect(out).not.toMatch(/<h[1-6]/)
    expect(out).toContain('<p class="text-heading-4">Big</p>')
  })

  it('renders a single paragraph inline when asked', () => {
    expect(html('Just **this**', { inline: true })).toBe('Just <strong>this</strong>')
  })
})
