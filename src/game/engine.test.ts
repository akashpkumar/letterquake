import { describe, expect, it } from 'vitest'
import {
  boardToRows,
  createGame,
  hasPlayableWord,
  isValidPath,
  makeBoardFromRows,
  positionsToWord,
  resolveSelectedWord,
  submitSelection,
} from './engine'

describe('engine', () => {
  it('builds a word from the selected positions', () => {
    const board = makeBoardFromRows([
      'CATQZX',
      'RLMNVB',
      'SPTUWE',
      'ODGHIK',
      'YJBCDF',
      'EGHIRT',
    ])

    expect(
      positionsToWord(board, [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ]),
    ).toBe('CAT')
  })

  it('validates adjacent non-repeating paths', () => {
    const board = makeBoardFromRows([
      'CATQZX',
      'RLMNVB',
      'SPTUWE',
      'ODGHIK',
      'YJBCDF',
      'EGHIRT',
    ])

    expect(
      isValidPath(board, [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ]),
    ).toBe(true)

    expect(
      isValidPath(board, [
        { row: 0, col: 0 },
        { row: 2, col: 2 },
        { row: 0, col: 2 },
      ]),
    ).toBe(false)
  })

  it('submitting a valid selected word scores and clears it', () => {
    const game = createGame({
      seed: 7,
      board: makeBoardFromRows([
        'CATQZX',
        'RLMNVB',
        'SPTUWE',
        'ODGHIK',
        'YJBCDF',
        'EGHIRT',
      ]),
    })

    const result = submitSelection(game, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ])

    expect(result.valid).toBe(true)
    expect(result.nextState.score).toBe(90)
    expect(result.steps[0].words[0].word).toBe('CAT')
  })

  it('gravity compacts columns downward after a selected word is removed', () => {
    const result = resolveSelectedWord(
      makeBoardFromRows([
        'XYZQZX',
        'CATNVB',
        'SPTUWE',
        'ODGHIK',
        'YJBCDF',
        'EGHIRT',
      ]),
      [
        { row: 1, col: 0 },
        { row: 1, col: 1 },
        { row: 1, col: 2 },
      ],
      19,
    )

    expect(boardToRows(result.steps[2].board)[1].startsWith('XYZ')).toBe(true)
  })

  it('refill restores board dimensions after clearing a word', () => {
    const result = resolveSelectedWord(
      makeBoardFromRows([
        'CATQZX',
        'RLMNVB',
        'SPTUWE',
        'ODGHIK',
        'YJBCDF',
        'EGHIRT',
      ]),
      [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      23,
    )

    expect(result.board).toHaveLength(6)
    expect(result.board.every((row) => row.length === 6)).toBe(true)
    expect(result.board.flat().every((tile) => tile !== null)).toBe(true)
  })

  it('rejects selections that are not words', () => {
    const game = createGame({
      seed: 7,
      board: makeBoardFromRows([
        'CATQZX',
        'ZXQZXQ',
        'XQZXQZ',
        'QZXQZX',
        'ZXQZXQ',
        'XQZXQZ',
      ]),
    })

    const result = submitSelection(game, [
      { row: 0, col: 3 },
      { row: 0, col: 4 },
      { row: 0, col: 5 },
    ])

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('not-word')
  })

  it('detects when a board has no playable words', () => {
    const board = makeBoardFromRows([
      'QZXQZX',
      'ZXQZXQ',
      'XQZXQZ',
      'QZXQZX',
      'ZXQZXQ',
      'XQZXQZ',
    ])

    expect(hasPlayableWord(board)).toBe(false)
    expect(createGame({ board, seed: 5 }).gameOver).toBe(true)
  })
})
