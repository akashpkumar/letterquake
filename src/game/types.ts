export interface Position {
  row: number
  col: number
}

export type GameMode = 'clear-board' | 'endless'
export type TileKind = 'normal' | 'gold' | 'cracked' | 'anchor'

export interface TileState {
  durability?: number
}

export interface Tile {
  id: string
  letter: string
  kind: TileKind
  state?: TileState
}

export type Board = Array<Array<Tile | null>>
export interface RefillEntry {
  letter: string
  kind: TileKind
}

export type TurnPhase = 'highlight' | 'clear' | 'pause-clear' | 'gravity' | 'pause-refill' | 'refill'
export type TurnStatus = 'ready' | 'resolving' | 'game-over'

export interface FoundWord {
  word: string
  positions: Position[]
}

export interface BoardEvaluation {
  playableWords: number
  straightWords: number
  remainingTiles: number
  danger: 'safe' | 'tense' | 'critical'
}

export interface TurnStep {
  phase: TurnPhase
  board: Board
  words: FoundWord[]
  matchedPositions: Position[]
  clearedPositions: Position[]
  retainedPositions: Position[]
  movedPositions: Position[]
  spawnedPositions: Position[]
  combo: number
  scoreDelta: number
}

export interface ResolutionResult {
  board: Board
  steps: TurnStep[]
  scoreDelta: number
  wordsCleared: string[]
  totalWordsCleared: number
  highestCombo: number
  rngSeed: number
  refillQueue: RefillEntry[]
}

export interface GameState {
  mode: GameMode
  board: Board
  refillQueue: RefillEntry[]
  shuffleCharges: number
  score: number
  turn: number
  totalWordsCleared: number
  highestCombo: number
  combo: number
  turnStatus: TurnStatus
  selectedPath: Position[]
  animationQueue: TurnStep[]
  lastWords: string[]
  lastScoreDelta: number
  gameOver: boolean
  won: boolean
  rngSeed: number
}

export interface TurnResult {
  valid: boolean
  reason?: 'too-short' | 'duplicate' | 'not-adjacent' | 'not-word' | 'game-over'
  nextState: GameState
  steps: TurnStep[]
}

export interface CreateGameOptions {
  seed?: number
  board?: Board
  mode?: GameMode
  refillQueue?: RefillEntry[]
  shuffleCharges?: number
}
