import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
} from 'pixi.js'
import { TILE_CLEAR_ANIMATION_MS } from '../game/constants'
import type {
  BoardLabelVariant,
  BoardRenderLabel,
  BoardRenderModel,
  BoardRenderTile,
} from './types'
import { getBoardMetrics, getCellCenter, getCellPosition, type BoardMetrics } from './layout'

interface TileNode {
  id: string
  container: Container
  plate: Graphics
  identity: Graphics
  glyph: Text
  glyphBaseY: number
  row: number
  col: number
  clearToken: string | null
  durability: number | null
  selected: boolean
  anchorPulseToken: string | null
  highlightPulseToken: string | null
}

interface LabelNode {
  key: string
  container: Container
  background: Graphics
  text: Text
}

interface ParticleNode {
  id: string
  graphic: Graphics
}

interface Animation {
  id: string
  elapsedMs: number
  durationMs: number
  delayMs: number
  update: (progress: number) => void
  complete?: () => void
}

export interface BoardScene {
  resize: (width: number, height: number) => void
  sync: (model: BoardRenderModel) => void
  destroy: () => void
}

const BOARD_BG = 0x121213
const ACTIVE_PATH = 0xf2f2f2
const INVALID_PATH = 0xe05c6d
const EVENT_PATH = 0x7ad596
const ACTIVE_PATH_OUTLINE = 0x0b0b0c
const DISPLAY_FONT = "'Trebuchet MS', 'Arial Narrow', sans-serif"
const FLOAT_WORD_STYLE = new TextStyle({
  fontFamily: DISPLAY_FONT,
  fontSize: 26,
  fontWeight: '900',
  letterSpacing: 2,
  fill: 0xf6f7f8,
  stroke: { color: 0x09090a, width: 6, join: 'round' },
})
const FLOAT_SCORE_STYLE = new TextStyle({
  fontFamily: DISPLAY_FONT,
  fontSize: 28,
  fontWeight: '900',
  letterSpacing: 1,
  fill: 0xffe27c,
  stroke: { color: 0x2a1d06, width: 6, join: 'round' },
})
const FLOAT_AUTO_WORD_STYLE = new TextStyle({
  fontFamily: DISPLAY_FONT,
  fontSize: 26,
  fontWeight: '900',
  letterSpacing: 2,
  fill: 0xdcffec,
  stroke: { color: 0x0c1f14, width: 6, join: 'round' },
})
const FLOAT_AUTO_SCORE_STYLE = new TextStyle({
  fontFamily: DISPLAY_FONT,
  fontSize: 28,
  fontWeight: '900',
  letterSpacing: 1,
  fill: 0xedfff5,
  stroke: { color: 0x10301d, width: 6, join: 'round' },
})
const FLOAT_COMBO_STYLE = new TextStyle({
  fontFamily: DISPLAY_FONT,
  fontSize: 22,
  fontWeight: '900',
  letterSpacing: 1.5,
  fill: 0xf4ffb8,
  stroke: { color: 0x23320f, width: 5, join: 'round' },
})
const FLOAT_SYSTEM_STYLE = new TextStyle({
  fontFamily: DISPLAY_FONT,
  fontSize: 21,
  fontWeight: '800',
  letterSpacing: 0.5,
  fill: 0xf4f4f5,
  stroke: { color: 0x111214, width: 5, join: 'round' },
})

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function easeOutQuart(progress: number) {
  return 1 - (1 - progress) ** 4
}

function easeInCubic(progress: number) {
  return progress ** 3
}

function easeOutBack(progress: number) {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (progress - 1) ** 3 + c1 * (progress - 1) ** 2
}

function easeInOutCubic(progress: number) {
  return progress < 0.5
    ? 4 * progress ** 3
    : 1 - ((-2 * progress + 2) ** 3) / 2
}

function easeOutCubic(progress: number) {
  return 1 - (1 - progress) ** 3
}

function getRestScale(selected: boolean) {
  return selected ? { x: 1.02, y: 0.98 } : { x: 1, y: 1 }
}

function setTileScale(node: TileNode, scaleX: number, scaleY: number) {
  node.container.scale.set(scaleX, scaleY)
}

function getGlyphInsetDistance(unitX: number, unitY: number, metrics: BoardMetrics) {
  const halfWidth = metrics.cellWidth * 0.16
  const halfHeight = metrics.cellHeight * 0.19
  const padding = metrics.cellWidth * 0.018
  const distanceX = Math.abs(unitX) > 0.0001 ? halfWidth / Math.abs(unitX) : Number.POSITIVE_INFINITY
  const distanceY = Math.abs(unitY) > 0.0001 ? halfHeight / Math.abs(unitY) : Number.POSITIVE_INFINITY

  return Math.min(distanceX, distanceY) + padding
}

function getLabelStyle(variant: BoardLabelVariant) {
  switch (variant) {
    case 'score':
      return FLOAT_SCORE_STYLE
    case 'combo':
      return FLOAT_COMBO_STYLE
    case 'system':
      return FLOAT_SYSTEM_STYLE
    case 'auto-word':
      return FLOAT_AUTO_WORD_STYLE
    case 'auto-score':
      return FLOAT_AUTO_SCORE_STYLE
    default:
      return FLOAT_WORD_STYLE
  }
}

function getLabelTheme(variant: BoardLabelVariant) {
  switch (variant) {
    case 'score':
      return { fill: 0x4b360c, stroke: 0xa97e1f, alpha: 0.94 }
    case 'combo':
      return { fill: 0x243515, stroke: 0xa8d24e, alpha: 0.97 }
    case 'system':
      return { fill: 0x1a1b1f, stroke: 0x3d4048, alpha: 0.96 }
    case 'auto-word':
      return { fill: 0x143c2b, stroke: 0x53af7b, alpha: 0.95 }
    case 'auto-score':
      return { fill: 0x1a4f31, stroke: 0x62c08a, alpha: 0.95 }
    default:
      return { fill: 0x202023, stroke: 0x434349, alpha: 0.95 }
  }
}

function getComboStrength(combo: number) {
  if (combo <= 1) {
    return 0
  }
  return Math.min(1, (combo - 1) / 3)
}

function getParticlePalette(kind: BoardRenderTile['kind']) {
  switch (kind) {
    case 'gold':
      return {
        primary: 0xffc94d,
        secondary: 0xffe698,
        smoke: 0x7b5b11,
      }
    case 'cracked':
      return {
        primary: 0xc6ccd1,
        secondary: 0xf0f3f5,
        smoke: 0x3c4248,
      }
    case 'anchor':
      return {
        primary: 0x9dc6dd,
        secondary: 0xdff4ff,
        smoke: 0x22303a,
      }
    default:
      return {
        primary: 0x85e1a7,
        secondary: 0xe7fff0,
        smoke: 0x183126,
      }
  }
}

function getTileFragmentPalette(kind: BoardRenderTile['kind']) {
  switch (kind) {
    case 'gold':
      return { face: 0x6f5a1f, edge: 0xe8c46a }
    case 'cracked':
      return { face: 0x232629, edge: 0x939aa0 }
    case 'anchor':
      return { face: 0x1a242b, edge: 0x7f98aa }
    default:
      return { face: 0x1a1b1d, edge: 0x5b5c60 }
  }
}

function getTileShatterPalette(kind: BoardRenderTile['kind']) {
  switch (kind) {
    case 'gold':
      return { fill: 0x3c2d10, stroke: 0xf0cc72, highlight: 0xffefbf }
    case 'cracked':
      return { fill: 0x181a1c, stroke: 0x90979c, highlight: 0xdde2e6 }
    case 'anchor':
      return { fill: 0x11191e, stroke: 0x9fd0e8, highlight: 0xeaf9ff }
    default:
      return { fill: 0x141517, stroke: 0x72d69a, highlight: 0xf1fff7 }
  }
}

function drawPolygonPiece(
  graphic: Graphics,
  points: number[],
  scaleX: number,
  scaleY: number,
  palette: ReturnType<typeof getTileShatterPalette>,
  alpha: number,
) {
  const scaled = points.map((value, index) => value * (index % 2 === 0 ? scaleX : scaleY))
  graphic.stroke({ color: palette.stroke, width: 2, alpha, join: 'round' })
  graphic.poly(scaled)
  graphic.closePath()
  graphic.stroke()
  graphic.fill({ color: palette.fill, alpha: alpha * 0.98 })
  graphic.poly(scaled)
  graphic.closePath()
  graphic.fill()
  graphic.stroke({ color: palette.highlight, width: 1, alpha: alpha * 0.18, join: 'round' })
  graphic.moveTo(scaled[0] * 0.32, scaled[1] * 0.32)
  graphic.lineTo(scaled[2] * 0.24, scaled[3] * 0.24)
  graphic.lineTo(scaled[4] * 0.18, scaled[5] * 0.18)
  graphic.stroke()
}

