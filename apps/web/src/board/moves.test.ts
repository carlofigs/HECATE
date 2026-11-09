import { describe, expect, it } from 'vitest'
import { arrangeOver, menuMove, moveOp, restoreOp, type Arrangement } from './moves.ts'

const board: Arrangement = { todo: ['A1', 'A2', 'A3'], doing: ['A4'], done: [] }

describe('dragging', () => {
  it('moving down a column lands after the card it is dropped on, not one short', () => {
    const next = arrangeOver(board, 'A1', 'A2')
    expect(next.todo).toEqual(['A2', 'A1', 'A3'])
    expect(moveOp(board, next, 'A1')).toEqual({ type: 'task.move', task: 'A1', status: 'todo', after: 'A2' })
  })

  it('moving up a column lands before the card it is dropped on', () => {
    const next = arrangeOver(board, 'A3', 'A1')
    expect(next.todo).toEqual(['A3', 'A1', 'A2'])
    expect(moveOp(board, next, 'A3')).toEqual({ type: 'task.move', task: 'A3', status: 'todo', after: null })
  })

  it('moves across columns: onto a card takes its place, onto a column goes to the end', () => {
    const onCard = arrangeOver(board, 'A2', 'A4')
    expect(onCard).toEqual({ todo: ['A1', 'A3'], doing: ['A2', 'A4'], done: [] })
    expect(moveOp(board, onCard, 'A2')).toEqual({ type: 'task.move', task: 'A2', status: 'doing', after: null })
    const onEmpty = arrangeOver(board, 'A2', 'done')
    expect(moveOp(board, onEmpty, 'A2')).toEqual({ type: 'task.move', task: 'A2', status: 'done', after: null })
    const onColumn = arrangeOver(board, 'A1', 'doing')
    expect(moveOp(board, onColumn, 'A1')).toEqual({ type: 'task.move', task: 'A1', status: 'doing', after: 'A4' })
  })

  it('a drag that ends where it started is no move', () => {
    expect(moveOp(board, arrangeOver(board, 'A2', 'A2'), 'A2')).toBeNull()
    expect(moveOp(board, arrangeOver(arrangeOver(board, 'A1', 'A2'), 'A1', 'A1'), 'A1')).not.toBeNull()
  })
})

describe('the Move menu', () => {
  it('moves within a column', () => {
    expect(menuMove(board, 'A2', 'top')).toEqual({ type: 'task.move', task: 'A2', status: 'todo', after: null })
    expect(menuMove(board, 'A2', 'up')).toEqual({ type: 'task.move', task: 'A2', status: 'todo', after: null })
    expect(menuMove(board, 'A2', 'down')).toEqual({ type: 'task.move', task: 'A2', status: 'todo', after: 'A3' })
    expect(menuMove(board, 'A2', 'bottom')).toEqual({ type: 'task.move', task: 'A2', status: 'todo', after: 'A3' })
  })

  it('does nothing at the ends', () => {
    expect(menuMove(board, 'A1', 'up')).toBeNull()
    expect(menuMove(board, 'A1', 'top')).toBeNull()
    expect(menuMove(board, 'A3', 'down')).toBeNull()
    expect(menuMove(board, 'A4', 'bottom')).toBeNull()
  })

  it('moves to the end of another status', () => {
    expect(menuMove(board, 'A1', { status: 'doing' })).toEqual({ type: 'task.move', task: 'A1', status: 'doing', after: 'A4' })
    expect(menuMove(board, 'A1', { status: 'done' })).toEqual({ type: 'task.move', task: 'A1', status: 'done', after: null })
    expect(menuMove(board, 'A1', { status: 'todo' })).toBeNull()
  })
})

describe('undo', () => {
  it('puts a card back exactly where it was', () => {
    expect(restoreOp(board, 'A2')).toEqual({ type: 'task.move', task: 'A2', status: 'todo', after: 'A1' })
    expect(restoreOp(board, 'A1')).toEqual({ type: 'task.move', task: 'A1', status: 'todo', after: null })
  })
})
