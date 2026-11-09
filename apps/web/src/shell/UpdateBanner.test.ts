import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { UpdateBanner } from './UpdateBanner.tsx'

describe('the update banner', () => {
  it('says a new version is ready and offers Reload', () => {
    const html = renderToStaticMarkup(createElement(UpdateBanner, { onReload: () => {} }))
    expect(html).toContain('role="status"')
    expect(html).toContain('A new version of HECATE is ready')
    expect(html).toContain('>Reload</button>')
  })
})
