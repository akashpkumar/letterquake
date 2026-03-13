import {
  BOARD_SIZE,
  CLUSTER_FOLLOWS,
  EASY_WORDS,
  FALLBACK_BOARD_ROWS,
  LETTER_WEIGHTS,
  REFILL_EASY_WORDS,
  SHUFFLE_PENALTY,
  TARGET_EASY_WORDS,
} from './constants'
import { COMMON_WORDS, DICTIONARY_SET } from './dictionary'
import { getTileDefinition, TILE_DEFINITIONS } from './tileRegistry'
import type {
  Board,
  CreateGameOptions,
  FoundWord,
  GameState,
  Position,
  ResolutionResult,
  Tile,
  TileKind,
  TurnResult,
  TurnStep,
} from './types'

const MIN_WORD_LENGTH = 3
const EASY_WORD_SET = new Set<string>(EASY_WORDS)
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U', 'Y'])
const HARSH_CONSONANTS = new Set(['J', 'Q', 'V', 'X', 'Z'])

let tileSequence = 0

function makeTile(letter: string, kind: TileKind = 'normal'): Tile {
  tileSequence += 1
  const definition = getTileDefinition(kind)

  return {
    id: `tile-${tileSequence}`,
    letter,
    kind,
    state: definition.createState?.(),
  }
}

function cloneTileWithLetter(tile: Tile, letter: string): Tile {
  return {
    ...tile,
    letter,
  }
}

function clonePosition(position: Position): Position {
  return { row: position.row, col: position.col }
}

function hashPosition(position: Position): string {
  return `${position.row}:${position.col}`
}

