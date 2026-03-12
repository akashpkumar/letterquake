import { BOARD_SIZE, FALLBACK_BOARD_ROWS, LETTER_WEIGHTS } from './constants'
import { COMMON_WORDS, DICTIONARY_SET } from './dictionary'
import type {
  Board,
  CreateGameOptions,
  FoundWord,
  GameState,
  Position,
  ResolutionResult,
  Tile,
  TurnResult,
  TurnStep,
} from './types'

const MAX_GENERATION_ATTEMPTS = 120
const MIN_WORD_LENGTH = 3

let tileSequence = 0

function makeTile(letter: string): Tile {
  tileSequence += 1
  return { id: `tile-${tileSequence}`, letter }
}

function clonePosition(position: Position): Position {
  return { row: position.row, col: position.col }
}

function hashPosition(position: Position): string {
  return `${position.row}:${position.col}`
}

function nextSeed(seed: number): number {
  return (seed * 1664525 + 1013904223) >>> 0
}

function randomFloat(seed: number): [number, number] {
  const updatedSeed = nextSeed(seed)
  return [updatedSeed / 0x100000000, updatedSeed]
}

function pickWeightedLetter(seed: number): [string, number] {
  const totalWeight = LETTER_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0)
  const [roll, updatedSeed] = randomFloat(seed)
  let threshold = roll * totalWeight

  for (const [letter, weight] of LETTER_WEIGHTS) {
    threshold -= weight
    if (threshold <= 0) {
      return [letter, updatedSeed]
    }
  }

  return [LETTER_WEIGHTS[LETTER_WEIGHTS.length - 1][0], updatedSeed]
}

function scoreWord(length: number, combo: number): number {
  return length * length * 10 * combo
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((tile) => (tile ? { ...tile } : null)))
}

export function makeBoardFromRows(rows: string[]): Board {
  return rows.map((row) =>
    row.split('').map((letter) => (letter === '.' ? null : makeTile(letter))),
  )
}

export function boardToRows(board: Board): string[] {
  return board.map((row) => row.map((tile) => tile?.letter ?? '.').join(''))
}

export function positionsToWord(board: Board, positions: Position[]): string {
  return positions.map((position) => board[position.row][position.col]?.letter ?? '').join('')
}

export function areAdjacent(a: Position, b: Position): boolean {
  const rowDistance = Math.abs(a.row - b.row)
  const colDistance = Math.abs(a.col - b.col)
  return rowDistance <= 1 && colDistance <= 1 && (rowDistance !== 0 || colDistance !== 0)
}

export function isValidPath(board: Board, positions: Position[]): boolean {
  if (positions.length < MIN_WORD_LENGTH) {
    return false
  }

  const seen = new Set<string>()
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index]
    const tile = board[position.row]?.[position.col]
    const key = hashPosition(position)

    if (!tile || seen.has(key)) {
      return false
    }

    if (index > 0 && !areAdjacent(positions[index - 1], position)) {
      return false
    }

    seen.add(key)
  }

  return true
}

function removeWord(board: Board, word: FoundWord): { board: Board; cleared: Position[] } {
  const nextBoard = cloneBoard(board)
  word.positions.forEach((position) => {
    nextBoard[position.row][position.col] = null
  })
  return { board: nextBoard, cleared: word.positions.map(clonePosition) }
}

function applyGravity(board: Board): { board: Board; moved: Position[] } {
  const nextBoard = board.map((row) => row.map(() => null as Tile | null))
  const moved: Position[] = []

  for (let col = 0; col < board[0].length; col += 1) {
    let targetRow = board.length - 1
    for (let row = board.length - 1; row >= 0; row -= 1) {
      const tile = board[row][col]
      if (!tile) {
        continue
      }

      nextBoard[targetRow][col] = tile
      if (targetRow !== row) {
        moved.push({ row: targetRow, col })
      }
      targetRow -= 1
    }
  }

  return { board: nextBoard, moved }
}