function drawRoundedRect(
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  graphics.roundRect(x, y, width, height, radius)
}

function drawStandardTile(
  graphics: Graphics,
  tile: BoardRenderTile,
  metrics: BoardMetrics,
  phase: BoardRenderModel['phase'],
) {
  const radius = metrics.radius
  const width = metrics.cellWidth
  const height = metrics.cellHeight
  let fill = 0x121213
  let border = 0x3a3a3c
  let borderAlpha = 1
  let outlineColor = 0
  let outlineAlpha = 0
  let letterTint = 0xf4f4f5

  if (tile.selected) {
    fill = 0x183126
    border = tile.kind === 'gold' ? 0xd6b356 : tile.kind === 'anchor' ? 0x8eb5c9 : tile.kind === 'cracked' ? 0x95b2a3 : 0x72d69a
    outlineColor = tile.kind === 'gold' ? 0xd6b356 : 0x72d69a
    outlineAlpha = 0.16
    letterTint = tile.kind === 'gold' ? 0xfff5cf : tile.kind === 'anchor' ? 0xeefcff : 0xf3fff8
  } else if (tile.invalid) {
    fill = 0x2a1114
    border = 0xc44b5a
    letterTint = 0xffb7bf
  } else if (tile.matched && phase === 'highlight') {
    fill = tile.kind === 'gold' ? 0x433412 : tile.kind === 'anchor' ? 0x18303b : 0x1c3d29
    border = tile.kind === 'gold' ? 0xffdf83 : tile.kind === 'anchor' ? 0xc0ecff : 0xb9ffd0
    outlineColor = tile.kind === 'gold' ? 0xffdf83 : tile.kind === 'anchor' ? 0xc0ecff : 0xaaf2c0
    outlineAlpha = 0.58
    letterTint = tile.kind === 'gold' ? 0xfff8da : tile.kind === 'anchor' ? 0xf4fdff : 0xffffff
  } else if (tile.cleared) {
    fill = tile.kind === 'anchor' ? 0x0f1b16 : 0x13261a
    border = tile.kind === 'anchor' ? 0x4e6576 : tile.kind === 'gold' ? 0x6ab684 : 0x4fb06e
    letterTint = tile.kind === 'gold' ? 0xffefb0 : 0xd4ffe0
  } else {
    if (tile.kind === 'gold') {
      fill = 0x17140d
      border = 0x8d742b
      letterTint = 0xffe08f
    } else if (tile.kind === 'cracked') {
      fill = 0x151617
      border = 0x6f7479
      letterTint = 0xeef2f4
    } else if (tile.kind === 'anchor') {
      fill = 0x101417
      border = 0x4e6576
      letterTint = 0xd9eefb
    }
  }

  graphics.clear()
  if (outlineAlpha > 0) {
    graphics.stroke({ color: outlineColor, width: 2, alpha: outlineAlpha })
    drawRoundedRect(graphics, -2, -2, width + 4, height + 4, radius + 4)
    graphics.stroke()
  }
  graphics.fill({ color: fill })
  drawRoundedRect(graphics, 0, 0, width, height, radius)
  graphics.fill()
  graphics.stroke({ color: border, width: 2, alpha: borderAlpha })
  drawRoundedRect(graphics, 0, 0, width, height, radius)
  graphics.stroke()
  graphics.tint = 0xffffff
  return letterTint
}

function drawGoldIdentity(graphics: Graphics, metrics: BoardMetrics) {
  const inset = Math.max(7, metrics.cellWidth * 0.09)
  graphics.stroke({ color: 0xffe29b, width: 1.25, alpha: 0.14 })
  drawRoundedRect(
    graphics,
    inset,
    inset,
    metrics.cellWidth - inset * 2,
    metrics.cellHeight - inset * 2,
    Math.max(5, metrics.radius - 6),
  )
  graphics.stroke()
}

function drawCrackBranch(
  graphics: Graphics,
  startX: number,
  startY: number,
  segments: Array<[number, number, number, number]>,
  color: number,
  alpha: number,
  width: number,
) {
  graphics.stroke({ color, width, alpha, cap: 'round', join: 'round' })
  graphics.moveTo(startX, startY)
  segments.forEach(([cp1x, cp1y, endX, endY], index) => {
    if (index === 0) {
      graphics.moveTo(startX, startY)
    }
    graphics.bezierCurveTo(cp1x, cp1y, cp1x, cp1y, endX, endY)
  })
  graphics.stroke()
}

function drawCrackedIdentity(graphics: Graphics, metrics: BoardMetrics, durability: number) {
  const heavyDamage = durability > 1

  drawCrackBranch(
    graphics,
    metrics.cellWidth * 0.94,
    metrics.cellHeight * 0.08,
    heavyDamage
      ? [
          [metrics.cellWidth * 0.87, metrics.cellHeight * 0.16, metrics.cellWidth * 0.8, metrics.cellHeight * 0.24],
          [metrics.cellWidth * 0.72, metrics.cellHeight * 0.31, metrics.cellWidth * 0.65, metrics.cellHeight * 0.38],
          [metrics.cellWidth * 0.59, metrics.cellHeight * 0.44, metrics.cellWidth * 0.53, metrics.cellHeight * 0.5],
        ]
      : [
          [metrics.cellWidth * 0.88, metrics.cellHeight * 0.15, metrics.cellWidth * 0.83, metrics.cellHeight * 0.21],
          [metrics.cellWidth * 0.79, metrics.cellHeight * 0.26, metrics.cellWidth * 0.75, metrics.cellHeight * 0.3],
        ],
    0xa1a7ac,
    0.92,
    heavyDamage ? 2.1 : 1.65,
  )

  drawCrackBranch(
    graphics,
    heavyDamage ? metrics.cellWidth * 0.8 : metrics.cellWidth * 0.82,
    heavyDamage ? metrics.cellHeight * 0.24 : metrics.cellHeight * 0.21,
    heavyDamage
      ? [
          [metrics.cellWidth * 0.74, metrics.cellHeight * 0.2, metrics.cellWidth * 0.67, metrics.cellHeight * 0.16],
          [metrics.cellWidth * 0.58, metrics.cellHeight * 0.14, metrics.cellWidth * 0.5, metrics.cellHeight * 0.12],
        ]
      : [[metrics.cellWidth * 0.76, metrics.cellHeight * 0.18, metrics.cellWidth * 0.7, metrics.cellHeight * 0.16]],
    0xdde2e6,
    heavyDamage ? 0.42 : 0.22,
    heavyDamage ? 1.2 : 0.95,
  )

  if (heavyDamage) {
    drawCrackBranch(
      graphics,
      metrics.cellWidth * 0.64,
      metrics.cellHeight * 0.38,
      [
        [metrics.cellWidth * 0.58, metrics.cellHeight * 0.34, metrics.cellWidth * 0.52, metrics.cellHeight * 0.29],
        [metrics.cellWidth * 0.46, metrics.cellHeight * 0.24, metrics.cellWidth * 0.39, metrics.cellHeight * 0.2],
      ],
      0x798086,
      0.54,
      1.15,
    )
    drawCrackBranch(
      graphics,
      metrics.cellWidth * 0.58,
      metrics.cellHeight * 0.44,
      [
        [metrics.cellWidth * 0.52, metrics.cellHeight * 0.48, metrics.cellWidth * 0.46, metrics.cellHeight * 0.53],
        [metrics.cellWidth * 0.41, metrics.cellHeight * 0.57, metrics.cellWidth * 0.36, metrics.cellHeight * 0.62],
      ],
      0xdde2e6,
      0.34,
      1.05,
    )
  }

  drawCrackBranch(
    graphics,
    metrics.cellWidth * 0.08,
    metrics.cellHeight * 0.92,
    heavyDamage
      ? [
          [metrics.cellWidth * 0.16, metrics.cellHeight * 0.84, metrics.cellWidth * 0.24, metrics.cellHeight * 0.75],
          [metrics.cellWidth * 0.3, metrics.cellHeight * 0.67, metrics.cellWidth * 0.38, metrics.cellHeight * 0.6],
        ]
      : [
          [metrics.cellWidth * 0.15, metrics.cellHeight * 0.85, metrics.cellWidth * 0.21, metrics.cellHeight * 0.79],
          [metrics.cellWidth * 0.25, metrics.cellHeight * 0.73, metrics.cellWidth * 0.29, metrics.cellHeight * 0.69],
        ],
    0x90979c,
    heavyDamage ? 0.58 : 0.34,
    heavyDamage ? 1.45 : 1.05,
  )

  if (heavyDamage) {
    drawCrackBranch(
      graphics,
      metrics.cellWidth * 0.25,
      metrics.cellHeight * 0.74,
      [
        [metrics.cellWidth * 0.31, metrics.cellHeight * 0.7, metrics.cellWidth * 0.38, metrics.cellHeight * 0.67],
        [metrics.cellWidth * 0.45, metrics.cellHeight * 0.65, metrics.cellWidth * 0.53, metrics.cellHeight * 0.63],
      ],
      0xdde2e6,
      0.3,
      1.05,
    )
  }

  drawCrackBranch(
    graphics,
    metrics.cellWidth * 0.08,
    metrics.cellHeight * 0.08,
    heavyDamage
      ? [
          [metrics.cellWidth * 0.16, metrics.cellHeight * 0.15, metrics.cellWidth * 0.24, metrics.cellHeight * 0.23],
          [metrics.cellWidth * 0.3, metrics.cellHeight * 0.3, metrics.cellWidth * 0.36, metrics.cellHeight * 0.37],
        ]
      : [
          [metrics.cellWidth * 0.15, metrics.cellHeight * 0.14, metrics.cellWidth * 0.22, metrics.cellHeight * 0.2],
          [metrics.cellWidth * 0.26, metrics.cellHeight * 0.25, metrics.cellWidth * 0.3, metrics.cellHeight * 0.29],
        ],
    0x90979c,
    heavyDamage ? 0.52 : 0.3,
    heavyDamage ? 1.35 : 1,
  )

  drawCrackBranch(
    graphics,
    metrics.cellWidth * 0.92,
    metrics.cellHeight * 0.92,
    heavyDamage
      ? [
          [metrics.cellWidth * 0.84, metrics.cellHeight * 0.84, metrics.cellWidth * 0.76, metrics.cellHeight * 0.76],
          [metrics.cellWidth * 0.69, metrics.cellHeight * 0.69, metrics.cellWidth * 0.63, metrics.cellHeight * 0.63],
        ]
      : [
          [metrics.cellWidth * 0.85, metrics.cellHeight * 0.85, metrics.cellWidth * 0.79, metrics.cellHeight * 0.79],
          [metrics.cellWidth * 0.74, metrics.cellHeight * 0.74, metrics.cellWidth * 0.7, metrics.cellHeight * 0.7],
        ],
    0x90979c,
    heavyDamage ? 0.52 : 0.3,
    heavyDamage ? 1.35 : 1,
  )

  if (heavyDamage) {
    drawCrackBranch(
      graphics,
      metrics.cellWidth * 0.24,
      metrics.cellHeight * 0.23,
      [
        [metrics.cellWidth * 0.28, metrics.cellHeight * 0.18, metrics.cellWidth * 0.34, metrics.cellHeight * 0.14],
        [metrics.cellWidth * 0.4, metrics.cellHeight * 0.1, metrics.cellWidth * 0.47, metrics.cellHeight * 0.08],
      ],
      0xdde2e6,
      0.26,
      1,
    )
    drawCrackBranch(
      graphics,
      metrics.cellWidth * 0.76,
      metrics.cellHeight * 0.76,
      [
        [metrics.cellWidth * 0.72, metrics.cellHeight * 0.81, metrics.cellWidth * 0.67, metrics.cellHeight * 0.85],
        [metrics.cellWidth * 0.61, metrics.cellHeight * 0.89, metrics.cellWidth * 0.54, metrics.cellHeight * 0.92],
      ],
      0xdde2e6,
      0.26,
      1,
    )
  }
}

