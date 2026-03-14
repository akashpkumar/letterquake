import { type PointerEvent as ReactPointerEvent, useEffect, useEffectEvent, useRef } from 'react'
import { getBoardMetrics } from './layout'
import type { BoardRenderModel } from './types'
import type { Position } from '../game/types'
import type { BoardScene } from './BoardScene'

interface GameBoardHostProps {
  model: BoardRenderModel
  inputLocked: boolean
  snapRatio: number
  onStartSelection: (position: Position) => void
  onExtendSelection: (position: Position) => void
  onFinalizeSelection: () => void
}

function resolveBoardPosition(
  event: PointerEvent | ReactPointerEvent<HTMLDivElement>,
  boardElement: HTMLDivElement,
  model: BoardRenderModel,
  snapRatio: number,
): Position | null {
  const rect = boardElement.getBoundingClientRect()
  const metrics = getBoardMetrics(rect.width, rect.height, model.rows, model.cols)
  const localX = event.clientX - rect.left
  const localY = event.clientY - rect.top
  const col = Math.floor((localX - metrics.offsetX) / metrics.pitchX)
  const row = Math.floor((localY - metrics.offsetY) / metrics.pitchY)

  if (row < 0 || row >= model.rows || col < 0 || col >= model.cols) {
    return null
  }

  const centerX = metrics.offsetX + col * metrics.pitchX + metrics.cellWidth / 2
  const centerY = metrics.offsetY + row * metrics.pitchY + metrics.cellHeight / 2
  const snapRadius = Math.min(metrics.cellWidth, metrics.cellHeight) * snapRatio

  if (Math.hypot(localX - centerX, localY - centerY) > snapRadius) {
    return null
  }

  const hasTile = model.tiles.some((tile) => tile.row === row && tile.col === col)
  return hasTile ? { row, col } : null
}

export function GameBoardHost({
  model,
  inputLocked,
  snapRatio,
  onStartSelection,
  onExtendSelection,
  onFinalizeSelection,
}: GameBoardHostProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<BoardScene | null>(null)
  const sceneGenerationRef = useRef(0)
  const lastSyncedModelRef = useRef<BoardRenderModel | null>(null)
  const draggingRef = useRef(false)
  const pointerIdRef = useRef<number | null>(null)

  const finalizeSelection = useEffectEvent(() => {
    draggingRef.current = false
    pointerIdRef.current = null
    onFinalizeSelection()
  })

  useEffect(() => {
    const mountNode = mountRef.current
    if (!mountNode) {
      return
    }

    sceneGenerationRef.current += 1
    const generation = sceneGenerationRef.current
    let cancelled = false
    let cleanupResize: (() => void) | null = null
    let localScene: BoardScene | null = null

    import('./BoardScene').then(({ createBoardScene }) =>
      createBoardScene(mountNode, model),
    ).then((scene) => {
      if (cancelled || generation !== sceneGenerationRef.current) {
        scene.destroy()
        return
      }

      localScene = scene
      sceneRef.current = scene
      const resize = () => {
        const rect = mountNode.getBoundingClientRect()
        scene.resize(rect.width, rect.height)
      }

      resize()
      scene.sync(model)
      lastSyncedModelRef.current = model

      if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(resize)
        observer.observe(mountNode)
        cleanupResize = () => observer.disconnect()
      } else {
        window.addEventListener('resize', resize)
        cleanupResize = () => window.removeEventListener('resize', resize)
      }
    })

    return () => {
      cancelled = true
      cleanupResize?.()
      if (localScene) {
        localScene.destroy()
        if (sceneRef.current === localScene) {
          sceneRef.current = null
        }
      }
    }
  }, [])

  useEffect(() => {
    if (!sceneRef.current || lastSyncedModelRef.current === model) {
      return
    }

    sceneRef.current.sync(model)
    lastSyncedModelRef.current = model
  }, [model])

  useEffect(() => {
    function handlePointerUp() {
      if (!draggingRef.current) {
        return
      }
      finalizeSelection()
    }

    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [finalizeSelection])

  return (
    <div
      aria-label="game board"
      className={`board${model.phase === 'clear' ? ' board--shake' : ''}${model.clearImpactActive ? ' board--impact' : ''}${model.settled ? ' board--settled' : ''}${inputLocked ? ' board--locked' : ''}`}
      data-testid="board"
      onPointerDown={(event) => {
        if (inputLocked) {
          return
        }
        const boardElement = mountRef.current
        if (!boardElement) {
          return
        }
        const position = resolveBoardPosition(event, boardElement, model, snapRatio)
        if (!position) {
          return
        }
        draggingRef.current = true
        pointerIdRef.current = event.pointerId
        event.currentTarget.setPointerCapture?.(event.pointerId)
        onStartSelection(position)
      }}
      onPointerMove={(event) => {
        if (!draggingRef.current || pointerIdRef.current !== event.pointerId) {
          return
        }
        const boardElement = mountRef.current
        if (!boardElement) {
          return
        }
        const position = resolveBoardPosition(event, boardElement, model, snapRatio)
        if (position) {
          onExtendSelection(position)
        }
      }}
      ref={mountRef}
    />
  )
}
