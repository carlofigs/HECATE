import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APP_ROUTES } from './pwa-routes.ts'

/** wrangler.jsonc's run_worker_first: the paths the Worker answers before the assets. */
function workerPatterns(): string[] {
  const text = readFileSync(new URL('../../worker/wrangler.jsonc', import.meta.url), 'utf8')
  const block = /"run_worker_first":\s*\[([\s\S]*?)\]/.exec(text)?.[1] ?? ''
  return [...block.matchAll(/"([^"]+)"/g)].map(m => m[1] as string)
}

/** Concrete paths a pattern covers (`*` stands for any text). */
const examples = (pattern: string): string[] => [pattern.replace('*', 'x'), pattern.replace('*', 'x/y'), pattern.replace('/*', '')]

describe('the service worker’s app routes', () => {
  it('cover the app: the home page and every workspace page', () => {
    for (const path of ['/', '/w/planning/today', '/w/_scratch-001/board']) expect(APP_ROUTES.some(r => r.test(path)), path).toBe(true)
  })

  it('never cover a path the Worker answers, so the service worker can never answer sign-in or the API', () => {
    const patterns = workerPatterns()
    expect(patterns).toContain('/auth/*')
    const covered = patterns.flatMap(examples).filter(path => APP_ROUTES.some(r => r.test(path)))
    expect(covered).toEqual([])
  })
})
