import { describe, expect, it } from 'vitest'
import {
  boardToRows,
  classifyWordProgress,
  createGame,
  findStraightWords,
  hasPlayableWord,
  isValidPath,
  makeBoardFromRows,
  positionsToWord,
  resolveSelectedWord,
  shuffleGame,
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

  it('classifies live word progress for drag feedback', () => {
    expect(classifyWordProgress('')).toBe('idle')
    expect(classifyWordProgress('CA')).toBe('building')
    expect(classifyWordProgress('CAT')).toBe('word')
    expect(classifyWordProgress('QZX')).toBe('dead')
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
    expect(result.nextState.score).toBeGreaterThanOrEqual(90)
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

  it('creates boards with visible straight-word opportunities and a playable state', () => {
    const game = createGame(17)
    const straightWords = findStraightWords(game.board)

    expect(straightWords.length).toBeGreaterThanOrEqual(1)
    expect(hasPlayableWord(game.board)).toBe(true)
  })

  it('avoids seeding fallback boards with harsh junk rows', () => {
    const game = createGame(17)
    const rows = boardToRows(game.board)

    expect(rows.some((row) => /QZX|ZXQ|XQZ/.test(row))).toBe(false)
  })

  it('supports shuffle with a score penalty and a fresh playable board', () => {
    const state = createGame({
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

    const shuffled = shuffleGame({ ...state, score: 120 })

    expect(shuffled.score).toBe(45)
    expect(shuffled.turn).toBe(1)
    expect(hasPlayableWord(shuffled.board)).toBe(true)
  })

  it('only auto-clears words touched by falling tiles', () => {
    const result = resolveSelectedWord(
      makeBoardFromRows([
        'CATQZX',
        'DOGQZX',
        'ZZZQZX',
        'ZZZQZX',
        'ZZZQZX',
        'ZZZQZX',
      ]),
      [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      23,
    )

    expect(result.wordsCleared).toEqual(['CAT'])
    expect(result.totalWordsCleared).toBe(1)
  })

  it('resolves a selected word to a finite animation queue', () => {
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

    expect(result.steps.length).toBeLessThan(40)
    expect(result.steps.at(-1)?.phase).toBe('refill')
  })
})