function refillBoard(board: Board, seed: number): { board: Board; spawned: Position[]; seed: number } {
  const nextBoard = cloneBoard(board)
  const spawned: Position[] = []
  let currentSeed = seed

  for (let col = 0; col < board[0].length; col += 1) {
    for (let row = 0; row < board.length; row += 1) {
      if (nextBoard[row][col] !== null) {
        continue
      }

      const [letter, updatedSeed] = pickWeightedLetter(currentSeed)
      currentSeed = updatedSeed
      nextBoard[row][col] = makeTile(letter)
      spawned.push({ row, col })
    }
  }

  return { board: nextBoard, spawned, seed: currentSeed }
}

export function resolveSelectedWord(
  board: Board,
  selection: Position[],
  rngSeed: number,
): ResolutionResult {
  const word = positionsToWord(board, selection)
  const resolvedWord: FoundWord = {
    word,
    positions: selection.map(clonePosition),
  }

  const { board: clearedBoard, cleared } = removeWord(board, resolvedWord)
  const { board: gravityBoard, moved } = applyGravity(clearedBoard)
  const { board: refilledBoard, spawned, seed } = refillBoard(gravityBoard, rngSeed)
  const scoreDelta = scoreWord(word.length, 1)

  const steps: TurnStep[] = [
    {
      phase: 'clear',
      board: cloneBoard(board),
      words: [resolvedWord],
      clearedPositions: cleared,
      movedPositions: [],
      spawnedPositions: [],
      combo: 1,
      scoreDelta,
    },
    {
      phase: 'pause-clear',
      board: cloneBoard(clearedBoard),
      words: [],
      clearedPositions: [],
      movedPositions: [],
      spawnedPositions: [],
      combo: 1,
      scoreDelta: 0,
    },
    {
      phase: 'gravity',
      board: cloneBoard(gravityBoard),
      words: [],
      clearedPositions: [],
      movedPositions: moved,
      spawnedPositions: [],
      combo: 1,
      scoreDelta: 0,
    },
    {
      phase: 'pause-refill',
      board: cloneBoard(gravityBoard),
      words: [],
      clearedPositions: [],
      movedPositions: [],
      spawnedPositions: [],
      combo: 1,
      scoreDelta: 0,
    },
    {
      phase: 'refill',
      board: cloneBoard(refilledBoard),
      words: [],
      clearedPositions: [],
      movedPositions: [],
      spawnedPositions: spawned,
      combo: 1,
      scoreDelta: 0,
    },
  ]

  return {
    board: refilledBoard,
    steps,
    scoreDelta,
    wordsCleared: [word],
    totalWordsCleared: 1,
    highestCombo: 1,
    rngSeed: seed,
  }
}

function neighbors(position: Position, board: Board): Position[] {
  const result: Position[] = []
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) {
        continue
      }

      const row = position.row + rowOffset
      const col = position.col + colOffset
      if (row < 0 || col < 0 || row >= board.length || col >= board[0].length) {
        continue
      }
      if (board[row][col]) {
        result.push({ row, col })
      }
    }
  }
  return result
}

function buildPrefixSet(words: string[]): Set<string> {
  const prefixes = new Set<string>()
  words.forEach((word) => {
    for (let index = 1; index <= word.length; index += 1) {
      prefixes.add(word.slice(0, index))
    }
  })
  return prefixes
}

const PREFIX_SET = buildPrefixSet(COMMON_WORDS)