function drawAnchorIdentity(graphics: Graphics, metrics: BoardMetrics) {
  const inset = Math.max(5, metrics.cellWidth * 0.06)
  graphics.stroke({ color: 0xa9d3ed, width: 1, alpha: 0.16 })
  drawRoundedRect(
    graphics,
    inset,
    inset,
    metrics.cellWidth - inset * 2,
    metrics.cellHeight - inset * 2,
    Math.max(4, metrics.radius - 6),
  )
  graphics.stroke()

  const bracketInset = Math.max(4, metrics.cellWidth * 0.04)
  const bracketLength = metrics.cellWidth * 0.15
  graphics.stroke({ color: 0x7f98aa, width: 1.5, alpha: 0.68, cap: 'round' })
  graphics.moveTo(bracketInset, bracketInset + bracketLength)
  graphics.lineTo(bracketInset, bracketInset)
  graphics.lineTo(bracketInset + bracketLength, bracketInset)
  graphics.moveTo(metrics.cellWidth - bracketInset - bracketLength, bracketInset)
  graphics.lineTo(metrics.cellWidth - bracketInset, bracketInset)
  graphics.lineTo(metrics.cellWidth - bracketInset, bracketInset + bracketLength)
  graphics.stroke()
}

function drawTileIdentity(graphics: Graphics, tile: BoardRenderTile, metrics: BoardMetrics) {
  graphics.clear()
  if (tile.kind === 'gold') {
    drawGoldIdentity(graphics, metrics)
    return
  }

  if (tile.kind === 'cracked') {
    drawCrackedIdentity(graphics, metrics, tile.durability ?? 2)
    return
  }

  if (tile.kind === 'anchor') {
    drawAnchorIdentity(graphics, metrics)
  }
}

function makeLabelNode(label: BoardRenderLabel) {
  const container = new Container()
  const background = new Graphics()
  const text = new Text({
    text: label.text,
    style: getLabelStyle(label.variant),
  })
  text.anchor.set(0.5)
  const theme = getLabelTheme(label.variant)
  const paddingX = label.variant.includes('score') ? 18 : label.variant === 'combo' ? 16 : label.variant === 'system' ? 18 : 14
  const paddingY = label.variant.includes('score') ? 9 : label.variant === 'combo' ? 8 : label.variant === 'system' ? 9 : 7
  const width = text.width + paddingX * 2
  const height = text.height + paddingY * 2
  background.fill({ color: theme.fill, alpha: theme.alpha })
  background.roundRect(-width / 2, -height / 2, width, height, height / 2)
  background.fill()
  background.stroke({ color: theme.stroke, width: 1.5, alpha: 0.9 })
  background.roundRect(-width / 2, -height / 2, width, height, height / 2)
  background.stroke()
  container.addChild(background)
  container.addChild(text)
  container.eventMode = 'none'
  return { key: label.key, container, background, text }
}

