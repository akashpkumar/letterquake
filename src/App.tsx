import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'
import {
  CLEAR_PRE_HOLD_MS,
  CLEAR_WAVE_HOLD_MS,
  CLEAR_WAVE_STAGGER_MS,
  CONNECTOR_OFFSET,
  FALL_BASE_DURATION_MS,
  FALL_COLUMN_SWEEP_MS,
  FALL_DELAY_PER_ROW_MS,
  FALL_DURATION_PER_ROW_MS,
  FALL_LAND_BOUNCE_PX,
  FLOAT_SCORE_DURATION_MS,
  FLOAT_SCORE_DELAY_MS,
  FLOAT_WORD_DURATION_MS,
  INVALID_FLASH_MS,
  MATCH_FEEDBACK_STEP_MULTIPLIER,
  SCORE_PULSE_DURATION_MS,
  SHUFFLE_PENALTY,
  SPAWN_BASE_DURATION_MS,
  SPAWN_COLUMN_SWEEP_MS,
  SPAWN_DELAY_PER_ROW_MS,
  SPAWN_DURATION_PER_ROW_MS,
  STEP_DURATIONS,
  TILE_CLEAR_ANIMATION_MS,
} from './game/constants'
import { createGame, shuffleGame, submitSelection } from './game/engine'
import { getTileDefinition, STARTER_TILE_KINDS } from './game/tileRegistry'
import type {
  FoundWord,
  GameState,
  Position,
  Tile,
  TurnPhase,
  TurnResult,
  TurnStep,
} from './game/types'

interface LexplosionAppProps {
  initialGame?: GameState
  stepDurations?: Partial<Record<TurnPhase, number>>
}

type ConfirmAction = 'shuffle' | 'reset'

const TILE_SNAP_RATIO = 0.34

function HelpIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 17.2a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3Zm.02-12.7c-3.08 0-5.12 1.64-5.28 4.36h2.26c.12-1.35 1.15-2.18 2.82-2.18 1.56 0 2.59.75 2.59 1.96 0 .92-.46 1.46-1.9 2.26-1.82 1.01-2.44 1.98-2.39 3.96v.33h2.2v-.25c0-1.26.33-1.79 1.69-2.57 1.62-.92 2.62-1.86 2.62-3.77 0-2.47-1.96-4.1-4.61-4.1Z"
        fill="currentColor"
      />
    </svg>
  )
}

function ShuffleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M16.8 4h2.7v2.7M7 7h2.5c1.1 0 2.1.53 2.73 1.42l3.54 5.16A3.34 3.34 0 0 0 18.57 15H20m-.5 5v-2.7h-2.7M4 7h1.55c1.08 0 2.1.52 2.73 1.4L9.8 10.6m4.4 2.8 1.52 2.2A3.34 3.34 0 0 0 18.45 17H20M4 17h1.55c1.08 0 2.1-.52 2.73-1.4L9.8 13.4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function RestartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M7.3 6.4V3.5L3.5 7.3l3.8 3.8V8.2h6.05a5.15 5.15 0 1 1-4.62 7.43l-2 .9A7.35 7.35 0 1 0 13.35 6.4H7.3Z"
        fill="currentColor"
      />
    </svg>
  )
}

function hashPosition(position: Position): string {
  return `${position.row}:${position.col}`
}

function formatWords(words: string[]): string {
  return words.join(' · ')
}

interface OverlaySegment {
  key: string
  x1: number
  y1: number
  x2: number
  y2: number
  midX: number
  midY: number
  angle: number
  variant: 'active' | 'invalid' | 'event'
  delayMs: number
}

interface FloatingLabel {
  key: string
  x: number
  y: number
  text: string
  variant: 'word' | 'score' | 'auto-word' | 'auto-score'
  delayMs: number
  driftX: number
}

interface MotionSpec {
  delayMs: number
  durationMs: number
  rowsMoved: number
}

function createEmptyBoard(size: number) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null as GameState['board'][number][number]),
  )
}

function renderTileIdentity(tile: Tile) {
  if (tile.kind === 'gold') {
    return <span aria-hidden="true" className="tile__identity tile__identity--gold" />
  }

  if (tile.kind === 'cracked') {
    const durability = tile.state?.durability ?? 2
    return (
      <span
        aria-hidden="true"
        className={`tile__identity tile__identity--cracked tile__identity--cracked-${durability}`}
      />
    )
  }

  if (tile.kind === 'anchor') {
    return <span aria-hidden="true" className="tile__identity tile__identity--anchor" />
  }

  return null
}

function buildIntroTurn(nextGame: GameState): TurnResult {
  const spawnedPositions: Position[] = []
  nextGame.board.forEach((row, rowIndex) => {
    row.forEach((tile, colIndex) => {
      if (tile) {
        spawnedPositions.push({ row: rowIndex, col: colIndex })
      }
    })
  })

  return {
    valid: true,
    nextState: nextGame,
    steps: [
      {
        phase: 'refill',
        board: nextGame.board,
        words: [],
        matchedPositions: [],
        clearedPositions: [],
        retainedPositions: [],
        movedPositions: [],
        spawnedPositions,
        combo: 0,
        scoreDelta: 0,
      },
    ],
  }
}

