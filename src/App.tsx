import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  startTransition,
  useEffect,
  useEffectEvent,
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
import type {
  FoundWord,
  GameState,
  Position,
  TurnPhase,
  TurnResult,
  TurnStep,
} from './game/types'

interface LexplosionAppProps {
  initialGame?: GameState
  stepDurations?: Partial<Record<TurnPhase, number>>
}

const TILE_SNAP_RATIO = 0.34

function formatCombo(combo: number): string {
  return combo > 1 ? `${combo}x cascade` : combo === 1 ? 'Word hit' : 'Ready'
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
}

function createEmptyBoard(size: number) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null as GameState['board'][number][number]),
  )
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
        clearedPositions: [],
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
  const dragPathRef = useRef<Position[]>([])
  const isDraggingRef = useRef(false)
  const activePointerIdRef = useRef<number | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
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
  const displayBoard = activeStep?.board ?? game.board
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
    startTransition(() => {
      setGame(turn.nextState)
      setPendingTurn(null)
      setStepIndex(-1)
      setStatusMessage(
        turn.nextState.gameOver
          ? 'Board exhausted. No valid words remain.'
          : `Cleared ${turn.nextState.lastWords[0]} for +${turn.nextState.lastScoreDelta}.`,
      )
    })
  })

  const highlightedPositions = useMemo(() => {
    const selected = new Set(game.selectedPath.map(hashPosition))
    const invalid = new Set(invalidPath.map(hashPosition))
    const cleared = new Set(activeStep?.clearedPositions.map(hashPosition) ?? [])
    const moved = new Set(activeStep?.movedPositions.map(hashPosition) ?? [])
    const spawned = new Set(activeStep?.spawnedPositions.map(hashPosition) ?? [])

    return { selected, invalid, cleared, moved, spawned }
  }, [activeStep, game.selectedPath, invalidPath])
  const selectedOrderMap = useMemo(() => {
    const order = new Map<string, number>()
    game.selectedPath.forEach((position, index) => {
      order.set(hashPosition(position), index + 1)
    })
    return order
  }, [game.selectedPath])
  const fallMotionMap = useMemo(() => {
    const motion = new Map<
      string,
      { rowsMoved: number; delayMs: number; durationMs: number }
    >()

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
  const boardClassName = [
    'board',
    activeStep?.phase === 'clear' ? 'board--shake' : '',
    activeStep?.phase === 'clear' && isAutoClearVisible ? 'board--auto-clear' : '',
    activeStep?.phase === 'pause-refill' ? 'board--settled' : '',
    inputLocked ? 'board--locked' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const spawnMotionMap = useMemo(() => {
    const motion = new Map<
      string,
      { rowsMoved: number; delayMs: number; durationMs: number }
    >()

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
          const rowsMoved = spawnIndex + 1
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
            <button className="app__action" onClick={handleShuffle} type="button">
              Shuffle -{SHUFFLE_PENALTY}
            </button>
            <button className="app__reset" onClick={resetGame} type="button">
              Restart run
            </button>
          </div>
        </header>

        <section className="status-bar" aria-label="game stats">
          <div className="status-pill">
            <span>Score</span>
            <strong
              className={
                visibleClearStep
                  ? 'status-pill__value--pulse status-pill__value--hit'
                  : ''
              }
            >
              {game.score}
            </strong>
          </div>
          <div className="status-pill status-pill--compact">
            <span>Turn</span>
            <strong>{game.turn}</strong>
          </div>
          <div className="status-pill status-pill--compact">
            <span>Cleared</span>
            <strong>{game.totalWordsCleared}</strong>
          </div>
        </section>

        <section className="board-panel">
          <div className="board-panel__header">
            <p className="board-panel__status">{runtimeStatusMessage}</p>
            <div
              className={`combo-badge${isAutoClearVisible ? ' combo-badge--auto' : ''}${visibleClearStep ? ' combo-badge--pulse' : ''}`}
              data-phase={activeStep?.phase ?? 'idle'}
            >
              {activeStep ? formatCombo(activeStep.combo) : formatCombo(game.combo)}
            </div>
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
                  highlightedPositions.selected.has(positionKey) ? 'tile--selected' : '',
                  highlightedPositions.invalid.has(positionKey) ? 'tile--invalid' : '',
                  highlightedPositions.cleared.has(positionKey) ? 'tile--clearing' : '',
                  highlightedPositions.cleared.has(positionKey) && isAutoClearVisible
                    ? 'tile--clearing-auto'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                const glyphClasses = [
                  'tile__content',
                  highlightedPositions.moved.has(positionKey) ? 'tile__glyph--falling' : '',
                  highlightedPositions.spawned.has(positionKey)
                    ? 'tile__glyph--spawning'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                const clearDelay = clearDelayMap.get(positionKey) ?? 0
                const fallMotion = fallMotionMap.get(positionKey)
                const spawnMotion = spawnMotionMap.get(positionKey)
                const tileStyle =
                  highlightedPositions.cleared.has(positionKey) ||
                  highlightedPositions.moved.has(positionKey) ||
                  highlightedPositions.spawned.has(positionKey)
                    ? ({
                        '--clear-delay': `${clearDelay}ms`,
                        '--fall-delay': `${fallMotion?.delayMs ?? 0}ms`,
                        '--fall-duration': `${fallMotion?.durationMs ?? FALL_BASE_DURATION_MS}ms`,
                        '--fall-distance-rows': `${fallMotion?.rowsMoved ?? 1}`,
                        '--spawn-delay': `${spawnMotion?.delayMs ?? 0}ms`,
                        '--spawn-duration': `${spawnMotion?.durationMs ?? SPAWN_BASE_DURATION_MS}ms`,
                        '--spawn-distance-rows': `${spawnMotion?.rowsMoved ?? 1}`,
                      } as CSSProperties)
                    : undefined

                return (
                  <button
                    aria-label={`tile ${rowIndex + 1}-${colIndex + 1} ${tile?.letter ?? 'empty'}`}
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
                    {highlightedPositions.selected.has(positionKey) ? (
                      <span className="tile__order">{selectedOrderMap.get(positionKey)}</span>
                    ) : null}
                    <span className={glyphClasses}>
                      <span className="tile__glyph">{tile?.letter ?? ''}</span>
                    </span>
                  </button>
                )
              }),
            )}
          </div>

          <div className="board-panel__footer">
            <div>
              <p className="board-panel__label">Last score</p>
              <p className="board-panel__seed">{game.lastScoreDelta}</p>
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}

export default function App() {
  return <LexplosionApp />
}
