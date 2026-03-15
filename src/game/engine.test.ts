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
      'CATQZ',
      'RLMNV',
      'SPTUW',
      'ODGHI',
      'YJBCD',
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
      'CATQZ',
      'RLMNV',
      'SPTUW',
      'ODGHI',
      'YJBCD',
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
        'CATQZ',
        'RLMNV',
        'SPTUW',
        'ODGHI',
        'YJBCD',
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
        'XYZQZ',
        'CATNV',
        'SPTUW',
        'ODGHI',
        'YJBCD',
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
        'CATQZ',
        'RLMNV',
        'SPTUW',
        'ODGHI',
        'YJBCD',
      ]),
      [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      23,
    )

    expect(result.board).toHaveLength(5)
    expect(result.board.every((row) => row.length === 5)).toBe(true)
    expect(result.board.flat().every((tile) => tile !== null)).toBe(true)
  })

  it('supports clear-board mode with a finite refill reserve', () => {
    const game = createGame({
      seed: 23,
      mode: 'clear-board',
      refillQueue: [
        { letter: 'A', kind: 'normal' },
        { letter: 'E', kind: 'normal' },
      ],
      board: makeBoardFromRows([
        'CAT..',
        '.....',
        '.....',
        '.....',
        '..DOG',
      ]),
    })

    const result = submitSelection(game, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ])

    expect(result.valid).toBe(true)
    expect(result.nextState.mode).toBe('clear-board')
    expect(result.nextState.refillQueue).toHaveLength(0)
    const visibleLetters = result.nextState.board
      .flat()
      .map((tile) => tile?.letter ?? null)
      .filter(Boolean)
    expect(visibleLetters).toContain('A')
    expect(visibleLetters).toContain('E')
    expect(result.nextState.board.flat().some((tile) => tile === null)).toBe(true)
    for (let col = 0; col < result.nextState.board[0].length; col += 1) {
      let seenGap = false
      for (let row = result.nextState.board.length - 1; row >= 0; row -= 1) {
        const tile = result.nextState.board[row][col]
        if (!tile) {
          seenGap = true
          continue
        }
        expect(seenGap).toBe(false)
      }
    }
  })

  it('wins clear-board mode when the board is emptied', () => {
    const game = createGame({
      seed: 19,
      mode: 'clear-board',
      refillQueue: [
        { letter: 'A', kind: 'normal' },
        { letter: 'E', kind: 'normal' },
      ],
      board: makeBoardFromRows([
        '.....',
        '.....',
        '.....',
        '.....',
        'CAT..',
      ]),
    })

    const result = submitSelection(game, [
      { row: 4, col: 0 },
      { row: 4, col: 1 },
      { row: 4, col: 2 },
    ])

    expect(result.valid).toBe(true)
    expect(result.nextState.won).toBe(true)
    expect(result.nextState.gameOver).toBe(true)
    expect(result.nextState.lastScoreDelta).toBeGreaterThan(result.steps[0].scoreDelta)
    expect(result.nextState.board.flat().every((tile) => tile === null)).toBe(true)
    expect(result.nextState.refillQueue).toHaveLength(2)
  })

  it('uses a limited rescue shuffle in clear-board mode without resetting the run', () => {
    const game = createGame({
      seed: 11,
      mode: 'clear-board',
      board: makeBoardFromRows([
        'CATQZ',
        'RLMNV',
        'SPTUW',
        'ODGHI',
        'YJBCD',
      ]),
      refillQueue: [
        { letter: 'A', kind: 'normal' },
        { letter: 'E', kind: 'normal' },
      ],
      shuffleCharges: 2,
    })

    const shuffled = shuffleGame(game)

    expect(shuffled.mode).toBe('clear-board')
    expect(shuffled.shuffleCharges).toBe(1)
    expect(shuffled.refillQueue).toEqual(game.refillQueue)
    expect(shuffled.score).toBe(game.score)
    expect(shuffled.board.flat().filter(Boolean)).toHaveLength(game.board.flat().filter(Boolean).length)
  })

  it('does not create floating tiles when rescue shuffle injects a playable word on a sparse board', () => {
    const game = createGame({
      seed: 17,
      mode: 'clear-board',
      board: makeBoardFromRows([
        '.....',
        '.....',
        'C....',
        'A....',
        'T....',
      ]),
      refillQueue: [],
      shuffleCharges: 1,
    })

    const shuffled = shuffleGame(game)

    for (let col = 0; col < shuffled.board[0].length; col += 1) {
      let seenGap = false
      for (let row = shuffled.board.length - 1; row >= 0; row -= 1) {
        const tile = shuffled.board[row][col]
        if (!tile) {
          seenGap = true
          continue
        }
        expect(seenGap).toBe(false)
      }
    }
  })

  it('adds bonus score when a gold tile is used', () => {
    const board = makeBoardFromRows(
      [
        'CATQZ',
        'RLMNV',
        'SPTUW',
        'ODGHI',
        'YJBCD',
      ],
      [{ position: { row: 0, col: 1 }, kind: 'gold' }],
    )

    const result = resolveSelectedWord(
      board,
      [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      23,
    )

    expect(result.scoreDelta).toBeGreaterThan(90)
  })

  it('keeps cracked tiles on the board after the first hit and breaks them on the second', () => {
    const board = makeBoardFromRows(
      [
        'CATQZ',
        'RLMNV',
        'SPTUW',
        'ODGHI',
        'YJBCD',
      ],
      [{ position: { row: 0, col: 1 }, kind: 'cracked' }],
    )

    const first = resolveSelectedWord(
      board,
      [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      23,
    )

    expect(first.steps[0].retainedPositions).toEqual([{ row: 0, col: 1 }])
    expect(first.steps[0].clearedPositions).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 2 },
    ])
    expect(first.steps[1].board[0][1]?.kind).toBe('cracked')
    expect(first.steps[1].board[0][1]?.state?.durability).toBe(1)

    const secondBoard = makeBoardFromRows(
      [
        'CATQZ',
        'RLMNV',
        'SPTUW',
        'ODGHI',
        'YJBCD',
      ],
      [{ position: { row: 0, col: 1 }, kind: 'cracked' }],
    )
    secondBoard[0][1] = {
      ...secondBoard[0][1]!,
      state: { durability: 1 },
    }

    const second = resolveSelectedWord(
      secondBoard,
      [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      23,
    )

    expect(second.steps[0].retainedPositions).toHaveLength(0)
    expect(second.steps[0].clearedPositions).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ])
  })

  it('keeps anchor tiles fixed while other letters fall around them', () => {
    const board = makeBoardFromRows(
      [
        'A....',
        'B....',
        'CATQZ',
        'D....',
        'E....',
      ],
      [{ position: { row: 3, col: 0 }, kind: 'anchor' }],
    )

    const game = createGame({ seed: 7, board })
    const result = submitSelection(game, [
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
    ])

    expect(result.valid).toBe(true)
    const gravityBoard = result.steps.find((step) => step.phase === 'gravity')?.board

    expect(gravityBoard?.[3][0]?.kind).toBe('anchor')
    expect(gravityBoard?.[2][0]?.letter).toBe('B')
    expect(gravityBoard?.[1][0]?.letter).toBe('A')
  })

  it('rejects selections that are not words', () => {
    const game = createGame({
      seed: 7,
      board: makeBoardFromRows([
        'CATQZ',
        'ZXQZX',
        'XQZXQ',
        'QZXQZ',
        'ZXQZX',
      ]),
    })

    const result = submitSelection(game, [
      { row: 0, col: 3 },
      { row: 0, col: 4 },
      { row: 1, col: 4 },
    ])

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('not-word')
  })

  it('detects when a board has no playable words', () => {
    const board = makeBoardFromRows([
      'QZXQZ',
      'ZXQZX',
      'XQZXQ',
      'QZXQZ',
      'ZXQZX',
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
        'CATQZ',
        'RLMNV',
        'SPTUW',
        'ODGHI',
        'YJBCD',
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
        'CATQZ',
        'DOGQZ',
        'ZZZQZ',
        'ZZZQZ',
        'ZZZQZ',
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

  it('does not double-count overlapping auto-clear words', () => {
    const result = resolveSelectedWord(
      makeBoardFromRows([
        'QZXQZ',
        'QZXQZ',
        'EATQZ',
        'CATEZ',
        'QZXQZ',
      ]),
      [
        { row: 3, col: 0 },
        { row: 3, col: 1 },
        { row: 3, col: 2 },
      ],
      23,
    )

    expect(result.wordsCleared).toEqual(['CAT', 'EAT'])
    expect(result.totalWordsCleared).toBe(2)
  })

  it('resolves a selected word to a finite animation queue', () => {
    const result = resolveSelectedWord(
      makeBoardFromRows([
        'CATQZ',
        'RLMNV',
        'SPTUW',
        'ODGHI',
        'YJBCD',
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