function createInitialAppState(initialGame?: GameState) {
  if (initialGame) {
    return {
      game: initialGame,
      pendingTurn: null as TurnResult | null,
      stepIndex: -1,
      statusMessage: initialGame.gameOver
        ? 'No words left on the board. Start a new run.'
        : 'Drag across adjacent letters to spell a word.',
    }
  }

  const nextGame = createGame()
  return {
    game: { ...nextGame, board: createEmptyBoard(nextGame.board.length) },
    pendingTurn: buildIntroTurn(nextGame),
    stepIndex: 0,
    statusMessage: 'Board filling in.',
  }
}

function buildClearDelayMap(words: FoundWord[]): Map<string, number> {
  const delays = new Map<string, number>()

  words.forEach((word) => {
    word.positions.forEach((position, index) => {
      const key = hashPosition(position)
      const delay = CLEAR_PRE_HOLD_MS + index * CLEAR_WAVE_STAGGER_MS
      const current = delays.get(key)
      if (current === undefined || delay < current) {
        delays.set(key, delay)
      }
    })
  })

  return delays
}

function buildTilePositionMap(board: GameState['board'] | TurnStep['board'] | null): Map<string, Position> {
  const positions = new Map<string, Position>()

  board?.forEach((row, rowIndex) => {
    row.forEach((tile, colIndex) => {
      if (!tile) {
        return
      }
      positions.set(tile.id, { row: rowIndex, col: colIndex })
    })
  })

  return positions
}