function collectUniquePositions(words: FoundWord[]): Position[] {
  const positions = new Map<string, Position>()

  words.forEach((word) => {
    word.positions.forEach((position) => {
      positions.set(hashPosition(position), clonePosition(position))
    })
  })

  return [...positions.values()]
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

function pickRandomItem<T>(items: readonly T[], seed: number): [T, number] {
  const [roll, updatedSeed] = randomFloat(seed)
  const index = Math.min(items.length - 1, Math.floor(roll * items.length))
  return [items[index], updatedSeed]
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

function scoreWord(length: number, combo: number): number {
  return length * length * 10 * combo
}

function scoreFoundWord(board: Board, word: FoundWord, combo: number): number {
  const bonus = word.positions.reduce((total, position) => {
    const tile = board[position.row][position.col]
    if (!tile) {
      return total
    }

    return total + (getTileDefinition(tile.kind).scoreBonus ?? 0)
  }, 0)

  return scoreWord(word.word.length, combo) + bonus * combo
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((tile) => (tile ? { ...tile } : null)))
}

export function makeBoardFromRows(
  rows: string[],
  specialTiles: Array<{ position: Position; kind: TileKind }> = [],
): Board {
  const board = rows.map((row) =>
    row.split('').map((letter) => (letter === '.' ? null : makeTile(letter))),
  )

  specialTiles.forEach(({ position, kind }) => {
    const tile = board[position.row]?.[position.col]
    if (!tile) {
      return
    }

    board[position.row][position.col] = makeTile(tile.letter, kind)
  })

  return board
}

export function boardToRows(board: Board): string[] {
  return board.map((row) => row.map((tile) => tile?.letter ?? '.').join(''))
}

export function positionsToWord(board: Board, positions: Position[]): string {
  return positions.map((position) => board[position.row][position.col]?.letter ?? '').join('')
}

export function classifyWordProgress(word: string): 'idle' | 'building' | 'word' | 'dead' {
  if (word.length === 0) {
    return 'idle'
  }

  if (word.length >= MIN_WORD_LENGTH && DICTIONARY_SET.has(word)) {
    return 'word'
  }

  return PREFIX_SET.has(word) ? 'building' : 'dead'
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

function collectLineWords(letters: string[], positions: Position[]): FoundWord[] {
  const found: FoundWord[] = []

  for (let start = 0; start <= letters.length - MIN_WORD_LENGTH; start += 1) {
    for (let end = start + MIN_WORD_LENGTH; end <= letters.length; end += 1) {
      const word = letters.slice(start, end).join('')
      if (DICTIONARY_SET.has(word)) {
        found.push({
          word,
          positions: positions.slice(start, end).map(clonePosition),
        })
      }
    }
  }

  found.sort((left, right) => right.word.length - left.word.length)

  const kept: FoundWord[] = []
  found.forEach((candidate) => {
    const covered = kept.some((existing) => {
      const existingSet = new Set(existing.positions.map(hashPosition))
      return candidate.positions.every((position) => existingSet.has(hashPosition(position)))
    })
    if (!covered) {
      kept.push(candidate)
    }
  })

  return kept
}

export function findStraightWords(board: Board): FoundWord[] {
  const found: FoundWord[] = []

  for (let row = 0; row < board.length; row += 1) {
    let start = 0
    while (start < board[row].length) {
      while (start < board[row].length && board[row][start] === null) {
        start += 1
      }
      let end = start
      while (end < board[row].length && board[row][end] !== null) {
        end += 1
      }

      if (end - start >= MIN_WORD_LENGTH) {
        const letters = board[row].slice(start, end).map((tile) => tile!.letter)
        const positions = letters.map((_, index) => ({ row, col: start + index }))
        found.push(...collectLineWords(letters, positions))
      }
      start = end + 1
    }
  }

  for (let col = 0; col < board[0].length; col += 1) {
    let start = 0
    while (start < board.length) {
      while (start < board.length && board[start][col] === null) {
        start += 1
      }
      let end = start
      while (end < board.length && board[end][col] !== null) {
        end += 1
      }

      if (end - start >= MIN_WORD_LENGTH) {
        const letters = board.slice(start, end).map((rowTiles) => rowTiles[col]!.letter)
        const positions = letters.map((_, index) => ({ row: start + index, col }))
        found.push(...collectLineWords(letters, positions))
      }
      start = end + 1
    }
  }

  return found
}

function resolveWordHit(
  board: Board,
  words: FoundWord[],
): { board: Board; cleared: Position[]; retained: Position[]; matched: Position[] } {
  const nextBoard = cloneBoard(board)
  const matched = collectUniquePositions(words)
  const cleared: Position[] = []
  const retained: Position[] = []

  matched.forEach((position) => {
    const tile = nextBoard[position.row][position.col]
    if (!tile) {
      return
    }

    const resolution = getTileDefinition(tile.kind).onWordHit?.(tile) ?? {
      tile: null,
      removed: true,
    }

    nextBoard[position.row][position.col] = resolution.tile
    if (resolution.removed) {
      cleared.push(clonePosition(position))
    } else {
      retained.push(clonePosition(position))
    }
  })

  return { board: nextBoard, cleared, retained, matched }
}

function filterWordsTouchingPositions(
  words: FoundWord[],
  positions: Position[],
): FoundWord[] {
  if (positions.length === 0) {
    return []
  }

  const touched = new Set(positions.map(hashPosition))
  return words.filter((word) =>
    word.positions.some((position) => touched.has(hashPosition(position))),
  )
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

       if (getTileDefinition(tile.kind).blocksGravity) {
        nextBoard[row][col] = tile
        targetRow = row - 1
        continue
      }

      while (targetRow >= 0 && nextBoard[targetRow][col] !== null) {
        targetRow -= 1
      }
      if (targetRow < 0) {
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

function countLettersMatching(
  letters: string[],
  predicate: (letter: string) => boolean,
): number {
  return letters.reduce((count, letter) => count + (predicate(letter) ? 1 : 0), 0)
}

function scoreFragment(fragment: string): number {
  if (fragment.length <= 1) {
    return 0
  }

  let score = 0
  if (PREFIX_SET.has(fragment)) {
    score += fragment.length >= MIN_WORD_LENGTH ? 7 : 4
  }
  if (DICTIONARY_SET.has(fragment)) {
    score += 8
  }

  const letters = fragment.split('')
  const vowelCount = countLettersMatching(letters, (letter) => VOWELS.has(letter))
  if (vowelCount === 0 && fragment.length >= 3) {
    score -= 7
  } else if (vowelCount === 1 && fragment.length >= 3) {
    score += 2
  } else if (vowelCount >= 2) {
    score += 1
  }

  const harshCount = countLettersMatching(letters, (letter) => HARSH_CONSONANTS.has(letter))
  if (harshCount >= 2) {
    score -= harshCount * 2
  }

  if (fragment.includes('Q') && !fragment.includes('QU')) {
    score -= 12
  }

  return score
}

function scoreCandidateLetter(board: Board, row: number, col: number, letter: string): number {
  const left = col > 0 ? board[row][col - 1]?.letter ?? '' : ''
  const left2 = col > 1 ? board[row][col - 2]?.letter ?? '' : ''
  const right = col + 1 < board[row].length ? board[row][col + 1]?.letter ?? '' : ''
  const up = row > 0 ? board[row - 1][col]?.letter ?? '' : ''
  const up2 = row > 1 ? board[row - 2][col]?.letter ?? '' : ''
  const down = row + 1 < board.length ? board[row + 1][col]?.letter ?? '' : ''

  const horizontal = `${left2}${left}${letter}${right}`.replaceAll('.', '')
  const vertical = `${up2}${up}${letter}${down}`.replaceAll('.', '')
  const immediatePairs = [`${left}${letter}`, `${up}${letter}`, `${letter}${right}`, `${letter}${down}`]
  const localNeighbors = [left, right, up, down].filter(Boolean)

  let score = 0
  score += scoreFragment(horizontal)
  score += scoreFragment(vertical)

  immediatePairs.forEach((pair) => {
    if (pair.length === 2 && PREFIX_SET.has(pair)) {
      score += 2
    }
    if (pair === 'QU') {
      score += 8
    }
  })

  if (VOWELS.has(letter)) {
    const neighborVowels = countLettersMatching(localNeighbors, (entry) => VOWELS.has(entry))
    if (neighborVowels === 0) {
      score += 3
    } else if (neighborVowels >= 3) {
      score -= 2
    }
  } else {
    const consonantNeighbors = countLettersMatching(localNeighbors, (entry) => !VOWELS.has(entry))
    if (consonantNeighbors >= 3) {
      score -= 4
    }
  }

  if (letter === 'Q' && !localNeighbors.includes('U')) {
    score -= 10
  }
  if (letter === 'U' && localNeighbors.includes('Q')) {
    score += 6
  }

  return score
}

function chooseRefillLetter(board: Board, row: number, col: number, seed: number): [string, number] {
  let currentSeed = seed
  let bestLetter = 'E'
  let bestScore = Number.NEGATIVE_INFINITY

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const leftTile = col > 0 ? board[row][col - 1] : null
    const upTile = row > 0 ? board[row - 1][col] : null
    let letter: string
    let updatedSeed: number

    const [clusterRoll, clusterSeed] = randomFloat(currentSeed)
    if (leftTile && CLUSTER_FOLLOWS[leftTile.letter] && clusterRoll < 0.34) {
      ;[letter, updatedSeed] = pickRandomItem(CLUSTER_FOLLOWS[leftTile.letter], clusterSeed)
    } else if (upTile && CLUSTER_FOLLOWS[upTile.letter] && clusterRoll < 0.5) {
      ;[letter, updatedSeed] = pickRandomItem(CLUSTER_FOLLOWS[upTile.letter], clusterSeed)
    } else {
      ;[letter, updatedSeed] = pickWeightedLetter(clusterSeed)
    }

    currentSeed = updatedSeed
    const score = scoreCandidateLetter(board, row, col, letter)
    if (score > bestScore) {
      bestScore = score
      bestLetter = letter
    }
  }

  return [bestLetter, currentSeed]
}

function countTileKinds(board: Board): Record<TileKind, number> {
  const counts = {
    normal: 0,
    gold: 0,
    cracked: 0,
    anchor: 0,
  } satisfies Record<TileKind, number>

  board.forEach((row) => {
    row.forEach((tile) => {
      if (tile) {
        counts[tile.kind] += 1
      }
    })
  })

  return counts
}

function pickWeightedTileKind(board: Board, seed: number): [TileKind, number] {
  const counts = countTileKinds(board)
  const candidates = (Object.values(TILE_DEFINITIONS) as Array<(typeof TILE_DEFINITIONS)[TileKind]>)
    .filter((definition) => {
      if (definition.maxOnBoard === undefined) {
        return true
      }

      return counts[definition.kind] < definition.maxOnBoard
    })

  const totalWeight = candidates.reduce((sum, definition) => sum + definition.spawnWeight, 0)
  const [roll, updatedSeed] = randomFloat(seed)
  let threshold = roll * totalWeight

  for (const definition of candidates) {
    threshold -= definition.spawnWeight
    if (threshold <= 0) {
      return [definition.kind, updatedSeed]
    }
  }

  return [candidates[candidates.length - 1]?.kind ?? 'normal', updatedSeed]
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

      const [letter, updatedSeed] = chooseRefillLetter(nextBoard, row, col, currentSeed)
      const [kind, kindSeed] = pickWeightedTileKind(nextBoard, updatedSeed)
      currentSeed = kindSeed
      nextBoard[row][col] = makeTile(letter, kind)
      spawned.push({ row, col })
    }
  }

  return { board: nextBoard, spawned, seed: currentSeed }
}

function countEasyStraightWords(board: Board): number {
  return findStraightWords(board).filter((word) => EASY_WORD_SET.has(word.word)).length
}

function overlayWord(
  board: Board,
  word: string,
  start: Position,
  orientation: 'horizontal' | 'vertical',
): Board {
  const nextBoard = cloneBoard(board)

  word.split('').forEach((letter, index) => {
    const row = orientation === 'horizontal' ? start.row : start.row + index
    const col = orientation === 'horizontal' ? start.col + index : start.col
    const existingTile = nextBoard[row][col]
    nextBoard[row][col] = existingTile ? cloneTileWithLetter(existingTile, letter) : makeTile(letter)
  })

  return nextBoard
}

function injectEasyWords(
  board: Board,
  seed: number,
  targetCount: number,
  allowedPositions?: Position[],
): { board: Board; seed: number } {
  let nextBoard = cloneBoard(board)
  let currentSeed = seed
  let easyCount = countEasyStraightWords(nextBoard)
  let attempts = 0
  const allowed = allowedPositions
    ? new Set(allowedPositions.map((position) => hashPosition(position)))
    : null

  while (easyCount < targetCount && attempts < 24) {
    attempts += 1

    let word: string
    ;[word, currentSeed] = pickRandomItem(EASY_WORDS, currentSeed)
    const maxRow = BOARD_SIZE - (word.length - 1)

    const [orientationRoll, orientationSeed] = randomFloat(currentSeed)
    currentSeed = orientationSeed
    const orientation: 'horizontal' | 'vertical' =
      orientationRoll < 0.72 ? 'horizontal' : 'vertical'

    const rowLimit = orientation === 'horizontal' ? BOARD_SIZE : maxRow
    const colLimit = orientation === 'horizontal' ? BOARD_SIZE - (word.length - 1) : BOARD_SIZE

    const [rowRoll, rowSeed] = randomFloat(currentSeed)
    currentSeed = rowSeed
    const [colRoll, colSeed] = randomFloat(currentSeed)
    currentSeed = colSeed

    const start = {
      row: Math.floor(rowRoll * rowLimit),
      col: Math.floor(colRoll * colLimit),
    }

    const positions = word.split('').map((_, index) => ({
      row: orientation === 'horizontal' ? start.row : start.row + index,
      col: orientation === 'horizontal' ? start.col + index : start.col,
    }))

    if (
      allowed &&
      positions.some((position) => !allowed.has(hashPosition(position)))
    ) {
      continue
    }

    nextBoard = overlayWord(nextBoard, word, start, orientation)
    easyCount = countEasyStraightWords(nextBoard)
  }

  return { board: nextBoard, seed: currentSeed }
}

function resolveGravityCombos(
  board: Board,
  startingCombo: number,
  triggeredPositions: Position[],
): ResolutionResult {
  const steps: TurnStep[] = []
  let nextBoard = cloneBoard(board)
  let combo = startingCombo
  let scoreDelta = 0
  let totalWordsCleared = 0
  let highestCombo = 0
  const clearedWords: string[] = []
  let activePositions = triggeredPositions.map(clonePosition)

  while (true) {
    const words = filterWordsTouchingPositions(findStraightWords(nextBoard), activePositions)
    if (words.length === 0) {
      break
    }

    const matchedPositions = collectUniquePositions(words)

    highestCombo = Math.max(highestCombo, combo)
    clearedWords.push(...words.map((word) => word.word))
    totalWordsCleared += words.length

    const clearScore = words.reduce(
      (sum, word) => sum + scoreFoundWord(nextBoard, word, combo),
      0,
    )
    scoreDelta += clearScore

    const { board: clearedBoard, cleared, retained } = resolveWordHit(nextBoard, words)
    steps.push({
      phase: 'clear',
      board: cloneBoard(nextBoard),
      words,
      matchedPositions,
      clearedPositions: cleared,
      retainedPositions: retained,
      movedPositions: [],
      spawnedPositions: [],
      combo,
      scoreDelta: clearScore,
    })
    steps.push({
      phase: 'pause-clear',
      board: cloneBoard(clearedBoard),
      words: [],
      matchedPositions: [],
      clearedPositions: [],
      retainedPositions: [],
      movedPositions: [],
      spawnedPositions: [],
      combo,
      scoreDelta: 0,
    })

    const { board: gravityBoard, moved } = applyGravity(clearedBoard)
    steps.push({
      phase: 'gravity',
      board: cloneBoard(gravityBoard),
      words: [],
      matchedPositions: [],
      clearedPositions: [],
      retainedPositions: [],
      movedPositions: moved,
      spawnedPositions: [],
      combo,
      scoreDelta: 0,
    })
    steps.push({
      phase: 'pause-refill',
      board: cloneBoard(gravityBoard),
      words: [],
      matchedPositions: [],
      clearedPositions: [],
      retainedPositions: [],
      movedPositions: [],
      spawnedPositions: [],
      combo,
      scoreDelta: 0,
    })
    activePositions = moved
    nextBoard = gravityBoard
    combo += 1
  }

  return {
    board: nextBoard,
    steps,
    scoreDelta,
    wordsCleared: clearedWords,
    totalWordsCleared,
    highestCombo,
    rngSeed: 0,
  }
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

  const { board: clearedBoard, cleared, retained, matched } = resolveWordHit(board, [resolvedWord])
  const { board: gravityBoard, moved } = applyGravity(clearedBoard)
  const scoreDelta = scoreFoundWord(board, resolvedWord, 1)

  const steps: TurnStep[] = [
    {
      phase: 'clear',
      board: cloneBoard(board),
      words: [resolvedWord],
      matchedPositions: matched,
      clearedPositions: cleared,
      retainedPositions: retained,
      movedPositions: [],
      spawnedPositions: [],
      combo: 1,
      scoreDelta,
    },
    {
      phase: 'pause-clear',
      board: cloneBoard(clearedBoard),
      words: [],
      matchedPositions: [],
      clearedPositions: [],
      retainedPositions: [],
      movedPositions: [],
      spawnedPositions: [],
      combo: 1,
      scoreDelta: 0,
    },
    {
      phase: 'gravity',
      board: cloneBoard(gravityBoard),
      words: [],
      matchedPositions: [],
      clearedPositions: [],
      retainedPositions: [],
      movedPositions: moved,
      spawnedPositions: [],
      combo: 1,
      scoreDelta: 0,
    },
    {
      phase: 'pause-refill',
      board: cloneBoard(gravityBoard),
      words: [],
      matchedPositions: [],
      clearedPositions: [],
      retainedPositions: [],
      movedPositions: [],
      spawnedPositions: [],
      combo: 1,
      scoreDelta: 0,
    },
  ]

  const comboResult = resolveGravityCombos(gravityBoard, 2, moved)
  const { board: refilledBoard, spawned, seed } = refillBoard(comboResult.board, rngSeed)
  const injectedRefill = injectEasyWords(refilledBoard, seed, REFILL_EASY_WORDS, spawned)

  steps.push(...comboResult.steps)
  steps.push({
    phase: 'refill',
    board: cloneBoard(injectedRefill.board),
    words: [],
    matchedPositions: [],
    clearedPositions: [],
    retainedPositions: [],
    movedPositions: [],
    spawnedPositions: spawned,
    combo: Math.max(1, comboResult.highestCombo),
    scoreDelta: 0,
  })

  return {
    board: injectedRefill.board,
    steps,
    scoreDelta: scoreDelta + comboResult.scoreDelta,
    wordsCleared: [word, ...comboResult.wordsCleared],
    totalWordsCleared: 1 + comboResult.totalWordsCleared,
    highestCombo: Math.max(1, comboResult.highestCombo),
    rngSeed: injectedRefill.seed,
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

export function hasPlayableWord(board: Board): boolean {
  if (findStraightWords(board).length > 0) {
    return true
  }

  const seen = new Set<string>()

  function dfs(position: Position, currentWord: string, visited: Set<string>): boolean {
    const tile = board[position.row][position.col]
    if (!tile) {
      return false
    }

    const nextWord = currentWord + tile.letter
    if (nextWord.length > 8) {
      return false
    }

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
  const emptyBoard = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null as Tile | null),
  )
  const { board, seed: updatedSeed } = refillBoard(emptyBoard, seed)
  const injected = injectEasyWords(board, updatedSeed, TARGET_EASY_WORDS)

  if (countEasyStraightWords(injected.board) >= 2) {
    return { board: injected.board, seed: injected.seed }
  }

  return {
    board: makeBoardFromRows(FALLBACK_BOARD_ROWS),
    seed: injected.seed,
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

export function shuffleGame(state: GameState): GameState {
  const { board, seed } = createRandomBoard(state.rngSeed)
  const score = Math.max(0, state.score - SHUFFLE_PENALTY)

  return {
    ...state,
    board,
    score,
    turn: state.turn + 1,
    combo: 0,
    turnStatus: 'ready',
    selectedPath: [],
    animationQueue: [],
    lastWords: [],
    lastScoreDelta: -SHUFFLE_PENALTY,
    gameOver: !hasPlayableWord(board),
    rngSeed: seed,
  }
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
