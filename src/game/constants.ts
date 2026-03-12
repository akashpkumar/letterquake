import type { TurnPhase } from './types'

export const BOARD_SIZE = 6

export const LETTER_WEIGHTS: Array<[string, number]> = [
  ['A', 8],
  ['B', 2],
  ['C', 3],
  ['D', 4],
  ['E', 12],
  ['F', 2],
  ['G', 3],
  ['H', 2],
  ['I', 7],
  ['J', 1],
  ['K', 1],
  ['L', 4],
  ['M', 3],
  ['N', 7],
  ['O', 7],
  ['P', 2],
  ['Q', 1],
  ['R', 6],
  ['S', 6],
  ['T', 9],
  ['U', 3],
  ['V', 1],
  ['W', 2],
  ['X', 1],
  ['Y', 2],
  ['Z', 1],
]

export const STEP_DURATIONS: Record<TurnPhase, number> = {
  clear: 420,
  'pause-clear': 180,
  gravity: 280,
  'pause-refill': 160,
  refill: 240,
}

export const FALLBACK_BOARD_ROWS = [
  'CAXQZX',
  'RLMNVB',
  'SPTUWE',
  'ODGHIK',
  'YJBCDF',
  'EGHIRT',
]