export async function createBoardScene(
  mountNode: HTMLDivElement,
  initialModel: BoardRenderModel,
): Promise<BoardScene> {
  const app = new Application()
  await app.init({
    width: Math.max(1, Math.round(mountNode.getBoundingClientRect().width) || 1),
    height: Math.max(1, Math.round(mountNode.getBoundingClientRect().height) || 1),
    antialias: true,
    autoDensity: true,
    backgroundAlpha: 0,
    preference: 'webgl',
  })

  const canvas = app.canvas
  mountNode.appendChild(canvas)
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.display = 'block'
  app.stage.eventMode = 'none'

  const backgroundLayer = new Graphics()
  const pulseLayer = new Graphics()
  const pathLayer = new Graphics()
  const tileLayer = new Container()
  const particleLayer = new Container()
  const labelLayer = new Container()
  tileLayer.sortableChildren = true

  app.stage.addChild(backgroundLayer)
  app.stage.addChild(pulseLayer)
  app.stage.addChild(tileLayer)
  app.stage.addChild(pathLayer)
  app.stage.addChild(particleLayer)
  app.stage.addChild(labelLayer)

  const tileNodes = new Map<string, TileNode>()
  const labelNodes = new Map<string, LabelNode>()
  const emittedLabelKeys = new Set<string>()
  const particleNodes = new Map<string, ParticleNode>()
  const segmentProgress = new Map<string, number>()
  const animations = new Map<string, Animation>()
  let metrics = getBoardMetrics(app.renderer.width, app.renderer.height, initialModel.rows, initialModel.cols)
  let currentModel = initialModel
  let pathDirty = true

  function runAnimation(animation: Animation) {
    animations.set(animation.id, animation)
  }

  function destroyParticle(id: string) {
    const node = particleNodes.get(id)
    if (!node) {
      return
    }
    particleLayer.removeChild(node.graphic)
    particleNodes.delete(id)
  }

  function emitTileShatterPieces(tile: BoardRenderTile, centerX: number, centerY: number, isEpicenter: boolean) {
    const palette = getTileShatterPalette(tile.kind)
    const pieces = [
      {
        key: 'tl',
        points: [-0.5, -0.5, -0.1, -0.48, -0.03, -0.1, -0.18, 0.02, -0.5, -0.05],
        angle: -2.2,
        distance: isEpicenter ? 0.98 : 0.56,
        lift: isEpicenter ? 0.42 : 0.24,
        spin: -0.32,
      },
      {
        key: 'tr',
        points: [0.08, -0.5, 0.5, -0.5, 0.5, -0.02, 0.16, 0.02, -0.02, -0.1],
        angle: -0.95,
        distance: isEpicenter ? 1.04 : 0.62,
        lift: isEpicenter ? 0.48 : 0.26,
        spin: 0.28,
      },
      {
        key: 'br',
        points: [0.02, 0.08, 0.18, -0.02, 0.5, 0.02, 0.5, 0.5, 0.08, 0.5],
        angle: 0.82,
        distance: isEpicenter ? 0.96 : 0.54,
        lift: isEpicenter ? 0.36 : 0.2,
        spin: 0.25,
      },
      {
        key: 'bl',
        points: [-0.5, 0.02, -0.14, 0.02, -0.02, 0.08, -0.08, 0.5, -0.5, 0.5],
        angle: 2.15,
        distance: isEpicenter ? 0.92 : 0.52,
        lift: isEpicenter ? 0.38 : 0.22,
        spin: -0.27,
      },
      {
        key: 'tm',
        points: [-0.08, -0.5, 0.16, -0.5, 0.08, -0.14, -0.06, -0.08],
        angle: -1.55,
        distance: isEpicenter ? 0.88 : 0.48,
        lift: isEpicenter ? 0.34 : 0.18,
        spin: 0.18,
      },
      {
        key: 'rm',
        points: [0.18, -0.08, 0.5, -0.02, 0.5, 0.24, 0.12, 0.12],
        angle: 0.02,
        distance: isEpicenter ? 0.82 : 0.46,
        lift: isEpicenter ? 0.22 : 0.12,
        spin: 0.16,
      },
      {
        key: 'bm',
        points: [-0.12, 0.12, 0.1, 0.18, 0.04, 0.5, -0.22, 0.5],
        angle: 1.55,
        distance: isEpicenter ? 0.86 : 0.5,
        lift: isEpicenter ? 0.26 : 0.14,
        spin: -0.14,
      },
      {
        key: 'lm',
        points: [-0.5, -0.04, -0.14, -0.12, -0.08, 0.12, -0.5, 0.24],
        angle: 3.06,
        distance: isEpicenter ? 0.8 : 0.44,
        lift: isEpicenter ? 0.2 : 0.1,
        spin: -0.17,
      },
    ]

    pieces.forEach((piece, index) => {
      const id = `shatter:${tile.id}:${currentModel.phase}:${tile.clearDelayMs ?? 0}:${piece.key}`
      destroyParticle(id)

      const graphic = new Graphics()
      const node = { id, graphic }
      particleNodes.set(id, node)
      particleLayer.addChild(graphic)

        runAnimation({
          id,
          elapsedMs: 0,
          delayMs: 0,
          durationMs: (isEpicenter ? 1050 : 780) + index * 36,
        update: (progress) => {
          const eased = easeOutQuart(progress)
          const fade = 1 - eased
          const travel = metrics.cellWidth * piece.distance * eased
          const rise = Math.sin(progress * Math.PI) * metrics.cellHeight * piece.lift
          graphic.clear()
          graphic.position.set(
            centerX + Math.cos(piece.angle) * travel,
            centerY + Math.sin(piece.angle) * travel - rise,
          )
          graphic.rotation = piece.spin * progress * Math.PI * 1.8
          drawPolygonPiece(
            graphic,
            piece.points,
            metrics.cellWidth * 0.98,
            metrics.cellHeight * 0.98,
            palette,
            fade,
          )
        },
        complete: () => {
          destroyParticle(id)
        },
      })
    })
  }

  function emitClearParticles(tile: BoardRenderTile, centerX: number, centerY: number) {
    const palette = getParticlePalette(tile.kind)
    const fragmentPalette = getTileFragmentPalette(tile.kind)
    const isGold = tile.kind === 'gold'
    const isEpicenter =
      currentModel.impactPosition?.row === tile.row &&
      currentModel.impactPosition?.col === tile.col
    const comboStrength = getComboStrength(currentModel.clearCombo)
    const comboBonus = Math.round(comboStrength * (isGold ? 16 : 8))
    const epicenterBonus = isEpicenter ? 18 : 0
    const pieceCount = (isGold ? 28 : tile.kind === 'anchor' ? 12 : 14) + comboBonus + epicenterBonus

    emitTileShatterPieces(tile, centerX, centerY, isEpicenter)

    if (!isEpicenter) {
      return
    }

    {
      const fragments = isEpicenter
        ? [
            { angle: -2.2, width: 0.26, height: 0.24, distance: 1.05, lift: 0.46, spin: -0.34, offsetX: -0.18, offsetY: -0.16 },
            { angle: -1.15, width: 0.24, height: 0.22, distance: 1.14, lift: 0.54, spin: 0.28, offsetX: 0.16, offsetY: -0.2 },
            { angle: 0.48, width: 0.28, height: 0.24, distance: 1.08, lift: 0.42, spin: 0.31, offsetX: 0.2, offsetY: 0.12 },
            { angle: 2.08, width: 0.25, height: 0.23, distance: 1.02, lift: 0.5, spin: -0.27, offsetX: -0.16, offsetY: 0.18 },
          ]
        : [
            { angle: -1.95, width: 0.18, height: 0.17, distance: 0.7, lift: 0.3, spin: -0.25, offsetX: -0.12, offsetY: -0.1 },
            { angle: -0.7, width: 0.16, height: 0.15, distance: 0.76, lift: 0.34, spin: 0.22, offsetX: 0.12, offsetY: -0.1 },
            { angle: 0.8, width: 0.17, height: 0.16, distance: 0.72, lift: 0.28, spin: 0.2, offsetX: 0.1, offsetY: 0.1 },
            { angle: 2.15, width: 0.18, height: 0.17, distance: 0.68, lift: 0.32, spin: -0.23, offsetX: -0.11, offsetY: 0.12 },
          ]
      fragments.forEach((fragment, index) => {
        const id = `fragment:${tile.id}:${currentModel.phase}:${tile.clearDelayMs ?? 0}:${index}`
        destroyParticle(id)

        const graphic = new Graphics()
        const node = { id, graphic }
        particleNodes.set(id, node)
        particleLayer.addChild(graphic)

        const angle = fragment.angle
        const distance = metrics.cellWidth * fragment.distance
        const lift = metrics.cellHeight * fragment.lift
        const spin = fragment.spin
        const width = metrics.cellWidth * fragment.width
        const height = metrics.cellHeight * fragment.height
        const startX = centerX + metrics.cellWidth * fragment.offsetX
        const startY = centerY + metrics.cellHeight * fragment.offsetY

      runAnimation({
        id,
        elapsedMs: 0,
        delayMs: 0,
        durationMs: (isEpicenter ? 1140 : 780) + index * (isEpicenter ? 52 : 36),
          update: (progress) => {
            const eased = easeOutQuart(progress)
            const fade = 1 - eased
            const travel = distance * eased
            const rise = Math.sin(progress * Math.PI) * lift
            graphic.clear()
            graphic.position.set(
              startX + Math.cos(angle) * travel,
              startY + Math.sin(angle) * travel - rise,
            )
            graphic.rotation = spin * progress * Math.PI * 1.9
            graphic.stroke({ color: fragmentPalette.edge, width: isEpicenter ? 2 : 1.5, alpha: fade, join: 'round' })
            graphic.moveTo(-width * 0.58, -height * 0.42)
            graphic.lineTo(width * 0.18, -height * 0.54)
            graphic.lineTo(width * 0.54, -height * 0.12)
            graphic.lineTo(width * 0.38, height * 0.46)
            graphic.lineTo(-width * 0.2, height * 0.58)
            graphic.lineTo(-width * 0.62, height * 0.12)
            graphic.lineTo(-width * 0.58, -height * 0.42)
            graphic.stroke()
            graphic.fill({ color: fragmentPalette.face, alpha: fade * 0.96 })
            graphic.moveTo(-width * 0.58, -height * 0.42)
            graphic.lineTo(width * 0.18, -height * 0.54)
            graphic.lineTo(width * 0.54, -height * 0.12)
            graphic.lineTo(width * 0.38, height * 0.46)
            graphic.lineTo(-width * 0.2, height * 0.58)
            graphic.lineTo(-width * 0.62, height * 0.12)
            graphic.closePath()
            graphic.fill()
            graphic.stroke({ color: 0xffffff, width: 1, alpha: fade * (isEpicenter ? 0.18 : 0.12), join: 'round' })
            graphic.moveTo(-width * 0.28, -height * 0.2)
            graphic.lineTo(width * 0.24, height * 0.08)
            graphic.lineTo(-width * 0.06, height * 0.32)
            graphic.stroke()
          },
          complete: () => {
            destroyParticle(id)
          },
        })
      })
    }

    for (let index = 0; index < pieceCount; index += 1) {
      const id = `particle:${tile.id}:${currentModel.phase}:${tile.clearDelayMs ?? 0}:${index}`
      destroyParticle(id)

      const graphic = new Graphics()
      const node = { id, graphic }
      particleNodes.set(id, node)
      particleLayer.addChild(graphic)

      const angleSpread = isEpicenter ? Math.PI * 1.8 : isGold ? Math.PI * 1.22 : Math.PI * 1.05
      const angle = (-Math.PI / 2) + ((index / Math.max(1, pieceCount - 1)) - 0.5) * angleSpread
      const speed = metrics.cellWidth * ((isGold ? 0.74 : 0.62) + comboStrength * 0.14 + (index % 4) * (isGold ? 0.1 : 0.08) + (isEpicenter ? 0.22 : 0))
      const lift = metrics.cellHeight * ((isGold ? 0.3 : 0.24) + comboStrength * 0.08 + (index % 5) * (isGold ? 0.05 : 0.04) + (isEpicenter ? 0.12 : 0))
      const drift = metrics.cellWidth * (((index % 2 === 0 ? -1 : 1) * ((isGold ? 0.11 : 0.08) + (index % 3) * (isGold ? 0.04 : 0.03) + (isEpicenter ? 0.05 : 0))))
      const spin = (index % 2 === 0 ? -1 : 1) * ((isGold ? 0.18 : 0.12) + (index % 4) * (isGold ? 0.05 : 0.04))
      const shardWidth = metrics.cellWidth * ((isGold ? 0.13 : 0.11) + (index % 3) * (isGold ? 0.024 : 0.02) + (isEpicenter ? 0.03 : 0))
      const shardHeight = metrics.cellHeight * ((isGold ? 0.052 : 0.046) + (index % 2) * (isGold ? 0.018 : 0.015) + (isEpicenter ? 0.012 : 0))
      const streakLength = metrics.cellHeight * ((isGold ? 0.17 : 0.12) + (index % 3) * (isGold ? 0.04 : 0.03) + (isEpicenter ? 0.08 : 0))
      const circleRadius = metrics.cellWidth * ((isGold ? 0.04 : 0.032) + (index % 3) * (isGold ? 0.012 : 0.01) + (isEpicenter ? 0.012 : 0))
      const isDust = index >= pieceCount - (isGold ? 5 : isEpicenter ? 8 : 3)

      runAnimation({
        id,
        elapsedMs: 0,
        delayMs: 0,
        durationMs: (isGold ? 1050 : 840) + comboStrength * 165 + (index % 4) * (isGold ? 135 : 105) + (isEpicenter ? 180 : 0),
        update: (progress) => {
          const eased = easeOutQuart(progress)
          const fade = 1 - eased
          const wave = Math.sin(progress * Math.PI)
          const travel = speed * eased
          const rise = lift * wave
          graphic.clear()
          graphic.position.set(
            centerX + Math.cos(angle) * travel + drift * eased,
            centerY + Math.sin(angle) * travel - rise,
          )
          graphic.rotation = spin * progress * Math.PI * 2.2
          graphic.alpha = 1

          if (isDust) {
            graphic.fill({ color: palette.smoke, alpha: fade * ((isGold ? 0.44 : 0.34) + comboStrength * 0.12 + (isEpicenter ? 0.2 : 0)) })
            graphic.circle(0, 0, circleRadius * (1 + eased * 1.5))
            graphic.fill()
            return
          }

          graphic.stroke({
            color: index % 2 === 0 ? palette.secondary : palette.primary,
            width: Math.max(1, shardHeight * (isGold ? 0.72 : 0.55)),
            alpha: fade * ((isGold ? 0.88 : 0.7) + comboStrength * 0.14 + (isEpicenter ? 0.18 : 0)),
            cap: 'round',
          })
          graphic.moveTo(-streakLength * 0.35, 0)
          graphic.lineTo(streakLength * 0.45, 0)
          graphic.stroke()
          graphic.fill({
            color: index % 2 === 0 ? palette.primary : palette.secondary,
            alpha: fade * ((isGold ? 1.08 : 1) + comboStrength * 0.12 + (isEpicenter ? 0.16 : 0)),
          })
          graphic.roundRect(
            -shardWidth / 2,
            -shardHeight / 2,
            shardWidth,
            shardHeight,
            shardHeight / 2,
          )
          graphic.fill()
        },
        complete: () => {
          destroyParticle(id)
        },
      })
    }
  }

  app.ticker.add(() => {
    const deltaMs = app.ticker.deltaMS
    animations.forEach((animation, key) => {
      animation.elapsedMs += deltaMs
      if (animation.elapsedMs < animation.delayMs) {
        return
      }
      const localElapsed = animation.elapsedMs - animation.delayMs
      const progress = clamp(localElapsed / animation.durationMs, 0, 1)
      animation.update(progress)
      if (progress >= 1) {
        animation.complete?.()
        animations.delete(key)
      }
    })

    if (pathDirty || currentModel.segments.length > 0) {
      drawSegments()
      pathDirty = false
    }
  })

  function resize(width: number, height: number) {
    app.renderer.resize(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)))
    metrics = getBoardMetrics(app.renderer.width, app.renderer.height, currentModel.rows, currentModel.cols)
    drawBoardBackdrop()
  }

  function drawBoardBackdrop() {
    backgroundLayer.clear()
    backgroundLayer.fill({ color: currentModel.phase === 'highlight' ? 0x0c110e : BOARD_BG, alpha: currentModel.phase === 'highlight' ? 0.24 : 0.001 })
    backgroundLayer.rect(0, 0, app.renderer.width, app.renderer.height)
    backgroundLayer.fill()
    for (let row = 0; row < currentModel.rows; row += 1) {
      for (let col = 0; col < currentModel.cols; col += 1) {
        const position = getCellPosition(row, col, metrics)
        backgroundLayer.fill({ color: currentModel.phase === 'highlight' ? 0x070908 : 0x09090a })
        drawRoundedRect(
          backgroundLayer,
          position.x,
          position.y,
          metrics.cellWidth,
          metrics.cellHeight,
          metrics.radius,
        )
        backgroundLayer.fill()
        backgroundLayer.stroke({
          color: currentModel.phase === 'highlight' ? 0x1d2821 : 0x242426,
          width: 1,
          alpha: currentModel.phase === 'highlight' ? 0.72 : 0.9,
        })
        drawRoundedRect(
          backgroundLayer,
          position.x,
          position.y,
          metrics.cellWidth,
          metrics.cellHeight,
          metrics.radius,
        )
        backgroundLayer.stroke()
      }
    }
  }

  function makeTileNode(tile: BoardRenderTile) {
    const container = new Container()
    container.pivot.set(metrics.cellWidth / 2, metrics.cellHeight / 2)
    const plate = new Graphics()
    const identity = new Graphics()
    const glyph = new Text({
      text: tile.letter,
      style: new TextStyle({
        fontFamily: DISPLAY_FONT,
        fontSize: metrics.cellWidth * 0.42,
        fontWeight: '800',
        fill: 0xf4f4f5,
      }),
    })
    glyph.anchor.set(0.5)
    container.addChild(plate)
    container.addChild(identity)
    container.addChild(glyph)
    tileLayer.addChild(container)
    return {
      id: tile.id,
      container,
      plate,
      identity,
      glyph,
      glyphBaseY: metrics.cellHeight / 2 + 1,
      row: tile.row,
      col: tile.col,
      clearToken: null,
      durability: tile.durability ?? null,
      selected: tile.selected,
      anchorPulseToken: null,
      highlightPulseToken: null,
    }
  }

  function updateTileNode(node: TileNode, tile: BoardRenderTile) {
    const letterTint = drawStandardTile(node.plate, tile, metrics, currentModel.phase)
    drawTileIdentity(node.identity, tile, metrics)
    const durabilityChanged =
      tile.kind === 'cracked' && node.durability !== null && node.durability !== (tile.durability ?? null)
    node.glyph.text = tile.letter
    node.glyph.style.fontSize = metrics.cellWidth * 0.42
    node.glyph.tint = letterTint
    node.glyphBaseY = metrics.cellHeight / 2 + 1
    node.glyph.position.set(metrics.cellWidth / 2, node.glyphBaseY)

    const target = getCellPosition(tile.row, tile.col, metrics)
    const targetCenterX = target.x + metrics.cellWidth / 2
    const targetCenterY = target.y + metrics.cellHeight / 2
    node.container.pivot.set(metrics.cellWidth / 2, metrics.cellHeight / 2)
    node.container.zIndex = tile.selected ? 30 : tile.invalid ? 24 : tile.cleared ? 18 : 10
    const motion = tile.motion
    const moved = node.row !== tile.row || node.col !== tile.col
    let motionActive = false
    if (motion && (moved || node.container.x === 0 && node.container.y === 0)) {
      motionActive = true
      const from = getCellPosition(motion.fromRow, motion.fromCol, metrics)
      const fromCenterX = from.x + metrics.cellWidth / 2
      const fromCenterY = from.y + metrics.cellHeight / 2
      const spawnDrift = motion.kind === 'spawn' ? ((tile.col % 2 === 0 ? -1 : 1) * metrics.cellWidth) / 48 : 0
      node.container.position.set(fromCenterX + spawnDrift, fromCenterY)
      node.container.alpha = motion.kind === 'spawn' ? 0 : 1
      const startScale = motion.kind === 'spawn' ? 0.98 : 1
      setTileScale(
        node,
        motion.kind === 'spawn' ? startScale * 0.92 : startScale,
        motion.kind === 'spawn' ? startScale * 1.08 : startScale,
      )
      runAnimation({
        id: `motion:${tile.id}:${tile.row}:${tile.col}:${motion.delayMs}:${motion.durationMs}`,
        elapsedMs: 0,
        delayMs: motion.delayMs,
        durationMs: motion.durationMs,
        update: (progress) => {
          if (motion.kind === 'fall') {
            const fallProgress = progress < 0.8 ? easeInCubic(progress / 0.8) : 1
            const settleProgress = progress < 0.8 ? 0 : (progress - 0.8) / 0.2
            const settle = progress < 0.8 ? 0 : easeOutBack(settleProgress) - 1
            node.container.x = targetCenterX
            node.container.y =
              fromCenterY + (targetCenterY - fromCenterY) * fallProgress - settle * metrics.cellHeight * 0.04
            node.container.alpha = 1
            if (progress > 0.78) {
              const impact = Math.sin(settleProgress * Math.PI) * (1 + Math.sin(settleProgress * Math.PI * 1.8) * 0.18)
              setTileScale(
                node,
                1 + impact * 0.12,
                1 - impact * 0.18,
              )
            } else {
              setTileScale(node, 1, 1)
            }
            return
          }

          const fallProgress = progress < 0.82 ? easeInCubic(progress / 0.82) : 1
          const settleProgress = progress < 0.82 ? 0 : (progress - 0.82) / 0.18
          node.container.x =
            fromCenterX + spawnDrift + (targetCenterX - fromCenterX - spawnDrift) * fallProgress
          node.container.y = fromCenterY + (targetCenterY - fromCenterY) * fallProgress
          node.container.alpha = 0.25 + progress * 0.75
          if (progress > 0.8) {
            const impact =
              Math.sin(settleProgress * Math.PI) *
              (1 + Math.sin(settleProgress * Math.PI * 1.8) * 0.16)
            setTileScale(node, 1 + impact * 0.11, 1 - impact * 0.17)
          } else {
            const stretch = 1.16 - fallProgress * 0.16
            const squeeze = 0.88 + fallProgress * 0.12
            setTileScale(node, squeeze, stretch)
          }
        },
        complete: () => {
          node.container.position.set(targetCenterX, targetCenterY)
          node.container.alpha = 1
          const rest = getRestScale(tile.selected)
          setTileScale(node, rest.x, rest.y)
        },
      })
    } else {
      node.container.position.set(targetCenterX, targetCenterY)
      node.container.alpha = 1
      const rest = getRestScale(tile.selected)
      setTileScale(node, rest.x, rest.y)
    }

    if (tile.selected !== node.selected) {
      runAnimation({
        id: `select:${tile.id}:${tile.selected ? 'in' : 'out'}`,
        elapsedMs: 0,
        delayMs: 0,
        durationMs: tile.selected ? 170 : 130,
        update: (progress) => {
          const eased = tile.selected ? easeOutCubic(progress) : easeInOutCubic(progress)
          const start = tile.selected ? { x: 1, y: 1 } : { x: 1.02, y: 0.98 }
          const end = tile.selected ? { x: 1.02, y: 0.98 } : { x: 1, y: 1 }
          const drift = Math.sin(progress * Math.PI) * (tile.selected ? 0.012 : 0.008)
          setTileScale(
            node,
            start.x + (end.x - start.x) * eased - drift,
            start.y + (end.y - start.y) * eased + drift,
          )
          node.container.y =
            targetCenterY - (tile.selected ? eased * 2.8 : (1 - eased) * 2.2)
        },
        complete: () => {
          const rest = getRestScale(tile.selected)
          setTileScale(node, rest.x, rest.y)
          node.container.y = targetCenterY
        },
      })
    }

    if (durabilityChanged) {
      node.identity.alpha = 0.25
      runAnimation({
        id: `durability:${tile.id}:${tile.durability ?? 0}`,
        elapsedMs: 0,
        delayMs: 0,
        durationMs: 220,
        update: (progress) => {
          const eased = easeOutQuart(progress)
          node.identity.alpha = 0.25 + eased * 0.75
          const pulse = Math.sin(progress * Math.PI) * 0.045
          const rest = getRestScale(tile.selected)
          setTileScale(node, rest.x + pulse, rest.y - pulse)
        },
        complete: () => {
          node.identity.alpha = 1
          const rest = getRestScale(tile.selected)
          setTileScale(node, rest.x, rest.y)
        },
      })
    } else {
      node.identity.alpha = 1
    }

    if (tile.kind === 'gold' && tile.cleared) {
      runAnimation({
        id: `gold:${tile.id}:${tile.clearDelayMs ?? 0}`,
        elapsedMs: 0,
        delayMs: tile.clearDelayMs ?? 0,
        durationMs: TILE_CLEAR_ANIMATION_MS * 0.55,
        update: (progress) => {
          node.identity.alpha = 0.9 + Math.sin(progress * Math.PI) * 0.35
        },
        complete: () => {
          node.identity.alpha = tile.cleared ? 0.8 : 1
        },
      })
    }

    if (tile.kind === 'anchor' && tile.retained) {
      const anchorPulseToken = `${currentModel.phase}:${tile.row}:${tile.col}`
      if (node.anchorPulseToken !== anchorPulseToken) {
        node.anchorPulseToken = anchorPulseToken
        runAnimation({
          id: `anchor:${tile.id}:${anchorPulseToken}`,
          elapsedMs: 0,
          delayMs: 0,
          durationMs: 240,
          update: (progress) => {
            const wave = Math.sin(progress * Math.PI)
            const rest = getRestScale(tile.selected)
            node.container.x = targetCenterX + wave * 1.3
            node.identity.alpha = 0.8 + wave * 0.35
            setTileScale(node, rest.x - wave * 0.02, rest.y + wave * 0.02)
          },
          complete: () => {
            const rest = getRestScale(tile.selected)
            node.container.x = targetCenterX
            node.identity.alpha = 1
            setTileScale(node, rest.x, rest.y)
          },
        })
      }
    } else {
      node.anchorPulseToken = null
    }

    if (tile.matched && currentModel.phase === 'highlight') {
      const highlightPulseToken = `${tile.id}:${currentModel.phase}:${currentModel.clearCombo}`
      if (node.highlightPulseToken !== highlightPulseToken) {
        node.highlightPulseToken = highlightPulseToken
        runAnimation({
          id: `highlight:${tile.id}:${highlightPulseToken}`,
          elapsedMs: 0,
          delayMs: tile.clearDelayMs ?? 0,
          durationMs: 270,
          update: (progress) => {
            const pulse = Math.sin(progress * Math.PI)
            const rest = getRestScale(tile.selected)
            setTileScale(node, rest.x + pulse * 0.04, rest.y + pulse * 0.04)
            node.container.y = targetCenterY
            node.plate.alpha = 0.88 + pulse * 0.22
            node.identity.alpha = 0.96 + pulse * 0.18
            node.glyph.scale.set(1 + pulse * 0.03, 1 + pulse * 0.03)
          },
          complete: () => {
            const rest = getRestScale(tile.selected)
            setTileScale(node, rest.x, rest.y)
            node.container.y = targetCenterY
            node.plate.alpha = 1
            node.identity.alpha = 1
            node.glyph.scale.set(1, 1)
          },
        })
      }
    } else {
      node.highlightPulseToken = null
    }

    if (tile.cleared) {
      const clearToken = `${tile.clearDelayMs ?? 0}:${tile.kind}:${currentModel.phase}`
      if (node.clearToken !== clearToken) {
        node.clearToken = clearToken
        const isEpicenter =
          currentModel.impactPosition?.row === tile.row &&
          currentModel.impactPosition?.col === tile.col
        let burstTriggered = false
        let burstStart = 0
        let previousWave = 0
        runAnimation({
          id: `clear:${tile.id}:${clearToken}`,
          elapsedMs: 0,
          delayMs: tile.clearDelayMs ?? 0,
          durationMs: TILE_CLEAR_ANIMATION_MS,
          update: (progress) => {
            if (isEpicenter) {
              if (!burstTriggered && progress >= 0.04) {
                burstTriggered = true
                emitClearParticles(tile, targetCenterX, targetCenterY)
              }
              const shatterOut = progress < 0.18 ? easeOutQuart(progress / 0.18) : 1
              const vanish = progress < 0.12 ? progress / 0.12 : 1
              const scatterTilt = (progress - 0.5) * 0.22
              setTileScale(
                node,
                1 - shatterOut * 0.34,
                1 - shatterOut * 0.28,
              )
              node.container.alpha = 1 - vanish
              node.identity.alpha = 1 - vanish
              node.glyph.alpha = 1 - vanish
              node.container.y = targetCenterY + shatterOut * metrics.cellHeight * 0.03
              node.glyph.y = node.glyphBaseY - shatterOut * metrics.cellHeight * 0.08
              node.glyph.rotation = scatterTilt
              return
            }

            if (progress < 0.38) {
              const confirm = progress / 0.38
              const crest = Math.exp(-((confirm - 0.48) ** 2) / 0.05)
              const trailing = Math.exp(-((confirm - 0.68) ** 2) / 0.028) * 0.42
              const wave = clamp(crest + trailing, 0, 1.08)
              if (!burstTriggered && confirm > 0.2 && wave < previousWave && previousWave > 0.96) {
                burstTriggered = true
                burstStart = confirm
                emitClearParticles(tile, targetCenterX, targetCenterY)
              }
              previousWave = wave
              setTileScale(node, 1 - wave * 0.09, 1 + wave * 0.16)
              node.container.y = targetCenterY - wave * metrics.cellHeight * 0.22
              node.glyph.y = node.glyphBaseY - wave * metrics.cellHeight * 0.12
              node.glyph.rotation = (confirm - 0.48) * 0.22 * wave
              node.container.alpha = burstTriggered
                ? Math.max(0, 1 - (confirm - burstStart) / 0.16)
                : 1
              node.identity.alpha = node.container.alpha
              node.glyph.alpha = node.container.alpha
              return
            }

            const release = (progress - 0.38) / 0.62
            const eased = easeOutQuart(release)
            node.container.y = targetCenterY
            node.glyph.y = node.glyphBaseY
            const rest = getRestScale(tile.selected)
            setTileScale(node, rest.x, rest.y)
            node.container.alpha = burstTriggered ? 0 : 1 - eased * 0.78
            node.identity.alpha = node.container.alpha
            node.glyph.alpha = node.container.alpha
            node.glyph.rotation = 0
          },
          complete: () => {
            const rest = getRestScale(tile.selected)
            setTileScale(node, rest.x, rest.y)
            node.container.alpha = 0
            node.identity.alpha = 0
            node.glyph.alpha = 0
            node.container.y = targetCenterY
            node.glyph.y = node.glyphBaseY
            node.glyph.rotation = 0
          },
        })
      }
    } else {
      node.clearToken = null
    }

    if (!tile.cleared) {
      if (!motionActive) {
        node.container.alpha = 1
        const rest = getRestScale(tile.selected)
        setTileScale(node, rest.x, rest.y)
        node.container.y = targetCenterY
      }
      node.glyph.y = node.glyphBaseY
      node.glyph.rotation = 0
    }

    node.row = tile.row
    node.col = tile.col
    node.durability = tile.durability ?? null
    node.selected = tile.selected
  }

  function drawSegments() {
    pathLayer.clear()
    currentModel.segments.forEach((segment) => {
      const progress = segmentProgress.get(segment.key) ?? 1
      if (progress <= 0.001) {
        return
      }
      const from = getCellCenter(segment.from.row, segment.from.col, metrics)
      const to = getCellCenter(segment.to.row, segment.to.col, metrics)
      const dx = to.x - from.x
      const dy = to.y - from.y
      const magnitude = Math.hypot(dx, dy) || 1
      const unitX = dx / magnitude
      const unitY = dy / magnitude
      const fromInset = getGlyphInsetDistance(unitX, unitY, metrics)
      const toInset = getGlyphInsetDistance(unitX, unitY, metrics)
      const offsetX = unitX * fromInset
      const offsetY = unitY * fromInset
      const x1 = from.x + offsetX
      const y1 = from.y + offsetY
      const fullX2 = to.x - unitX * toInset
      const fullY2 = to.y - unitY * toInset
      const easedProgress = segment.variant === 'event' ? easeOutQuart(progress) : easeOutCubic(progress)
      const x2 = x1 + (fullX2 - x1) * easedProgress
      const y2 = y1 + (fullY2 - y1) * easedProgress
      const color = segment.variant === 'active' ? ACTIVE_PATH : segment.variant === 'invalid' ? INVALID_PATH : EVENT_PATH
      const eventFade =
        segment.variant === 'event'
          ? progress < 0.58
            ? 1
            : 1 - easeOutQuart((progress - 0.58) / 0.42)
          : 1
      const alpha =
        segment.variant === 'event'
          ? 0.94 * eventFade
          : segment.variant === 'invalid'
            ? 0.96
            : 0.88 + Math.sin(performance.now() / 120) * 0.08
      const outlineWidth = metrics.cellWidth * 0.06
      const lineWidth = metrics.cellWidth * 0.032
      pathLayer.stroke({
        color: ACTIVE_PATH_OUTLINE,
        width: outlineWidth,
        alpha: segment.variant === 'event' ? 0.58 * eventFade : 0.96,
        cap: 'round',
        join: 'round',
      })
      pathLayer.moveTo(x1, y1)
      pathLayer.lineTo(x2, y2)
      pathLayer.stroke()
      pathLayer.stroke({ color, width: lineWidth, alpha, cap: 'round', join: 'round' })
      pathLayer.moveTo(x1, y1)
      pathLayer.lineTo(x2, y2)
      pathLayer.stroke()

      if (easedProgress < 0.72) {
        return
      }

      const angle = Math.atan2(dy, dx)
      const arrowTravel = 0.4 + (easedProgress - 0.72) / 0.28 * 0.12
      const arrowX = x1 + (x2 - x1) * arrowTravel
      const arrowY = y1 + (y2 - y1) * arrowTravel
      const arrowLength = metrics.cellWidth * 0.072
      const arrowHalfHeight = metrics.cellWidth * 0.045
      const arrowBaseX = arrowX - Math.cos(angle) * arrowLength
      const arrowBaseY = arrowY - Math.sin(angle) * arrowLength
      const leftX = arrowBaseX + Math.cos(angle + Math.PI / 2) * arrowHalfHeight
      const leftY = arrowBaseY + Math.sin(angle + Math.PI / 2) * arrowHalfHeight
      const rightX = arrowBaseX + Math.cos(angle - Math.PI / 2) * arrowHalfHeight
      const rightY = arrowBaseY + Math.sin(angle - Math.PI / 2) * arrowHalfHeight

      pathLayer.stroke({
        color: ACTIVE_PATH_OUTLINE,
        width: outlineWidth,
        alpha: segment.variant === 'event' ? 0.58 * eventFade : 0.96,
        cap: 'round',
        join: 'round',
      })
      pathLayer.moveTo(leftX, leftY)
      pathLayer.lineTo(arrowX, arrowY)
      pathLayer.lineTo(rightX, rightY)
      pathLayer.stroke()
      pathLayer.stroke({ color, width: lineWidth, alpha, cap: 'round', join: 'round' })
      pathLayer.moveTo(leftX, leftY)
      pathLayer.lineTo(arrowX, arrowY)
      pathLayer.lineTo(rightX, rightY)
      pathLayer.stroke()
    })
  }

  function syncLabels() {
    const liveKeys = new Set(currentModel.labels.map((label) => label.key))
    emittedLabelKeys.forEach((key) => {
      if (!liveKeys.has(key)) {
        emittedLabelKeys.delete(key)
      }
    })
    labelNodes.forEach((node, key) => {
      if (!liveKeys.has(key)) {
        labelLayer.removeChild(node.container)
        labelNodes.delete(key)
      }
    })

    const laneCount = 1
    const boardCenterX = metrics.offsetX + (currentModel.cols * metrics.pitchX - metrics.gap) / 2
    const originY = metrics.offsetY + (currentModel.rows * metrics.pitchY - metrics.gap) * 0.58

    currentModel.labels.forEach((label, index) => {
      if (labelNodes.has(label.key) || emittedLabelKeys.has(label.key)) {
        return
      }

      const node = makeLabelNode(label)
      const stackIndex = Math.floor(index / laneCount)
      const startX = boardCenterX + label.driftX * 0.12
      const topBandY = metrics.offsetY + metrics.cellHeight * (0.46 + stackIndex * 0.82)
      const minY = node.text.height * 0.95 + 6
      const maxY = app.renderer.height - node.text.height * 0.8 - 6
      const targetY = clamp(topBandY, minY, maxY)
      const startY = clamp(originY + stackIndex * 10, targetY + 26, maxY)
      const targetX = boardCenterX
      node.container.position.set(startX, startY)
      node.container.alpha = 0
      labelLayer.addChild(node.container)
      labelNodes.set(label.key, node)
      emittedLabelKeys.add(label.key)
      runAnimation({
        id: `label:${label.key}`,
        elapsedMs: 0,
        delayMs: label.delayMs,
        durationMs: label.variant === 'system' ? 1890 : label.variant === 'combo' ? 1620 : label.variant.includes('score') ? 1980 : 1770,
        update: (progress) => {
          const launchProgress = Math.min(progress / 0.28, 1)
          const launchEased = easeOutQuart(launchProgress)
          const coastProgress = progress <= 0.28 ? 0 : (progress - 0.28) / 0.72
          const coastEased = easeOutCubic(coastProgress)
          const arcX = Math.sin(progress * Math.PI) * (label.driftX * 0.08)
          const comboBoost = label.variant.startsWith('auto') ? 0.08 : 0
          node.container.alpha =
            progress < 0.08 ? progress / 0.08 : progress > 0.72 ? 1 - (progress - 0.72) / 0.28 : 1
          const travelProgress = progress <= 0.28
            ? launchEased * 0.58
            : 0.58 + coastEased * 0.42
          node.container.position.set(
            startX + (targetX - startX) * travelProgress + arcX,
            startY + (targetY - startY) * travelProgress,
          )
          const wobble =
            label.variant === 'combo'
              ? Math.sin(progress * Math.PI) * 0.025
              : label.variant === 'system'
                ? 0
              : label.variant.includes('score')
                ? Math.sin(progress * Math.PI) * (label.variant.startsWith('auto') ? 0.055 : 0.035)
                : 0
          const scale = label.variant === 'combo'
            ? 0.84 + easeOutBack(progress) * 0.18
            : label.variant === 'system'
              ? 0.94 + travelProgress * 0.04
            : label.variant.includes('score')
            ? 0.9 + easeOutBack(progress) * (0.16 + comboBoost)
            : 0.96 + travelProgress * (0.06 + comboBoost)
          node.container.scale.set(scale)
          node.container.rotation = wobble
        },
        complete: () => {
          labelLayer.removeChild(node.container)
          labelNodes.delete(label.key)
        },
      })
    })
  }

  function triggerImpactPulse() {
    pulseLayer.clear()
    const impactCenter = currentModel.impactPosition
      ? getCellCenter(currentModel.impactPosition.row, currentModel.impactPosition.col, metrics)
      : { x: app.renderer.width / 2, y: app.renderer.height / 2 }
    const centerX = impactCenter.x
    const centerY = impactCenter.y
    const localImpact = currentModel.impactPosition !== null
    const maxRadius = localImpact
      ? Math.min(metrics.cellWidth, metrics.cellHeight) * 1.65
      : Math.min(app.renderer.width, app.renderer.height) * 0.54
    const comboStrength = getComboStrength(currentModel.clearCombo)
    const pulseColor = localImpact ? 0xf0d97d : comboStrength > 0 ? 0xb7ff87 : EVENT_PATH
    const clearedIds = new Set(
      currentModel.tiles.filter((tile) => tile.cleared).map((tile) => tile.id),
    )
    runAnimation({
      id: `impact:${Date.now()}`,
      elapsedMs: 0,
      delayMs: 0,
      durationMs: localImpact ? 630 : 450 + comboStrength * 180,
      update: (progress) => {
        const eased = easeOutQuart(progress)
        const quakeFade = 1 - easeInCubic(progress)
        const quakeOffset = localImpact ? Math.sin(progress * Math.PI * 7) * metrics.gap * 0.4 * quakeFade : 0
        const quakeLift = localImpact ? Math.cos(progress * Math.PI * 5.5) * metrics.gap * 0.22 * quakeFade : 0
        tileLayer.position.set(quakeOffset, quakeLift)
        pathLayer.position.set(quakeOffset * 1.05, quakeLift)
        particleLayer.position.set(quakeOffset * 1.2, quakeLift * 1.1)
        labelLayer.position.set(quakeOffset * 0.9, quakeLift * 0.9)
        if (localImpact) {
          const rippleRadius = metrics.cellWidth * 0.55 + eased * Math.min(app.renderer.width, app.renderer.height) * 0.88
          const rippleWidth = metrics.cellWidth * 0.78
          tileNodes.forEach((node) => {
            if (clearedIds.has(node.id)) {
              return
            }
            const tileCenter = getCellCenter(node.row, node.col, metrics)
            const dx = tileCenter.x - centerX
            const dy = tileCenter.y - centerY
            const distance = Math.hypot(dx, dy)
            const rippleBand = Math.exp(-((distance - rippleRadius) ** 2) / (2 * rippleWidth ** 2))
            const epicenterBand = Math.exp(-(distance ** 2) / (2 * (metrics.cellWidth * 1.22) ** 2))
            const influence = (rippleBand * 0.92 + epicenterBand * 1.08) * quakeFade
            const direction = dx === 0 ? 1 : Math.sign(dx)
            const rest = getRestScale(node.selected)
            setTileScale(
              node,
              rest.x + influence * 0.045,
              rest.y - influence * 0.07,
            )
            node.container.rotation = direction * influence * 0.06
            node.glyph.y = node.glyphBaseY - influence * metrics.cellHeight * 0.12
          })
        }
        pulseLayer.clear()
        pulseLayer.fill({
          color: pulseColor,
          alpha: (1 - eased) * (localImpact ? 0.24 : 0.18 + comboStrength * 0.12),
        })
        pulseLayer.circle(
          centerX,
          centerY,
          maxRadius *
            (localImpact
              ? 0.42 + eased * 0.8
              : (0.45 - comboStrength * 0.04) + eased * (0.55 + comboStrength * 0.09)),
        )
        pulseLayer.fill()
        if (localImpact || comboStrength > 0.01) {
          pulseLayer.stroke({
            color: localImpact ? 0xfff1bf : 0xeaffcf,
            width: localImpact ? 2.5 : 2,
            alpha: (1 - eased) * (localImpact ? 0.34 : 0.24 + comboStrength * 0.14),
          })
          pulseLayer.circle(
            centerX,
            centerY,
            maxRadius * (localImpact ? 0.2 + eased * 1.02 : 0.34 + eased * 0.48),
          )
          pulseLayer.stroke()
        }
        if (localImpact) {
          pulseLayer.stroke({
            color: 0xfff6dd,
            width: 1.5,
            alpha: (1 - eased) * 0.26,
          })
          pulseLayer.circle(centerX, centerY, maxRadius * (0.58 + eased * 1.5))
          pulseLayer.stroke()
        }
      },
      complete: () => {
        pulseLayer.clear()
        tileLayer.position.set(0, 0)
        pathLayer.position.set(0, 0)
        particleLayer.position.set(0, 0)
        labelLayer.position.set(0, 0)
        tileNodes.forEach((node) => {
          const rest = getRestScale(node.selected)
          setTileScale(node, rest.x, rest.y)
          node.container.rotation = 0
          node.glyph.y = node.glyphBaseY
        })
      },
    })
  }

  function sync(model: BoardRenderModel) {
    currentModel = model
    metrics = getBoardMetrics(app.renderer.width, app.renderer.height, currentModel.rows, currentModel.cols)
    drawBoardBackdrop()
    pathDirty = true

    const liveSegmentKeys = new Set(model.segments.map((segment) => segment.key))
    segmentProgress.forEach((_progress, key) => {
      if (!liveSegmentKeys.has(key)) {
        segmentProgress.delete(key)
      }
    })
    model.segments.forEach((segment) => {
      if (segmentProgress.has(segment.key)) {
        return
      }
      segmentProgress.set(segment.key, 0)
      runAnimation({
        id: `segment:${segment.key}`,
        elapsedMs: 0,
        delayMs: segment.delayMs,
        durationMs:
          segment.variant === 'event'
            ? Math.round(TILE_CLEAR_ANIMATION_MS * 0.82)
            : segment.variant === 'invalid'
              ? 120
              : 100,
        update: (progress) => {
          segmentProgress.set(segment.key, progress)
          pathDirty = true
        },
        complete: () => {
          segmentProgress.set(segment.key, 1)
          pathDirty = true
        },
      })
    })

    const liveIds = new Set(model.tiles.map((tile) => tile.id))
    tileNodes.forEach((node, id) => {
      if (!liveIds.has(id)) {
        tileLayer.removeChild(node.container)
        tileNodes.delete(id)
      }
    })

    model.tiles.forEach((tile) => {
      const node = tileNodes.get(tile.id) ?? makeTileNode(tile)
      tileNodes.set(tile.id, node)
      updateTileNode(node, tile)
    })

    drawSegments()
    syncLabels()

    if (model.clearImpactActive) {
      triggerImpactPulse()
    }
  }

  drawBoardBackdrop()

  return {
    resize,
    sync,
    destroy() {
      animations.clear()
      particleNodes.clear()
      app.destroy(true, { children: true })
      if (mountNode.contains(canvas)) {
        mountNode.removeChild(canvas)
      }
    },
  }
}