export function hasPlayableWord(board: Board): boolean {
  const seen = new Set<string>()

  function dfs(position: Position, currentWord: string, visited: Set<string>): boolean {
    const tile = board[position.row][position.col]
    if (!tile) {
      return false
    }

    const nextWord = currentWord + tile.letter
    if (!PREFIX_SET.has(nextWord)) {
      return false
    }

    if (nextWord.length >= MIN_WORD_LENGTH && DICTIONARY_SET.has(nextWord)) {
      return true
    }

    const nextVisited = new Set(visited)
    nextVisited.add(hashPosition(position))

    for (const neighbor of neighbors(position, board)) {
      const key = hashPosition(neighbor)
      if (nextVisited.has(key)) {
        continue
      }
      if (dfs(neighbor, nextWord, nextVisited)) {
        return true
      }
    }

    return false
  }

  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      const tile = board[row][col]
      if (!tile) {
        continue
      }

      const rootKey = `${row}:${col}:${tile.letter}`
      if (seen.has(rootKey)) {
        continue
      }
      seen.add(rootKey)

      if (dfs({ row, col }, '', new Set())) {
        return true
      }
    }
  }

  return false
}

function baseState(board: Board, seed: number): GameState {
  const gameOver = !hasPlayableWord(board)

  return {
    board,
    score: 0,
    turn: 0,
    totalWordsCleared: 0,
    highestCombo: 0,
    combo: 0,
    turnStatus: gameOver ? 'game-over' : 'ready',
    selectedPath: [],
    animationQueue: [],
    lastWords: [],
    lastScoreDelta: 0,
    gameOver,
    rngSeed: seed,
  }
}

function createRandomBoard(seed: number): { board: Board; seed: number } {
  let currentSeed = seed

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const emptyBoard = Array.from({ length: BOARD_SIZE }, () =>
      Array.from({ length: BOARD_SIZE }, () => null as Tile | null),
    )
    const { board, seed: updatedSeed } = refillBoard(emptyBoard, currentSeed)
    currentSeed = updatedSeed

    if (hasPlayableWord(board)) {
      return { board, seed: currentSeed }
    }
  }

  return {
    board: makeBoardFromRows(FALLBACK_BOARD_ROWS),
    seed: currentSeed,
  }
}

export function createGame(options?: number | CreateGameOptions): GameState {
  const seed =
    typeof options === 'number'
      ? options
      : options?.seed ?? (Date.now() >>> 0)

  if (typeof options === 'object' && options?.board) {
    return baseState(cloneBoard(options.board), seed)
  }

  const { board, seed: nextGameSeed } = createRandomBoard(seed)
  return baseState(board, nextGameSeed)
}

export function submitSelection(state: GameState, selection: Position[]): TurnResult {
  if (state.gameOver) {
    return { valid: false, reason: 'game-over', nextState: state, steps: [] }
  }

  if (selection.length < MIN_WORD_LENGTH) {
    return { valid: false, reason: 'too-short', nextState: state, steps: [] }
  }

  if (!isValidPath(state.board, selection)) {
    const keys = selection.map(hashPosition)
    const uniqueCount = new Set(keys).size
    return {
      valid: false,
      reason: uniqueCount !== keys.length ? 'duplicate' : 'not-adjacent',
      nextState: state,
      steps: [],
    }
  }

  const word = positionsToWord(state.board, selection)
  if (!DICTIONARY_SET.has(word)) {
    return { valid: false, reason: 'not-word', nextState: state, steps: [] }
  }

  const resolution = resolveSelectedWord(state.board, selection, state.rngSeed)
  const gameOver = !hasPlayableWord(resolution.board)

  const nextState: GameState = {
    board: resolution.board,
    score: state.score + resolution.scoreDelta,
    turn: state.turn + 1,
    totalWordsCleared: state.totalWordsCleared + resolution.totalWordsCleared,
    highestCombo: Math.max(state.highestCombo, resolution.highestCombo),
    combo: resolution.highestCombo,
    turnStatus: gameOver ? 'game-over' : 'ready',
    selectedPath: [],
    animationQueue: resolution.steps,
    lastWords: resolution.wordsCleared,
    lastScoreDelta: resolution.scoreDelta,
    gameOver,
    rngSeed: resolution.rngSeed,
  }

  return {
    valid: true,
    nextState,
    steps: resolution.steps,
  }
}
