import type { TurnPhase } from './types'

export const BOARD_SIZE = 5
export const CLEAR_BOARD_REFILL_COUNT = 14
export const CLEAR_BOARD_SHUFFLE_CHARGES = 2
export const CLEAR_BOARD_PERFECT_CLEAR_BONUS = 250
export const CLEAR_BOARD_RESERVE_BONUS = 20
export const SHUFFLE_PENALTY = 75
export const TARGET_EASY_WORDS = 3
export const REFILL_EASY_WORDS = 1
export const INVALID_FLASH_MS = 360
export const CONNECTOR_OFFSET = 0.32
export const MATCH_FEEDBACK_STEP_MULTIPLIER = 3
export const TILE_CLEAR_ANIMATION_MS = 1200
export const CLEAR_PRE_HOLD_MS = 150
export const CLEAR_WAVE_STAGGER_MS = 90
export const CLEAR_WAVE_HOLD_MS = 180
export const FLOAT_WORD_DURATION_MS = 1800
export const FLOAT_SCORE_DURATION_MS = 2100
export const FLOAT_SCORE_DELAY_MS = 320
export const SCORE_PULSE_DURATION_MS = 900
export const FALL_BASE_DURATION_MS = 220
export const FALL_DURATION_PER_ROW_MS = 36
export const FALL_DELAY_PER_ROW_MS = 0
export const FALL_COLUMN_SWEEP_MS = 0
export const FALL_LAND_BOUNCE_PX = 0
export const SPAWN_BASE_DURATION_MS = 260
export const SPAWN_DURATION_PER_ROW_MS = 52
export const SPAWN_DELAY_PER_ROW_MS = 0
export const SPAWN_COLUMN_SWEEP_MS = 0

export const LETTER_WEIGHTS: Array<[string, number]> = [
  ['A', 10],
  ['B', 2],
  ['C', 3],
  ['D', 4],
  ['E', 14],
  ['F', 2],
  ['G', 3],
  ['H', 2],
  ['I', 8],
  ['J', 1],
  ['K', 1],
  ['L', 4],
  ['M', 3],
  ['N', 7],
  ['O', 8],
  ['P', 2],
  ['Q', 1],
  ['R', 6],
  ['S', 6],
  ['T', 10],
  ['U', 3],
  ['V', 1],
  ['W', 2],
  ['X', 1],
  ['Y', 2],
  ['Z', 1],
]

export const EASY_WORDS = [
  'CAT',
  'DOG',
  'SUN',
  'STAR',
  'TREE',
  'RING',
  'BOOK',
  'FIRE',
  'WATER',
  'STONE',
  'PLAY',
  'GAME',
  'HOME',
  'MAKE',
  'TIME',
  'ROAD',
  'WIND',
  'LINE',
  'LIGHT',
  'HAND',
  'WORD',
  'TILE',
  'NOTE',
  'TEAM',
  'TAKE',
  'TURN',
  'RATE',
  'SAND',
  'SHIP',
  'FISH',
  'BIRD',
  'SEAT',
  'READ',
  'DIE',
  'TIE',
  'PIE',
  'CODE',
  'DATA',
  'MINT',
  'GLOW',
] as const

export const CLUSTER_FOLLOWS: Record<string, string[]> = {
  A: ['N', 'R', 'T', 'L', 'S'],
  C: ['H', 'L', 'R', 'A', 'O'],
  E: ['R', 'N', 'S', 'D', 'A'],
  H: ['E', 'I', 'A', 'O'],
  I: ['N', 'T', 'S', 'C'],
  O: ['N', 'R', 'U', 'O'],
  R: ['E', 'A', 'I', 'O'],
  S: ['T', 'H', 'E', 'A'],
  T: ['H', 'R', 'E', 'O', 'A'],
  W: ['A', 'E', 'I', 'O'],
}

export const STEP_DURATIONS: Record<TurnPhase, number> = {
  clear: 420,
  'pause-clear': 180,
  gravity: 440,
  'pause-refill': 160,
  refill: 240,
}

export const FALLBACK_BOARD_ROWS = [
  'CLOUD',
  'RATES',
  'STONE',
  'PLAIN',
  'GUIDE',
]
