import { describe, expect, it } from 'vitest'
import { commitMessage } from '../src/commit-message.ts'

describe('commitMessage', () => {
  it('names the workspace and the first change, lists every change, and traces actors and batches', () => {
    expect(commitMessage('work', [
      { opId: 'op-1', actor: 'claude', summary: ['Added A3 “Draw the target view”', 'Updated A2'] },
      { opId: 'op-2', actor: 'app', summary: ['Completed A1'] },
    ])).toBe([
      'work: Added A3 “Draw the target view” (+2 more)',
      '',
      '- Added A3 “Draw the target view”',
      '- Updated A2',
      '- Completed A1',
      '',
      'Actor: claude, app',
      'Op-Id: op-1',
      'Op-Id: op-2',
    ].join('\n'))
  })

  it('keeps the subject to 72 characters', () => {
    const subject = commitMessage('work', [{ opId: 'x', actor: 'app', summary: [`Added A3 “${'a very long title '.repeat(6)}”`, 'Second'] }]).split('\n')[0] ?? ''
    expect(subject.length).toBeLessThanOrEqual(72)
    expect(subject).toMatch(/… \(\+1 more\)$/)
  })
})
