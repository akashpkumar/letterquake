import type { Position, TileKind, TurnPhase } from '../game/types'

export type BoardPathVariant = 'active' | 'invalid' | 'event'
export type BoardLabelVariant = 'word' | 'score' | 'auto-word' | 'auto-score' | 'combo' | 'system'
export type BoardMotionKind = 'fall' | 'spawn'

export interface BoardRenderMotion {
  kind: BoardMotionKind
  fromRow: number
  fromCol: number
  delayMs: number
  durationMs: number
}

export interface BoardRenderTile {
  id: string
  row: number
  col: number
  letter: string
  kind: TileKind
  durability?: number
  selected: boolean
  invalid: boolean
  matched: boolean
  cleared: boolean
  retained: boolean
  spawned: boolean
  selectedOrder?: number
  clearDelayMs?: number
  motion?: BoardRenderMotion
}

export interface BoardRenderSegment {
  key: string
  from: Position
  to: Position
  variant: BoardPathVariant
  delayMs: number
}

export interface BoardRenderLabel {
  key: string
  x: number
  y: number
  text: string
  variant: BoardLabelVariant
  delayMs: number
  driftX: number
}

export interface BoardRenderModel {
  rows: number
  cols: number
  phase: TurnPhase | 'idle'
  clearCombo: number
  inputLocked: boolean
  clearImpactActive: boolean
  impactPosition: Position | null
  settled: boolean
  tiles: BoardRenderTile[]
  segments: BoardRenderSegment[]
  labels: BoardRenderLabel[]
}