export function LexplosionApp({
  initialGame,
  stepDurations,
}: LexplosionAppProps) {
  const [initialState] = useState(() => createInitialAppState(initialGame))
  const [game, setGame] = useState<GameState>(initialState.game)
  const [pendingTurn, setPendingTurn] = useState<TurnResult | null>(
    initialState.pendingTurn,
  )
  const [stepIndex, setStepIndex] = useState(initialState.stepIndex)
  const [statusMessage, setStatusMessage] = useState(initialState.statusMessage)
  const [helpOpen, setHelpOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const dragPathRef = useRef<Position[]>([])
  const isDraggingRef = useRef(false)
  const activePointerIdRef = useRef<number | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const tileBlockRefs = useRef(new Map<string, HTMLSpanElement>())
  const invalidResetTimeoutRef = useRef<number | null>(null)
  const [invalidPath, setInvalidPath] = useState<Position[]>([])

  const animationDurations = useMemo(
    () => ({ ...STEP_DURATIONS, ...stepDurations }),
    [stepDurations],
  )
  const inputLocked = pendingTurn !== null || game.turnStatus === 'resolving'
  const activeStep: TurnStep | null =
    pendingTurn && stepIndex >= 0 && stepIndex < pendingTurn.steps.length
      ? pendingTurn.steps[stepIndex]
      : null
  const displayBoard =
    activeStep?.board ??
    (pendingTurn && stepIndex >= pendingTurn.steps.length
      ? pendingTurn.nextState.board
      : game.board)
  const previousStep = useMemo(
    () =>
      pendingTurn && stepIndex > 0 && stepIndex - 1 < pendingTurn.steps.length
        ? pendingTurn.steps[stepIndex - 1]
        : null,
    [pendingTurn, stepIndex],
  )

  const displayedClearWordDetails = useMemo<FoundWord[]>(() => {
    if (activeStep?.phase === 'clear') {
      return activeStep.words
    }

    if (activeStep?.phase === 'pause-clear' && previousStep?.phase === 'clear') {
      return previousStep.words
    }

    return []
  }, [activeStep, previousStep])

  const displayedClearWords = useMemo(
    () => displayedClearWordDetails.map((word) => word.word),
    [displayedClearWordDetails],
  )
  const clearDelayMap = useMemo(
    () => buildClearDelayMap(displayedClearWordDetails),
    [displayedClearWordDetails],
  )
  const clearWaveDuration = useMemo(() => {
    let maxDelay = 0
    clearDelayMap.forEach((delay) => {
      if (delay > maxDelay) {
        maxDelay = delay
      }
    })
    return maxDelay
  }, [clearDelayMap])

  const visibleClearStep =
    activeStep?.phase === 'clear'
      ? activeStep
      : activeStep?.phase === 'pause-clear' && previousStep?.phase === 'clear'
        ? previousStep
        : null

  const runtimeStatusMessage = activeStep
    ? activeStep.phase === 'clear'
      ? `${activeStep.combo > 1 ? 'Auto-clearing' : 'Clearing'} ${formatWords(
          activeStep.words.map((word) => word.word),
        )}`
      : activeStep.phase === 'pause-clear' && displayedClearWords.length > 0
        ? `${activeStep.combo > 1 ? 'Auto-cleared' : 'Cleared'} ${formatWords(
            displayedClearWords,
          )}`
        : activeStep.phase === 'gravity'
          ? 'Letters falling into place.'
          : activeStep.phase === 'pause-refill'
            ? 'Board settling.'
            : 'New letters flowing in.'
    : statusMessage

  const finishTurn = useEffectEvent((turn: TurnResult) => {
    setGame(turn.nextState)
    setPendingTurn(null)
    setStepIndex(-1)
    setStatusMessage(
      turn.nextState.gameOver
        ? 'Board exhausted. No valid words remain.'
        : `Cleared ${turn.nextState.lastWords[0]} for +${turn.nextState.lastScoreDelta}.`,
    )
  })

  const highlightedPositions = useMemo(() => {
    const selected = new Set(game.selectedPath.map(hashPosition))
    const invalid = new Set(invalidPath.map(hashPosition))
    const matched = new Set(activeStep?.matchedPositions.map(hashPosition) ?? [])
    const cleared = new Set(activeStep?.clearedPositions.map(hashPosition) ?? [])
    const retained = new Set(activeStep?.retainedPositions.map(hashPosition) ?? [])
    const moved = new Set(activeStep?.movedPositions.map(hashPosition) ?? [])
    const spawned = new Set(activeStep?.spawnedPositions.map(hashPosition) ?? [])

    return { selected, invalid, matched, cleared, retained, moved, spawned }
  }, [activeStep, game.selectedPath, invalidPath])
  const selectedOrderMap = useMemo(() => {
    const order = new Map<string, number>()
    game.selectedPath.forEach((position, index) => {
      order.set(hashPosition(position), index + 1)
    })
    return order
  }, [game.selectedPath])
  const fallMotionMap = useMemo(() => {
    const motion = new Map<string, MotionSpec>()

    if (activeStep?.phase !== 'gravity' || !previousStep?.board) {
      return motion
    }

    const previousPositions = buildTilePositionMap(previousStep.board)

    activeStep.movedPositions.forEach((position) => {
      const tile = activeStep.board[position.row]?.[position.col]
      if (!tile) {
        return
      }

      const previousPosition = previousPositions.get(tile.id)
      if (!previousPosition) {
        return
      }

      const rowsMoved = Math.max(1, position.row - previousPosition.row)
      motion.set(hashPosition(position), {
        rowsMoved,
        delayMs:
          (rowsMoved - 1) * FALL_DELAY_PER_ROW_MS +
          position.col * FALL_COLUMN_SWEEP_MS,
        durationMs: FALL_BASE_DURATION_MS + (rowsMoved - 1) * FALL_DURATION_PER_ROW_MS,
      })
    })

    return motion
  }, [activeStep, previousStep])
  const isAutoClearVisible = Boolean(visibleClearStep && visibleClearStep.combo > 1)
  const clearImpactActive = activeStep?.phase === 'clear'
  const boardClassName = [
    'board',
    activeStep?.phase === 'clear' ? 'board--shake' : '',
    clearImpactActive ? 'board--impact' : '',
    activeStep?.phase === 'pause-refill' ? 'board--settled' : '',
    inputLocked ? 'board--locked' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const spawnMotionMap = useMemo(() => {
    const motion = new Map<string, MotionSpec>()

    if (activeStep?.phase !== 'refill') {
      return motion
    }

    const spawnedByColumn = new Map<number, Position[]>()
    activeStep.spawnedPositions.forEach((position) => {
      const existing = spawnedByColumn.get(position.col)
      if (existing) {
        existing.push(position)
      } else {
        spawnedByColumn.set(position.col, [position])
      }
    })

    spawnedByColumn.forEach((positions, col) => {
      positions
        .slice()
        .sort((left, right) => left.row - right.row)
        .forEach((position, spawnIndex) => {
          const rowsMoved = position.row + 1
          motion.set(hashPosition(position), {
            rowsMoved,
            delayMs: spawnIndex * SPAWN_DELAY_PER_ROW_MS + col * SPAWN_COLUMN_SWEEP_MS,
            durationMs:
              SPAWN_BASE_DURATION_MS + (rowsMoved - 1) * SPAWN_DURATION_PER_ROW_MS,
          })
        })
    })

    return motion
  }, [activeStep])
  const spawnMotionWindow = useMemo(() => {
    let maxWindow = 0
    spawnMotionMap.forEach(({ delayMs, durationMs }) => {
      maxWindow = Math.max(maxWindow, delayMs + durationMs)
    })
    return maxWindow
  }, [spawnMotionMap])

  useEffect(() => {
    if (!pendingTurn) {
      return
    }

    if (stepIndex >= pendingTurn.steps.length) {
      finishTurn(pendingTurn)
      return
    }

    const step = pendingTurn.steps[stepIndex]
    const baseDuration = animationDurations[step.phase]
    const duration =
      step.phase === 'clear'
        ? Math.round(baseDuration * MATCH_FEEDBACK_STEP_MULTIPLIER) +
          clearWaveDuration +
          CLEAR_WAVE_HOLD_MS
        : step.phase === 'pause-clear'
          ? Math.round(baseDuration * MATCH_FEEDBACK_STEP_MULTIPLIER)
          : step.phase === 'refill'
            ? Math.max(baseDuration, spawnMotionWindow)
            : baseDuration

    const timeoutId = window.setTimeout(() => {
      setStepIndex((current) => current + 1)
    }, duration)

    return () => window.clearTimeout(timeoutId)
  }, [animationDurations, clearWaveDuration, pendingTurn, spawnMotionWindow, stepIndex])

  useLayoutEffect(() => {
    const boardElement = boardRef.current
    const boardRect = boardElement?.getBoundingClientRect() ?? null
    const boardStyle = boardElement ? window.getComputedStyle(boardElement) : null
    const rowGap = boardStyle ? Number.parseFloat(boardStyle.rowGap || boardStyle.gap || '0') : 0
    const colGap = boardStyle ? Number.parseFloat(boardStyle.columnGap || boardStyle.gap || '0') : 0
    const rowCount = displayBoard.length || 1
    const colCount = displayBoard[0]?.length ?? 1
    const cellWidth = boardRect ? (boardRect.width - colGap * (colCount - 1)) / colCount : 0
    const cellHeight = boardRect ? (boardRect.height - rowGap * (rowCount - 1)) / rowCount : 0
    const cellPitchY = cellHeight + rowGap

    if (activeStep?.phase === 'gravity' && boardRect) {
      displayBoard.forEach((row, rowIndex) => {
        row.forEach((tile, colIndex) => {
          if (!tile) {
            return
          }

          const element = tileBlockRefs.current.get(tile.id)
          const motion = fallMotionMap.get(hashPosition({ row: rowIndex, col: colIndex }))

          if (!element || !motion) {
            return
          }

          element.getAnimations().forEach((animation) => animation.cancel())
          element.animate(
            [
              { transform: `translate3d(0, ${-motion.rowsMoved * cellPitchY}px, 0)` },
              { transform: 'translate3d(0, 0, 0)' },
            ],
            {
              duration: motion.durationMs,
              delay: motion.delayMs,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              fill: 'both',
            },
          )
        })
      })
    }

    if (activeStep?.phase === 'refill' && boardRect) {
      displayBoard.forEach((row, rowIndex) => {
        row.forEach((tile, colIndex) => {
          if (!tile) {
            return
          }

          const element = tileBlockRefs.current.get(tile.id)
          const motion = spawnMotionMap.get(hashPosition({ row: rowIndex, col: colIndex }))

          if (!element || !motion) {
            return
          }

          const startY = -motion.rowsMoved * cellPitchY
          const driftX = ((colIndex % 2 === 0 ? -1 : 1) * cellWidth) / 48

          element.getAnimations().forEach((animation) => animation.cancel())
          element.animate(
            [
              {
                opacity: 0,
                transform: `translate3d(${driftX}px, ${startY}px, 0)`,
              },
              {
                opacity: 1,
                offset: 0.18,
                transform: `translate3d(${driftX * 0.45}px, ${startY * 0.72}px, 0)`,
              },
              {
                opacity: 1,
                offset: 1,
                transform: 'translate3d(0, 0, 0)',
              },
            ],
            {
              duration: motion.durationMs,
              delay: motion.delayMs,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              fill: 'both',
            },
          )
        })
      })
    }
  }, [activeStep?.phase, displayBoard, fallMotionMap, spawnMotionMap])

  useEffect(() => {
    return () => {
      if (invalidResetTimeoutRef.current !== null) {
        window.clearTimeout(invalidResetTimeoutRef.current)
      }
    }
  }, [])

  const overlaySegments = useMemo(() => {
    function buildSegments(positionsGroups: Position[][], variant: OverlaySegment['variant']) {
      const rowCount = displayBoard.length
      const colCount = displayBoard[0]?.length ?? 1
      const segments: OverlaySegment[] = []

      positionsGroups.forEach((positions, groupIndex) => {
        for (let index = 0; index < positions.length - 1; index += 1) {
          const from = positions[index]
          const to = positions[index + 1]
          const deltaCol = to.col - from.col
          const deltaRow = to.row - from.row
          const magnitude = Math.hypot(deltaCol, deltaRow) || 1
          const unitX = deltaCol / magnitude
          const unitY = deltaRow / magnitude
          const offsetX = (unitX * CONNECTOR_OFFSET * 100) / colCount
          const offsetY = (unitY * CONNECTOR_OFFSET * 100) / rowCount
          const fromCenterX = ((from.col + 0.5) / colCount) * 100
          const fromCenterY = ((from.row + 0.5) / rowCount) * 100
          const toCenterX = ((to.col + 0.5) / colCount) * 100
          const toCenterY = ((to.row + 0.5) / rowCount) * 100
          const x1 = fromCenterX + offsetX
          const y1 = fromCenterY + offsetY
          const x2 = toCenterX - offsetX
          const y2 = toCenterY - offsetY

          segments.push({
            key: `${variant}-${groupIndex}-${index}`,
            x1,
            y1,
            x2,
            y2,
            midX: (x1 + x2) / 2,
            midY: (y1 + y2) / 2,
            angle: (Math.atan2(deltaRow, deltaCol) * 180) / Math.PI,
            variant,
            delayMs: variant === 'event' ? (index + 1) * CLEAR_WAVE_STAGGER_MS : 0,
          })
        }
      })

      return segments
    }

    if (game.selectedPath.length > 1) {
      return buildSegments([game.selectedPath], 'active')
    }

    if (invalidPath.length > 1) {
      return buildSegments([invalidPath], 'invalid')
    }

    const clearGroups =
      activeStep?.phase === 'clear'
        ? displayedClearWordDetails
            .filter((word) => word.positions.length > 1)
            .map((word) => word.positions)
        : []

    return clearGroups.length > 0 ? buildSegments(clearGroups, 'event') : []
  }, [activeStep?.phase, displayBoard, displayedClearWordDetails, game.selectedPath, invalidPath])

  const floatingLabels = useMemo(() => {
    if (displayedClearWordDetails.length === 0 || !visibleClearStep) {
      return []
    }

    const rowCount = displayBoard.length
    const colCount = displayBoard[0]?.length ?? 1
    const wordLabels: FloatingLabel[] = displayedClearWordDetails.map((word, index) => {
      const center = word.positions.reduce(
        (accumulator, position) => ({
          x: accumulator.x + position.col + 0.5,
          y: accumulator.y + position.row + 0.5,
        }),
        { x: 0, y: 0 },
      )
      const count = word.positions.length || 1

      return {
        key: `word-${word.word}-${index}`,
        x: (center.x / count / colCount) * 100,
        y: (center.y / count / rowCount) * 100,
        text: word.word,
        variant: visibleClearStep.combo > 1 ? 'auto-word' : 'word',
        delayMs: 0,
        driftX: (index % 2 === 0 ? -1 : 1) * 12,
      }
    })

    const scoreCenter = wordLabels.reduce(
      (accumulator, label) => ({
        x: accumulator.x + label.x,
        y: accumulator.y + label.y,
      }),
      { x: 0, y: 0 },
    )

    return [
      ...wordLabels,
      {
        key: `score-${visibleClearStep.combo}-${visibleClearStep.scoreDelta}`,
        x: scoreCenter.x / wordLabels.length,
        y: Math.max(8, scoreCenter.y / wordLabels.length - 15),
        text: `+${visibleClearStep.scoreDelta}`,
        variant: visibleClearStep.combo > 1 ? 'auto-score' : 'score',
        delayMs: FLOAT_SCORE_DELAY_MS,
        driftX: 0,
      },
    ]
  }, [displayBoard, displayedClearWordDetails, visibleClearStep])

  function resetGame() {
    const nextGame = createGame()
    dragPathRef.current = []
    isDraggingRef.current = false
    if (invalidResetTimeoutRef.current !== null) {
      window.clearTimeout(invalidResetTimeoutRef.current)
      invalidResetTimeoutRef.current = null
    }
    setInvalidPath([])
    setGame({ ...nextGame, board: createEmptyBoard(nextGame.board.length) })
    setPendingTurn(buildIntroTurn(nextGame))
    setStepIndex(0)
    setStatusMessage('Board filling in.')
  }

  function handleShuffle() {
    if (inputLocked) {
      return
    }

    const nextGame = shuffleGame(game)
    dragPathRef.current = []
    isDraggingRef.current = false
    setInvalidPath([])
    setPendingTurn(null)
    setStepIndex(-1)
    setGame(nextGame)
    setStatusMessage(`Board shuffled for -${SHUFFLE_PENALTY}.`)
  }

  function requestShuffle() {
    if (inputLocked) {
      return
    }

    setConfirmAction('shuffle')
  }

  function requestReset() {
    setConfirmAction('reset')
  }

  function closeConfirmDialog() {
    setConfirmAction(null)
  }

  function confirmPendingAction() {
    if (confirmAction === 'shuffle') {
      handleShuffle()
    }

    if (confirmAction === 'reset') {
      resetGame()
    }

    setConfirmAction(null)
  }

  function setSelectedPath(path: Position[]) {
    dragPathRef.current = path
    setGame((current) => ({ ...current, selectedPath: path }))
  }

  function flashInvalidPath(path: Position[]) {
    if (invalidResetTimeoutRef.current !== null) {
      window.clearTimeout(invalidResetTimeoutRef.current)
    }

    setInvalidPath(path)
    invalidResetTimeoutRef.current = window.setTimeout(() => {
      setInvalidPath([])
      invalidResetTimeoutRef.current = null
    }, INVALID_FLASH_MS)
  }

  function startSelection(position: Position) {
    if (inputLocked || game.gameOver) {
      return
    }

    isDraggingRef.current = true
    setSelectedPath([position])
    setStatusMessage('Keep dragging through adjacent letters.')
  }

  function extendSelection(position: Position) {
    if (!isDraggingRef.current || inputLocked || game.gameOver) {
      return
    }

    const currentPath = dragPathRef.current
    if (currentPath.length === 0) {
      setSelectedPath([position])
      return
    }

    const lastPosition = currentPath[currentPath.length - 1]
    const positionKey = hashPosition(position)
    const previousPosition = currentPath[currentPath.length - 2]

    if (hashPosition(lastPosition) === positionKey) {
      return
    }

    if (previousPosition && hashPosition(previousPosition) === positionKey) {
      setSelectedPath(currentPath.slice(0, -1))
      return
    }

    const alreadySelected = currentPath.some(
      (entry) => hashPosition(entry) === positionKey,
    )
    const rowDistance = Math.abs(lastPosition.row - position.row)
    const colDistance = Math.abs(lastPosition.col - position.col)
    const isAdjacent =
      rowDistance <= 1 && colDistance <= 1 && (rowDistance !== 0 || colDistance !== 0)

    if (!alreadySelected && isAdjacent) {
      setSelectedPath([...currentPath, position])
    }
  }

  const finalizeSelection = useEffectEvent(() => {
    const selection = dragPathRef.current
    if (selection.length === 0 || inputLocked || game.gameOver) {
      setSelectedPath([])
      return
    }

    const turn = submitSelection(game, selection)
    if (!turn.valid) {
      setSelectedPath([])
      flashInvalidPath(selection)
      setStatusMessage(
        turn.reason === 'too-short'
          ? 'Need at least 3 letters.'
          : turn.reason === 'not-word'
            ? 'Not in the word list.'
            : 'Selection has to be a connected path.',
      )
      return
    }

    setGame((current) => ({
      ...current,
      selectedPath: [],
      turnStatus: 'resolving',
      animationQueue: turn.steps,
    }))
    dragPathRef.current = []
    setPendingTurn(turn)
    setStepIndex(0)
    setStatusMessage('Boom.')
  })

  useEffect(() => {
    function handlePointerUp() {
      if (!isDraggingRef.current) {
        return
      }
      isDraggingRef.current = false
      finalizeSelection()
    }

    window.addEventListener('pointerup', handlePointerUp)
    return () => window.removeEventListener('pointerup', handlePointerUp)
  }, [])

  function resolvePointerPosition(clientX: number, clientY: number): Position | null {
    const boardElement = boardRef.current
    if (!boardElement) {
      return null
    }

    const target = document.elementFromPoint(clientX, clientY)
    const tile = target?.closest<HTMLButtonElement>('[data-row][data-col]')
    if (!tile || !boardElement.contains(tile) || tile.disabled) {
      return null
    }

    const rect = tile.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const snapRadius = Math.min(rect.width, rect.height) * TILE_SNAP_RATIO
    const distance = Math.hypot(clientX - centerX, clientY - centerY)

    if (distance > snapRadius) {
      return null
    }

    return {
      row: Number(tile.dataset.row),
      col: Number(tile.dataset.col),
    }
  }

  function handleBoardPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current || activePointerIdRef.current !== event.pointerId) {
      return
    }

    const position = resolvePointerPosition(event.clientX, event.clientY)
    if (position) {
      extendSelection(position)
    }
  }

  function handleTilePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    position: Position,
  ) {
    activePointerIdRef.current = event.pointerId
    event.currentTarget.setPointerCapture?.(event.pointerId)
    startSelection(position)
  }

  function setTileBlockRef(tileId: string, node: HTMLSpanElement | null) {
    if (node) {
      tileBlockRefs.current.set(tileId, node)
      return
    }

    tileBlockRefs.current.delete(tileId)
  }

  return (
    <main
      className="shell"
      style={
        {
          '--tile-clear-duration': `${TILE_CLEAR_ANIMATION_MS}ms`,
          '--float-word-duration': `${FLOAT_WORD_DURATION_MS}ms`,
          '--float-score-duration': `${FLOAT_SCORE_DURATION_MS}ms`,
          '--score-pulse-duration': `${SCORE_PULSE_DURATION_MS}ms`,
          '--fall-land-bounce': `${FALL_LAND_BOUNCE_PX}px`,
        } as CSSProperties
      }
    >
      <section className="app">
        <header className="app__header">
          <h1>Letterquake</h1>
          <div className="app__actions">
            <button
              aria-label={`Shuffle board for -${SHUFFLE_PENALTY}`}
              className="app__icon-button"
              onClick={requestShuffle}
              type="button"
            >
              <ShuffleIcon />
            </button>
            <button
              aria-label="Open help"
              className="app__icon-button"
              onClick={() => setHelpOpen(true)}
              type="button"
            >
              <HelpIcon />
            </button>
            <button
              aria-label="Restart run"
              className="app__icon-button"
              onClick={requestReset}
              type="button"
            >
              <RestartIcon />
            </button>
          </div>
        </header>

        <section className="status-strip" aria-label="game stats">
          <div className="status-strip__group">
            <span className="status-strip__label">Score</span>
            <strong
              className={
                visibleClearStep
                  ? 'status-strip__value status-strip__value--pulse status-strip__value--hit'
                  : 'status-strip__value'
              }
            >
              {game.score}
            </strong>
            <span
              className={
                game.lastScoreDelta !== 0
                  ? 'status-strip__delta status-strip__delta--active'
                  : 'status-strip__delta'
              }
            >
              {game.lastScoreDelta > 0
                ? `+${game.lastScoreDelta}`
                : game.lastScoreDelta < 0
                  ? `${game.lastScoreDelta}`
                  : '+0'}
            </span>
          </div>
          <div className="status-strip__divider" />
          <div className="status-strip__group status-strip__group--compact">
            <span className="status-strip__label">Cleared</span>
            <strong className="status-strip__value">{game.totalWordsCleared}</strong>
          </div>
        </section>

        {helpOpen ? (
          <div
            aria-modal="true"
            className="help-overlay"
            role="dialog"
            onClick={() => setHelpOpen(false)}
          >
            <section className="help-card" onClick={(event) => event.stopPropagation()}>
              <div className="help-card__header">
                <h2>How To Play</h2>
                <button
                  aria-label="Close help"
                  className="help-card__close"
                  onClick={() => setHelpOpen(false)}
                  type="button"
                >
                  ×
                </button>
              </div>
              <ul className="help-card__list">
                <li>Drag through adjacent letters to spell a word.</li>
                <li>Valid words explode and score points.</li>
                <li>Blocks above fall down and new ones refill from the top.</li>
                <li>Gravity can trigger bonus cascade clears automatically.</li>
                {STARTER_TILE_KINDS.map((kind) => {
                  const definition = getTileDefinition(kind)
                  return (
                    <li key={kind}>
                      {definition.label}: {definition.description}
                    </li>
                  )
                })}
                <li>Shuffle rescues a bad board for {SHUFFLE_PENALTY} points.</li>
              </ul>
            </section>
          </div>
        ) : null}

        {confirmAction ? (
          <div
            aria-modal="true"
            className="help-overlay"
            role="dialog"
            onClick={closeConfirmDialog}
          >
            <section
              aria-label={
                confirmAction === 'shuffle' ? 'Confirm shuffle' : 'Confirm restart'
              }
              className="help-card confirm-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="help-card__header">
                <h2>{confirmAction === 'shuffle' ? 'Shuffle Board?' : 'Restart Run?'}</h2>
                <button
                  aria-label="Close confirmation"
                  className="help-card__close"
                  onClick={closeConfirmDialog}
                  type="button"
                >
                  ×
                </button>
              </div>
              <p className="confirm-card__body">
                {confirmAction === 'shuffle'
                  ? `This will reshuffle the board and cost ${SHUFFLE_PENALTY} points.`
                  : 'This will discard the current board and start a fresh run.'}
              </p>
              <div className="confirm-card__actions">
                <button
                  className="confirm-card__button confirm-card__button--ghost"
                  onClick={closeConfirmDialog}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="confirm-card__button confirm-card__button--danger"
                  onClick={confirmPendingAction}
                  type="button"
                >
                  {confirmAction === 'shuffle' ? 'Shuffle' : 'Restart'}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        <section className={`board-panel${clearImpactActive ? ' board-panel--impact' : ''}`}>
          <div
            className={`event-banner${activeStep ? ` event-banner--${activeStep.phase}` : ''}${isAutoClearVisible ? ' event-banner--auto' : ''}${visibleClearStep ? ' event-banner--pulse' : ''}`}
          >
            <p className="event-banner__text">{runtimeStatusMessage}</p>
          </div>

          <div
            aria-live="polite"
            className={boardClassName}
            data-testid="board"
            onPointerMove={handleBoardPointerMove}
            ref={boardRef}
          >
            <svg
              aria-hidden="true"
              className="board__overlay"
              data-testid="board-overlay"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <defs>
              </defs>
              {overlaySegments.map((segment) => {
                const arrowPath = 'M -1.3 -0.9 L 0 0 L -1.3 0.9'

                return (
                  <g key={segment.key}>
                    <line
                      className={
                        segment.variant === 'event'
                          ? 'board__segment-outline board__segment-outline--event'
                          : 'board__segment-outline'
                      }
                      style={
                        segment.variant === 'event'
                          ? ({ '--segment-delay': `${segment.delayMs}ms` } as CSSProperties)
                          : undefined
                      }
                      x1={segment.x1}
                      x2={segment.x2}
                      y1={segment.y1}
                      y2={segment.y2}
                    />
                    <line
                      className={`board__segment board__segment--${segment.variant}`}
                      data-testid={`overlay-${segment.variant}`}
                      style={
                        segment.variant === 'event'
                          ? ({ '--segment-delay': `${segment.delayMs}ms` } as CSSProperties)
                          : undefined
                      }
                      x1={segment.x1}
                      x2={segment.x2}
                      y1={segment.y1}
                      y2={segment.y2}
                    />
                    <path
                      className={
                        segment.variant === 'event'
                          ? 'board__arrow-outline board__arrow-outline--event'
                          : 'board__arrow-outline'
                      }
                      d={arrowPath}
                      style={
                        segment.variant === 'event'
                          ? ({ '--segment-delay': `${segment.delayMs}ms` } as CSSProperties)
                          : undefined
                      }
                      transform={`translate(${segment.midX} ${segment.midY}) rotate(${segment.angle})`}
                    />
                    <path
                      className={`board__arrow board__arrow--${segment.variant}`}
                      d={arrowPath}
                      style={
                        segment.variant === 'event'
                          ? ({ '--segment-delay': `${segment.delayMs}ms` } as CSSProperties)
                          : undefined
                      }
                      transform={`translate(${segment.midX} ${segment.midY}) rotate(${segment.angle})`}
                    />
                  </g>
                )
              })}
            </svg>
            {floatingLabels.map((label) => (
              <div
                className={`board__float board__float--${label.variant}`}
                key={label.key}
                style={
                  {
                    left: `${label.x}%`,
                    top: `${label.y}%`,
                    '--float-delay': `${label.delayMs}ms`,
                    '--float-drift-x': `${label.driftX}px`,
                  } as CSSProperties
                }
              >
                {label.text}
              </div>
            ))}
            {displayBoard.map((row, rowIndex) =>
              row.map((tile, colIndex) => {
                const position = { row: rowIndex, col: colIndex }
                const positionKey = hashPosition(position)
                const stateClasses = [
                  'tile',
                  !tile ? 'tile--empty' : '',
                  tile && highlightedPositions.spawned.has(positionKey)
                    ? 'tile--spawning-slot'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                const blockClasses = [
                  'tile__block',
                  tile ? getTileDefinition(tile.kind).uiClassName : '',
                  highlightedPositions.selected.has(positionKey)
                    ? 'tile__block--selected'
                    : '',
                  highlightedPositions.invalid.has(positionKey)
                    ? 'tile__block--invalid'
                    : '',
                  highlightedPositions.matched.has(positionKey)
                    ? 'tile__block--matched'
                    : '',
                  highlightedPositions.cleared.has(positionKey)
                    ? 'tile__block--clearing'
                    : '',
                  highlightedPositions.retained.has(positionKey)
                    ? 'tile__block--retained'
                    : '',
                  highlightedPositions.cleared.has(positionKey) && isAutoClearVisible
                    ? 'tile__block--clearing-auto'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                const clearDelay = clearDelayMap.get(positionKey) ?? 0
                const tileStyle = highlightedPositions.cleared.has(positionKey)
                  ? ({ '--clear-delay': `${clearDelay}ms` } as CSSProperties)
                  : undefined

                return (
                  <button
                    aria-label={`tile ${rowIndex + 1}-${colIndex + 1} ${tile?.letter ?? 'empty'}${tile ? ` ${getTileDefinition(tile.kind).label.toLowerCase()}` : ''}`}
                    className={stateClasses}
                    data-col={colIndex}
                    data-row={rowIndex}
                    data-testid={`tile-${rowIndex}-${colIndex}`}
                    disabled={inputLocked || !tile}
                    key={tile?.id ?? `empty-${rowIndex}-${colIndex}`}
                    onPointerDown={(event) => handleTilePointerDown(event, position)}
                    style={tileStyle}
                    type="button"
                  >
                    {tile ? (
                      <span
                        className={blockClasses}
                        ref={(node) => setTileBlockRef(tile.id, node)}
                        style={tileStyle}
                      >
                        {highlightedPositions.selected.has(positionKey) ? (
                          <span className="tile__order">
                            {selectedOrderMap.get(positionKey)}
                          </span>
                        ) : null}
                        {renderTileIdentity(tile)}
                        <span className="tile__glyph">{tile.letter}</span>
                      </span>
                    ) : null}
                  </button>
                )
              }),
            )}
          </div>

        </section>
      </section>
    </main>
  )
}

export default function App() {
  return <LexplosionApp />
}
