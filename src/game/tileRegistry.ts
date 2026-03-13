import type { Tile, TileKind, TileState } from './types'

export interface TileClearResolution {
  tile: Tile | null
  removed: boolean
}

export interface TileDefinition {
  kind: TileKind
  label: string
  description: string
  spawnWeight: number
  maxOnBoard?: number
  uiClassName: string
  accentLabel?: string
  blocksGravity?: boolean
  scoreBonus?: number
  createState?: () => TileState | undefined
  onWordHit?: (tile: Tile) => TileClearResolution
}

const DEFAULT_CRACKED_DURABILITY = 2

function hitCrackedTile(tile: Tile): TileClearResolution {
  const durability = tile.state?.durability ?? DEFAULT_CRACKED_DURABILITY

  if (durability <= 1) {
    return { tile: null, removed: true }
  }

  return {
    tile: {
      ...tile,
      state: {
        ...tile.state,
        durability: durability - 1,
      },
    },
    removed: false,
  }
}

export const TILE_DEFINITIONS: Record<TileKind, TileDefinition> = {
  normal: {
    kind: 'normal',
    label: 'Normal',
    description: 'Standard letter tile.',
    spawnWeight: 82,
    uiClassName: 'tile__block--kind-normal',
  },
  gold: {
    kind: 'gold',
    label: 'Gold',
    description: 'Adds bonus points when used in a valid word.',
    spawnWeight: 8,
    maxOnBoard: 4,
    uiClassName: 'tile__block--kind-gold',
    accentLabel: '+',
    scoreBonus: 30,
  },
  cracked: {
    kind: 'cracked',
    label: 'Cracked',
    description: 'Needs two valid word hits before it breaks.',
    spawnWeight: 6,
    maxOnBoard: 4,
    uiClassName: 'tile__block--kind-cracked',
    accentLabel: 'II',
    createState: () => ({ durability: DEFAULT_CRACKED_DURABILITY }),
    onWordHit: hitCrackedTile,
  },
  anchor: {
    kind: 'anchor',
    label: 'Anchor',
    description: 'Stays fixed during gravity while other tiles fall around it.',
    spawnWeight: 4,
    maxOnBoard: 2,
    uiClassName: 'tile__block--kind-anchor',
    accentLabel: '#',
    blocksGravity: true,
  },
}

export const STARTER_TILE_KINDS: TileKind[] = ['gold', 'cracked', 'anchor']

export function getTileDefinition(kind: TileKind): TileDefinition {
  return TILE_DEFINITIONS[kind]
}

