/**
 * `pnpm tokens`: regenerate design/tokens/tokens.json from src/theme.css.
 * The token tests fail while the committed file differs from what this writes.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { buildTokens, serialiseTokens } from './tokens.ts'

const SOURCE = new URL('../src/theme.css', import.meta.url)
const TARGET = new URL('../../../design/tokens/tokens.json', import.meta.url)

writeFileSync(TARGET, serialiseTokens(buildTokens(readFileSync(SOURCE, 'utf8'), 'packages/ui/src/theme.css')))
console.log(`Wrote ${TARGET.pathname.replace(/^.*\/design\//, 'design/')}`)
