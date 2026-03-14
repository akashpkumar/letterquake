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
}

interface LabelNode {
  key: string
  container: Container
  background: Graphics
  text: Text
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
    case 'auto-word':
      return { fill: 0x143c2b, stroke: 0x53af7b, alpha: 0.95 }
    case 'auto-score':
      return { fill: 0x1a4f31, stroke: 0x62c08a, alpha: 0.95 }
    default:
      return { fill: 0x202023, stroke: 0x434349, alpha: 0.95 }
  }
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

function drawStandardTile(graphics: Graphics, tile: BoardRenderTile, metrics: BoardMetrics) {
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
  const paddingX = label.variant.includes('score') ? 18 : 14
  const paddingY = label.variant.includes('score') ? 9 : 7
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
    width: Math.max(1, mountNode.clientWidth || 1),
    height: Math.max(1, mountNode.clientHeight || 1),
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
  const labelLayer = new Container()
  tileLayer.sortableChildren = true

  app.stage.addChild(backgroundLayer)
  app.stage.addChild(pulseLayer)
  app.stage.addChild(tileLayer)
  app.stage.addChild(pathLayer)
  app.stage.addChild(labelLayer)

  const tileNodes = new Map<string, TileNode>()
  const labelNodes = new Map<string, LabelNode>()
  const animations = new Map<string, Animation>()
  let metrics = getBoardMetrics(app.renderer.width, app.renderer.height, initialModel.rows, initialModel.cols)
  let currentModel = initialModel

  function runAnimation(animation: Animation) {
    animations.set(animation.id, animation)
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
  })

  function resize(width: number, height: number) {
    app.renderer.resize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)))
    metrics = getBoardMetrics(app.renderer.width, app.renderer.height, currentModel.rows, currentModel.cols)
    drawBoardBackdrop()
    sync(currentModel)
  }

  function drawBoardBackdrop() {
    backgroundLayer.clear()
    backgroundLayer.fill({ color: BOARD_BG, alpha: 0.001 })
    backgroundLayer.rect(0, 0, app.renderer.width, app.renderer.height)
    backgroundLayer.fill()
    for (let row = 0; row < currentModel.rows; row += 1) {
      for (let col = 0; col < currentModel.cols; col += 1) {
        const position = getCellPosition(row, col, metrics)
        backgroundLayer.fill({ color: 0x09090a })
        drawRoundedRect(
          backgroundLayer,
          position.x,
          position.y,
          metrics.cellWidth,
          metrics.cellHeight,
          metrics.radius,
        )
        backgroundLayer.fill()
        backgroundLayer.stroke({ color: 0x242426, width: 1, alpha: 0.9 })
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
    }
  }

  function updateTileNode(node: TileNode, tile: BoardRenderTile) {
    const letterTint = drawStandardTile(node.plate, tile, metrics)
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
    if (motion && (moved || node.container.x === 0 && node.container.y === 0)) {
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
        durationMs: tile.selected ? 150 : 120,
        update: (progress) => {
          const eased = tile.selected ? easeOutBack(progress) : easeInOutCubic(progress)
          const start = tile.selected ? { x: 1, y: 1 } : { x: 1.02, y: 0.98 }
          const end = tile.selected ? { x: 1.02, y: 0.98 } : { x: 1, y: 1 }
          setTileScale(
            node,
            start.x + (end.x - start.x) * eased,
            start.y + (end.y - start.y) * eased,
          )
          node.container.y =
            targetCenterY - (tile.selected ? eased * 2.5 : (1 - eased) * 2.5)
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

    if (tile.cleared) {
      const clearToken = `${tile.clearDelayMs ?? 0}:${tile.kind}:${currentModel.phase}`
      if (node.clearToken !== clearToken) {
        node.clearToken = clearToken
        runAnimation({
          id: `clear:${tile.id}:${clearToken}`,
          elapsedMs: 0,
          delayMs: tile.clearDelayMs ?? 0,
          durationMs: TILE_CLEAR_ANIMATION_MS,
          update: (progress) => {
            if (progress < 0.38) {
              const confirm = progress / 0.38
              const crest = Math.exp(-((confirm - 0.48) ** 2) / 0.05)
              const trailing = Math.exp(-((confirm - 0.68) ** 2) / 0.028) * 0.42
              const wave = clamp(crest + trailing, 0, 1.08)
              setTileScale(node, 1 - wave * 0.09, 1 + wave * 0.16)
              node.container.y = targetCenterY - wave * metrics.cellHeight * 0.22
              node.glyph.y = node.glyphBaseY - wave * metrics.cellHeight * 0.12
              node.glyph.rotation = (confirm - 0.48) * 0.22 * wave
              node.container.alpha = 1
              return
            }

            const release = (progress - 0.38) / 0.62
            const eased = easeOutQuart(release)
            node.container.y = targetCenterY
            node.glyph.y = node.glyphBaseY
            const rest = getRestScale(tile.selected)
            setTileScale(node, rest.x, rest.y)
            node.container.alpha = 1 - eased * 0.78
            node.glyph.rotation = 0
          },
          complete: () => {
            const rest = getRestScale(tile.selected)
            setTileScale(node, rest.x, rest.y)
            node.container.alpha = currentModel.phase === 'clear' ? 0.3 : 1
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
      node.container.alpha = 1
      const rest = getRestScale(tile.selected)
      setTileScale(node, rest.x, rest.y)
      node.container.y = targetCenterY
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
      const x2 = to.x - unitX * toInset
      const y2 = to.y - unitY * toInset
      const color = segment.variant === 'active' ? ACTIVE_PATH : segment.variant === 'invalid' ? INVALID_PATH : EVENT_PATH
      const alpha =
        segment.variant === 'event'
          ? 0.94
          : segment.variant === 'invalid'
            ? 0.96
            : 0.88 + Math.sin(performance.now() / 120) * 0.08
      const outlineWidth = metrics.cellWidth * 0.06
      const lineWidth = metrics.cellWidth * 0.032
      pathLayer.stroke({ color: ACTIVE_PATH_OUTLINE, width: outlineWidth, alpha: segment.variant === 'event' ? 0.58 : 0.96, cap: 'round', join: 'round' })
      pathLayer.moveTo(x1, y1)
      pathLayer.lineTo(x2, y2)
      pathLayer.stroke()
      pathLayer.stroke({ color, width: lineWidth, alpha, cap: 'round', join: 'round' })
      pathLayer.moveTo(x1, y1)
      pathLayer.lineTo(x2, y2)
      pathLayer.stroke()

      const angle = Math.atan2(dy, dx)
      const arrowX = (x1 + x2) / 2
      const arrowY = (y1 + y2) / 2
      const arrowLength = metrics.cellWidth * 0.072
      const arrowHalfHeight = metrics.cellWidth * 0.045
      const arrowBaseX = arrowX - Math.cos(angle) * arrowLength
      const arrowBaseY = arrowY - Math.sin(angle) * arrowLength
      const leftX = arrowBaseX + Math.cos(angle + Math.PI / 2) * arrowHalfHeight
      const leftY = arrowBaseY + Math.sin(angle + Math.PI / 2) * arrowHalfHeight
      const rightX = arrowBaseX + Math.cos(angle - Math.PI / 2) * arrowHalfHeight
      const rightY = arrowBaseY + Math.sin(angle - Math.PI / 2) * arrowHalfHeight

      pathLayer.stroke({ color: ACTIVE_PATH_OUTLINE, width: outlineWidth, alpha: segment.variant === 'event' ? 0.58 : 0.96, cap: 'round', join: 'round' })
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
    labelNodes.forEach((node, key) => {
      if (!liveKeys.has(key)) {
        labelLayer.removeChild(node.container)
        labelNodes.delete(key)
      }
    })

    currentModel.labels.forEach((label) => {
      if (labelNodes.has(label.key)) {
        return
      }

      const node = makeLabelNode(label)
      const x = metrics.offsetX + label.x * metrics.pitchX
      const y = metrics.offsetY + label.y * metrics.pitchY
      node.container.position.set(x, y)
      node.container.alpha = 0
      labelLayer.addChild(node.container)
      labelNodes.set(label.key, node)
      runAnimation({
        id: `label:${label.key}`,
        elapsedMs: 0,
        delayMs: label.delayMs,
        durationMs: label.variant.includes('score') ? 920 : 820,
        update: (progress) => {
          const eased = easeOutQuart(progress)
          const arcX = Math.sin(progress * Math.PI) * label.driftX * 0.35
          node.container.alpha = progress < 0.12 ? progress / 0.12 : 1 - progress
          node.container.position.set(
            x + label.driftX * eased + arcX,
            y - (label.variant.includes('score') ? 50 : 38) * eased,
          )
          const wobble = label.variant.includes('score') ? Math.sin(progress * Math.PI) * 0.035 : 0
          const scale = label.variant.includes('score') ? 0.9 + easeOutBack(progress) * 0.16 : 0.96 + eased * 0.06
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
    const centerX = app.renderer.width / 2
    const centerY = app.renderer.height / 2
    const maxRadius = Math.min(app.renderer.width, app.renderer.height) * 0.54
    runAnimation({
      id: `impact:${Date.now()}`,
      elapsedMs: 0,
      delayMs: 0,
      durationMs: 300,
      update: (progress) => {
        const eased = easeOutQuart(progress)
        pulseLayer.clear()
        pulseLayer.fill({ color: EVENT_PATH, alpha: (1 - eased) * 0.18 })
        pulseLayer.circle(centerX, centerY, maxRadius * (0.45 + eased * 0.55))
        pulseLayer.fill()
      },
      complete: () => {
        pulseLayer.clear()
      },
    })
  }

  function sync(model: BoardRenderModel) {
    currentModel = model
    metrics = getBoardMetrics(app.renderer.width, app.renderer.height, currentModel.rows, currentModel.cols)
    drawBoardBackdrop()

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
  sync(initialModel)

  return {
    resize,
    sync,
    destroy() {
      animations.clear()
      app.destroy(true, { children: true })
      if (mountNode.contains(canvas)) {
        mountNode.removeChild(canvas)
      }
    },
  }
}
