import {
  type CSSProperties,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'
import { GameBoardHost } from './board/GameBoardHost'
import type {
  BoardRenderLabel,
  BoardRenderModel,
  BoardRenderMotion,
  BoardRenderSegment,
  BoardRenderTile,
} from './board/types'
import {
  CLEAR_PRE_HOLD_MS,
  CLEAR_BOARD_PERFECT_CLEAR_BONUS,
  CLEAR_BOARD_RESERVE_BONUS,
  CLEAR_WAVE_HOLD_MS,
  CLEAR_WAVE_STAGGER_MS,
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
import { breakTile, createGame, evaluateBoardState, shuffleGame, submitSelection } from './game/engine'
import { getTileDefinition, STARTER_TILE_KINDS } from './game/tileRegistry'
import type {
  BoardEvaluation,
  FoundWord,
  GameMode,
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

type ConfirmAction = 'shuffle' | 'reset'
type RescueMode = 'break' | null

const TILE_SNAP_RATIO = 0.45
const FALL_STAGGER_MS = 72
const FALL_COLUMN_STAGGER_MS = 56
const REFILL_STAGGER_MS = 88
const REFILL_COLUMN_STAGGER_MS = 64
const SCORE_TWEEN_MS = 720
const TITLE_MODE_HOLD_MS = 800

function easeOutCubic(progress: number) {
  return 1 - (1 - progress) ** 3
}

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

function BreakIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M14.4 3.8 20.2 9.6l-1.8 1.8-1.3-1.3-3.2 3.2 1.1 1.1-1.8 1.8-1.1-1.1-5.5 5.5a1.7 1.7 0 0 1-2.4-2.4l5.5-5.5-1.1-1.1 1.8-1.8 1.1 1.1 3.2-3.2-1.3-1.3 1.8-1.8Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function hashPosition(position: Position): string {
  return `${position.row}:${position.col}`
}

function createEmptyBoard(size: number) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null as GameState['board'][number][number]),
  )
}

function countRemainingTiles(board: GameState['board']) {
  return board.reduce(
    (total, row) => total + row.reduce((rowTotal, tile) => rowTotal + (tile ? 1 : 0), 0),
    0,
  )
}

function getClearBoardGrade(remainingTiles: number, won: boolean) {
  if (won) {
    return 'Epicenter'
  }
  if (remainingTiles <= 2) {
    return 'Aftershock'
  }
  if (remainingTiles <= 5) {
    return 'Faultline'
  }
  if (remainingTiles <= 8) {
    return 'Close Call'
  }
  return 'Buried'
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
        ? initialGame.won
          ? 'Board cleared.'
          : 'No words left on the board.'
        : 'Drag across adjacent letters to spell a word.',
    }
  }

  const nextGame = createGame({ mode: 'clear-board' })
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
  const [rescueMode, setRescueMode] = useState<RescueMode>(null)
  const dragPathRef = useRef<Position[]>([])
  const invalidResetTimeoutRef = useRef<number | null>(null)
  const titleHoldTimeoutRef = useRef<number | null>(null)
  const [invalidPath, setInvalidPath] = useState<Position[]>([])
  const [displayedScore, setDisplayedScore] = useState(initialState.game.score)
  const displayedScoreRef = useRef(initialState.game.score)
  const [displayedScoreDelta, setDisplayedScoreDelta] = useState(initialState.game.lastScoreDelta)
  const displayedScoreDeltaRef = useRef(initialState.game.lastScoreDelta)
  const scoreAnimationFrameRef = useRef<number | null>(null)
  const scoreAnimationRef = useRef({
    from: initialState.game.score,
    to: initialState.game.score,
    startedAt: 0,
  })
  const scoreDeltaAnimationFrameRef = useRef<number | null>(null)
  const scoreDeltaAnimationRef = useRef({
    from: initialState.game.lastScoreDelta,
    to: initialState.game.lastScoreDelta,
    startedAt: 0,
  })
  const remainingTiles = useMemo(() => countRemainingTiles(game.board), [game.board])
  const clearBoardGrade = useMemo(
    () => getClearBoardGrade(remainingTiles, game.won),
    [game.won, remainingTiles],
  )

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
  const boardEvaluation = useMemo<BoardEvaluation>(
    () => evaluateBoardState(displayBoard),
    [displayBoard],
  )
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
  const displayedScoreTarget = useMemo(() => {
    if (!pendingTurn) {
      return game.score
    }

    const settledStepCount =
      stepIndex < 0 ? 0 : Math.min(stepIndex + 1, pendingTurn.steps.length)
    const queuedDelta = pendingTurn.steps
      .slice(0, settledStepCount)
      .reduce((sum, step) => sum + step.scoreDelta, 0)

    return game.score + queuedDelta
  }, [game.score, pendingTurn, stepIndex])
  const displayedScoreDeltaTarget = useMemo(() => {
    if (!pendingTurn) {
      return game.lastScoreDelta
    }

    const settledStepCount =
      stepIndex < 0 ? 0 : Math.min(stepIndex + 1, pendingTurn.steps.length)
    return pendingTurn.steps
      .slice(0, settledStepCount)
      .reduce((sum, step) => sum + step.scoreDelta, 0)
  }, [game.lastScoreDelta, pendingTurn, stepIndex])

  const finishTurn = useEffectEvent((turn: TurnResult) => {
    setGame(turn.nextState)
    setPendingTurn(null)
    setStepIndex(-1)
    setStatusMessage(
      turn.nextState.gameOver
        ? turn.nextState.won
          ? 'Board cleared.'
          : 'Board exhausted. No valid words remain.'
        : turn.nextState.lastWords.length > 0
          ? `Cleared ${turn.nextState.lastWords[0]} for +${turn.nextState.lastScoreDelta}.`
          : 'Drag across adjacent letters to spell a word.',
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
    const motion = new Map<string, BoardRenderMotion>()

    if (activeStep?.phase !== 'gravity' || !previousStep?.board) {
      return motion
    }

    const previousPositions = buildTilePositionMap(previousStep.board)

    const movedByColumn = new Map<number, Position[]>()

    activeStep.movedPositions.forEach((position) => {
      const existing = movedByColumn.get(position.col)
      if (existing) {
        existing.push(position)
      } else {
        movedByColumn.set(position.col, [position])
      }
    })

    movedByColumn.forEach((positions, col) => {
      positions
        .slice()
        .sort((left, right) => right.row - left.row)
        .forEach((position, orderIndex) => {
          const tile = activeStep.board[position.row]?.[position.col]
          if (!tile) {
            return
          }

          const previousPosition = previousPositions.get(tile.id)
          if (!previousPosition) {
            return
          }

          const rowsMoved = Math.max(1, position.row - previousPosition.row)
          motion.set(tile.id, {
            kind: 'fall',
            fromRow: previousPosition.row,
            fromCol: previousPosition.col,
            delayMs:
              (rowsMoved - 1) * FALL_DELAY_PER_ROW_MS +
              col * FALL_COLUMN_SWEEP_MS +
              col * FALL_COLUMN_STAGGER_MS +
              orderIndex * FALL_STAGGER_MS,
            durationMs: FALL_BASE_DURATION_MS + (rowsMoved - 1) * FALL_DURATION_PER_ROW_MS,
          })
        })
    })

    return motion
  }, [activeStep, previousStep])
  const clearImpactActive = activeStep?.phase === 'clear'
  const clearImpactPosition =
    clearImpactActive &&
    visibleClearStep &&
    visibleClearStep.words.length === 0 &&
    visibleClearStep.clearedPositions.length === 1
      ? visibleClearStep.clearedPositions[0]
      : null
  const spawnMotionMap = useMemo(() => {
    const motion = new Map<string, BoardRenderMotion>()

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
        .sort((left, right) => right.row - left.row)
        .forEach((position, spawnIndex) => {
          const tile = activeStep.board[position.row]?.[position.col]
          if (!tile) {
            return
          }
          const rowsMoved = position.row + 1
          motion.set(tile.id, {
            kind: 'spawn',
            fromRow: position.row - rowsMoved,
            fromCol: position.col,
            delayMs:
              spawnIndex * SPAWN_DELAY_PER_ROW_MS +
              col * SPAWN_COLUMN_SWEEP_MS +
              col * REFILL_COLUMN_STAGGER_MS +
              spawnIndex * REFILL_STAGGER_MS,
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
        : step.phase === 'highlight'
          ? baseDuration
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
    displayedScoreRef.current = displayedScore
  }, [displayedScore])

  useEffect(() => {
    displayedScoreDeltaRef.current = displayedScoreDelta
  }, [displayedScoreDelta])

  useEffect(() => {
    if (scoreAnimationFrameRef.current !== null) {
      cancelAnimationFrame(scoreAnimationFrameRef.current)
      scoreAnimationFrameRef.current = null
    }

    const from = displayedScoreRef.current
    const to = displayedScoreTarget
    if (from === to) {
      return
    }

    scoreAnimationRef.current = {
      from,
      to,
      startedAt: performance.now(),
    }

    const tick = (now: number) => {
      const { from: start, to: target, startedAt } = scoreAnimationRef.current
      const progress = Math.min(1, (now - startedAt) / SCORE_TWEEN_MS)
      const eased = easeOutCubic(progress)
      const nextValue = Math.round(start + (target - start) * eased)
      setDisplayedScore(nextValue)

      if (progress < 1) {
        scoreAnimationFrameRef.current = requestAnimationFrame(tick)
      } else {
        scoreAnimationFrameRef.current = null
      }
    }

    scoreAnimationFrameRef.current = requestAnimationFrame(tick)

    return () => {
      if (scoreAnimationFrameRef.current !== null) {
        cancelAnimationFrame(scoreAnimationFrameRef.current)
        scoreAnimationFrameRef.current = null
      }
    }
  }, [displayedScoreTarget])

  useEffect(() => {
    if (scoreDeltaAnimationFrameRef.current !== null) {
      cancelAnimationFrame(scoreDeltaAnimationFrameRef.current)
      scoreDeltaAnimationFrameRef.current = null
    }

    const from = displayedScoreDeltaRef.current
    const to = displayedScoreDeltaTarget
    if (from === to) {
      return
    }

    scoreDeltaAnimationRef.current = {
      from,
      to,
      startedAt: performance.now(),
    }

    const tick = (now: number) => {
      const { from: start, to: target, startedAt } = scoreDeltaAnimationRef.current
      const progress = Math.min(1, (now - startedAt) / SCORE_TWEEN_MS)
      const eased = easeOutCubic(progress)
      const nextValue = Math.round(start + (target - start) * eased)
      setDisplayedScoreDelta(nextValue)

      if (progress < 1) {
        scoreDeltaAnimationFrameRef.current = requestAnimationFrame(tick)
      } else {
        scoreDeltaAnimationFrameRef.current = null
      }
    }

    scoreDeltaAnimationFrameRef.current = requestAnimationFrame(tick)

    return () => {
      if (scoreDeltaAnimationFrameRef.current !== null) {
        cancelAnimationFrame(scoreDeltaAnimationFrameRef.current)
        scoreDeltaAnimationFrameRef.current = null
      }
    }
  }, [displayedScoreDeltaTarget])

  useEffect(() => {
    return () => {
      if (invalidResetTimeoutRef.current !== null) {
        window.clearTimeout(invalidResetTimeoutRef.current)
      }
      if (scoreAnimationFrameRef.current !== null) {
        cancelAnimationFrame(scoreAnimationFrameRef.current)
      }
      if (scoreDeltaAnimationFrameRef.current !== null) {
        cancelAnimationFrame(scoreDeltaAnimationFrameRef.current)
      }
      if (titleHoldTimeoutRef.current !== null) {
        window.clearTimeout(titleHoldTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (pendingTurn) {
      return
    }
    setDisplayedScore(displayedScoreTarget)
    displayedScoreRef.current = displayedScoreTarget
    setDisplayedScoreDelta(displayedScoreDeltaTarget)
    displayedScoreDeltaRef.current = displayedScoreDeltaTarget
  }, [displayedScoreDeltaTarget, displayedScoreTarget, pendingTurn])

  useEffect(() => {
    setDisplayedScore(initialState.game.score)
    displayedScoreRef.current = initialState.game.score
    setDisplayedScoreDelta(initialState.game.lastScoreDelta)
    displayedScoreDeltaRef.current = initialState.game.lastScoreDelta
  }, [initialState.game.lastScoreDelta, initialState.game.score])

  const boardSegments = useMemo(() => {
    function buildSegments(
      positionsGroups: Position[][],
      variant: BoardRenderSegment['variant'],
    ) {
      const segments: BoardRenderSegment[] = []

      positionsGroups.forEach((positions, groupIndex) => {
        for (let index = 0; index < positions.length - 1; index += 1) {
          segments.push({
            key: `${variant}-${groupIndex}-${index}`,
            from: positions[index],
            to: positions[index + 1],
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

  const floatingLabels = useMemo<BoardRenderLabel[]>(() => {
    const labels: BoardRenderLabel[] = []
    const systemMessage =
      statusMessage.startsWith('Board shuffled for -') ? statusMessage : null

    const centerX = (displayBoard[0]?.length ?? 1) / 2 - 0.5
    const centerY = displayBoard.length * 0.56 - 0.5
    if (displayedClearWordDetails.length > 0 && visibleClearStep) {
      const queueStepMs = 480
      const wordText =
        displayedClearWordDetails.length === 1
          ? displayedClearWordDetails[0].word
          : displayedClearWordDetails.length === 2
            ? `${displayedClearWordDetails[0].word} · ${displayedClearWordDetails[1].word}`
            : `${displayedClearWordDetails[0].word} +${displayedClearWordDetails.length - 1}`
      const wordLabels: BoardRenderLabel[] = [
        {
          key: `word-${visibleClearStep.combo}-${displayedClearWordDetails.map((word) => word.word).join('-')}`,
          x: centerX,
          y: centerY,
          text: wordText,
          variant: visibleClearStep.combo > 1 ? 'auto-word' : 'word',
          delayMs: 0,
          driftX: 0,
        },
      ]
      const comboDelay = queueStepMs
      const scoreDelay = comboDelay + (visibleClearStep.combo > 1 ? queueStepMs : 0)

      labels.push(
        ...wordLabels,
        ...(visibleClearStep.combo > 1
          ? [
              {
                key: `combo-${visibleClearStep.combo}-${visibleClearStep.scoreDelta}`,
                x: centerX,
                y: centerY,
                text: `Combo x${visibleClearStep.combo}`,
                variant: 'combo' as const,
                delayMs: comboDelay,
                driftX: 0,
              },
            ]
          : []),
        {
          key: `score-${visibleClearStep.combo}-${visibleClearStep.scoreDelta}`,
          x: centerX,
          y: centerY,
          text: `+${visibleClearStep.scoreDelta}`,
          variant: visibleClearStep.combo > 1 ? 'auto-score' : 'score',
          delayMs: Math.max(FLOAT_SCORE_DELAY_MS, scoreDelay),
          driftX: 0,
        },
      )
    } else if (!pendingTurn && systemMessage && !game.gameOver) {
      labels.push({
        key: `system-${systemMessage}`,
        x: centerX,
        y: centerY,
        text: systemMessage,
        variant: 'system',
        delayMs: 0,
        driftX: 0,
      })
    }

    return labels
  }, [displayBoard, displayedClearWordDetails, game.gameOver, pendingTurn, statusMessage, visibleClearStep])
  const boardTiles = useMemo<BoardRenderTile[]>(() => {
    const tiles: BoardRenderTile[] = []

    displayBoard.forEach((row, rowIndex) => {
      row.forEach((tile, colIndex) => {
        if (!tile) {
          return
        }

        const positionKey = hashPosition({ row: rowIndex, col: colIndex })
        tiles.push({
          id: tile.id,
          row: rowIndex,
          col: colIndex,
          letter: tile.letter,
          kind: tile.kind,
          durability: tile.state?.durability,
          selected: highlightedPositions.selected.has(positionKey),
          invalid: highlightedPositions.invalid.has(positionKey),
          matched: highlightedPositions.matched.has(positionKey),
          cleared: highlightedPositions.cleared.has(positionKey),
          retained: highlightedPositions.retained.has(positionKey),
          spawned: highlightedPositions.spawned.has(positionKey),
          selectedOrder: selectedOrderMap.get(positionKey),
          clearDelayMs: clearDelayMap.get(positionKey) ?? 0,
          motion: fallMotionMap.get(tile.id) ?? spawnMotionMap.get(tile.id),
        })
      })
    })

    return tiles
  }, [
    clearDelayMap,
    displayBoard,
    fallMotionMap,
    highlightedPositions.cleared,
    highlightedPositions.invalid,
    highlightedPositions.matched,
    highlightedPositions.retained,
    highlightedPositions.selected,
    highlightedPositions.spawned,
    selectedOrderMap,
    spawnMotionMap,
  ])
  const boardModel = useMemo<BoardRenderModel>(
    () => ({
      rows: displayBoard.length,
      cols: displayBoard[0]?.length ?? 1,
      phase: activeStep?.phase ?? 'idle',
      clearCombo: visibleClearStep?.combo ?? 0,
      inputLocked,
      clearImpactActive,
      impactPosition: clearImpactPosition,
      settled: activeStep?.phase === 'pause-refill',
      tiles: boardTiles,
      segments: boardSegments,
      labels: floatingLabels,
    }),
    [
      activeStep?.phase,
      boardSegments,
      boardTiles,
      clearImpactActive,
      clearImpactPosition,
      displayBoard,
      floatingLabels,
      inputLocked,
      visibleClearStep?.combo,
    ],
  )

  function resetGame() {
    resetGameToMode(game.mode)
  }

  function resetGameToMode(mode: GameMode) {
    const nextGame = createGame({ mode })
    dragPathRef.current = []
    if (invalidResetTimeoutRef.current !== null) {
      window.clearTimeout(invalidResetTimeoutRef.current)
      invalidResetTimeoutRef.current = null
    }
    setInvalidPath([])
    setRescueMode(null)
    setGame({ ...nextGame, board: createEmptyBoard(nextGame.board.length) })
    setPendingTurn(buildIntroTurn(nextGame))
    setStepIndex(0)
    setStatusMessage('Board filling in.')
  }

  function switchMode() {
    resetGameToMode(game.mode === 'clear-board' ? 'endless' : 'clear-board')
  }

  function clearTitleHold() {
    if (titleHoldTimeoutRef.current !== null) {
      window.clearTimeout(titleHoldTimeoutRef.current)
      titleHoldTimeoutRef.current = null
    }
  }

  function startTitleHold() {
    clearTitleHold()
    titleHoldTimeoutRef.current = window.setTimeout(() => {
      switchMode()
      clearTitleHold()
    }, TITLE_MODE_HOLD_MS)
  }

  function stopTitleHold() {
    clearTitleHold()
  }

  function toggleBreakMode() {
    if (inputLocked || game.mode !== 'clear-board' || game.shuffleCharges <= 0 || game.gameOver) {
      return
    }
    setRescueMode((current) => (current === 'break' ? null : 'break'))
  }

  function handleShuffle() {
    if (inputLocked) {
      return
    }

    const nextGame = shuffleGame(game)
    if (nextGame === game) {
      return
    }
    dragPathRef.current = []
    setInvalidPath([])
    setPendingTurn(null)
    setStepIndex(-1)
    setRescueMode(null)
    setGame(nextGame)
    setStatusMessage(
      game.mode === 'clear-board'
        ? `Rescue shuffle used. ${nextGame.shuffleCharges} left.`
        : `Board shuffled for -${SHUFFLE_PENALTY}.`,
    )
  }

  function requestShuffle() {
    if (inputLocked || (game.mode === 'clear-board' && game.shuffleCharges <= 0)) {
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

    if (rescueMode === 'break' && game.mode === 'clear-board') {
      const turn = breakTile(game, position)
      if (turn.valid) {
        setGame((current) => ({
          ...current,
          selectedPath: [],
          turnStatus: 'resolving',
          animationQueue: turn.steps,
        }))
        dragPathRef.current = []
        setPendingTurn(turn)
        setStepIndex(0)
        setStatusMessage(`Fault opened. ${turn.nextState.shuffleCharges} rescues left.`)
      }
      setRescueMode(null)
      return
    }

    setSelectedPath([position])
    setStatusMessage('Keep dragging through adjacent letters.')
  }

  function extendSelection(position: Position) {
    if (inputLocked || game.gameOver) {
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
          <button
            aria-label="letterquake"
            className="app__title-button"
            onPointerCancel={stopTitleHold}
            onPointerDown={startTitleHold}
            onPointerLeave={stopTitleHold}
            onPointerUp={stopTitleHold}
            type="button"
          >
            <h1>letterquake</h1>
          </button>
          <div className="app__actions">
            <button
              aria-label={
                rescueMode === 'break'
                  ? 'Cancel break rescue'
                  : `Use break rescue (${game.shuffleCharges} left)`
              }
              className={`app__icon-button${rescueMode === 'break' ? ' app__icon-button--active' : ''}`}
              disabled={game.mode !== 'clear-board' || game.shuffleCharges <= 0}
              onClick={toggleBreakMode}
              type="button"
            >
              <BreakIcon />
            </button>
            <button
              aria-label={
                game.mode === 'clear-board'
                  ? `Use rescue shuffle (${game.shuffleCharges} left)`
                  : `Shuffle board for -${SHUFFLE_PENALTY}`
              }
              className="app__icon-button"
              disabled={game.mode === 'clear-board' && game.shuffleCharges <= 0}
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
              {displayedScore}
            </strong>
            <span
              className={
                displayedScoreDelta !== 0
                  ? 'status-strip__delta status-strip__delta--active'
                  : 'status-strip__delta'
              }
            >
              {displayedScoreDelta > 0
                ? `+${displayedScoreDelta}`
                : displayedScoreDelta < 0
                  ? `${displayedScoreDelta}`
                  : '+0'}
            </span>
          </div>
          <div className="status-strip__divider" />
          <div className="status-strip__group status-strip__group--compact">
            <span className="status-strip__label">Cleared</span>
            <strong className="status-strip__value">{game.totalWordsCleared}</strong>
          </div>
          <div className="status-strip__divider" />
          <div className="status-strip__group status-strip__group--compact">
            <span className="status-strip__label">
              {game.mode === 'clear-board' ? 'Reserve' : 'Mode'}
            </span>
            <strong className="status-strip__value">
              {game.mode === 'clear-board' ? game.refillQueue.length : 'Endless'}
            </strong>
          </div>
          <div className="status-strip__divider" />
          <div className="status-strip__group status-strip__group--compact">
            <span className="status-strip__label">
              {game.mode === 'clear-board' ? 'Rescues' : 'Grade'}
            </span>
            <strong className="status-strip__value">
              {game.mode === 'clear-board' ? game.shuffleCharges : 'Arcade'}
            </strong>
          </div>
        </section>

        {game.mode === 'clear-board' && !game.gameOver ? (
          <section
            aria-label="run state"
            className={`run-state run-state--${boardEvaluation.danger}${rescueMode === 'break' ? ' run-state--targeting' : ''}`}
          >
            <strong className="run-state__title">
              {rescueMode === 'break'
                ? 'Break armed: tap a tile to shatter it.'
                : boardEvaluation.danger === 'critical'
                  ? 'Critical board'
                  : boardEvaluation.danger === 'tense'
                    ? 'Tense board'
                    : 'Board stable'}
            </strong>
            <span className="run-state__meta">
              {boardEvaluation.playableWords} playable words
              {boardEvaluation.straightWords > 0 ? ` • ${boardEvaluation.straightWords} straight clears` : ''}
              {boardEvaluation.danger !== 'safe' ? ` • ${remainingTiles} tiles left` : ''}
            </span>
          </section>
        ) : null}

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
                <li>
                  {game.mode === 'clear-board'
                    ? 'Clear Board mode uses a planned finite reserve. Empty the board before the run dies.'
                    : 'Endless mode keeps refilling from the top so the run ends only when no valid words remain.'}
                </li>
                <li>Gravity can trigger bonus cascade clears automatically.</li>
                {STARTER_TILE_KINDS.map((kind) => {
                  const definition = getTileDefinition(kind)
                  return (
                    <li key={kind}>
                      {definition.label}: {definition.description}
                    </li>
                  )
                })}
                <li>
                  {game.mode === 'clear-board'
                    ? `You get ${game.shuffleCharges} rescue shuffle${game.shuffleCharges === 1 ? '' : 's'} left this run.`
                    : `Shuffle rescues a bad board for ${SHUFFLE_PENALTY} points.`}
                </li>
                {game.mode === 'clear-board' ? (
                  <li>Break rescue shatters one tile and lets gravity plus cascades resolve from the impact.</li>
                ) : null}
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
                  ? game.mode === 'clear-board'
                    ? `This will use 1 rescue shuffle and leave you with ${Math.max(0, game.shuffleCharges - 1)}.`
                    : `This will reshuffle the board and cost ${SHUFFLE_PENALTY} points.`
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

        {game.gameOver ? (
          <div aria-modal="true" className="help-overlay" role="dialog">
            <section
              aria-label="Run over"
              className={`help-card game-over-card${game.won ? ' game-over-card--win' : ''}`}
            >
              <div className="help-card__header">
                <h2>{game.won ? 'Board Cleared' : 'Run Over'}</h2>
              </div>
              <p className="game-over-card__body">
                {game.won
                  ? 'You cleared every tile before the reserve ran dry.'
                  : game.mode === 'clear-board'
                    ? 'No words remain and the board still has letters on it.'
                    : 'No valid words remain on the board.'}
              </p>
              <dl className="game-over-card__stats">
                <div className="game-over-card__stat">
                  <dt>Grade</dt>
                  <dd>{game.mode === 'clear-board' ? clearBoardGrade : 'Arcade'}</dd>
                </div>
                <div className="game-over-card__stat">
                  <dt>Score</dt>
                  <dd>{game.score}</dd>
                </div>
                <div className="game-over-card__stat">
                  <dt>Cleared</dt>
                  <dd>{game.totalWordsCleared}</dd>
                </div>
                <div className="game-over-card__stat">
                  <dt>Best Combo</dt>
                  <dd>x{game.highestCombo}</dd>
                </div>
                <div className="game-over-card__stat">
                  <dt>{game.mode === 'clear-board' ? 'Tiles Left' : 'Mode'}</dt>
                  <dd>
                    {game.mode === 'clear-board' ? remainingTiles : 'Endless'}
                  </dd>
                </div>
                <div className="game-over-card__stat">
                  <dt>{game.mode === 'clear-board' ? 'Reserve Left' : 'Final State'}</dt>
                  <dd>
                    {game.mode === 'clear-board' ? game.refillQueue.length : 'Dead Board'}
                  </dd>
                </div>
                <div className="game-over-card__stat">
                  <dt>{game.mode === 'clear-board' ? 'Rescues Left' : 'Final State'}</dt>
                  <dd>{game.mode === 'clear-board' ? game.shuffleCharges : 'Dead Board'}</dd>
                </div>
              </dl>
              {game.won && game.mode === 'clear-board' ? (
                <div className="game-over-card__bonus">
                  <strong>Perfect clear bonus</strong>
                  <span>
                    +{CLEAR_BOARD_PERFECT_CLEAR_BONUS} + reserve bonus {game.refillQueue.length} × {CLEAR_BOARD_RESERVE_BONUS}
                  </span>
                </div>
              ) : null}
              <div className="confirm-card__actions">
                {!game.won && game.mode === 'clear-board' && game.shuffleCharges > 0 ? (
                  <button className="confirm-card__button" onClick={handleShuffle} type="button">
                    Use Rescue
                  </button>
                ) : null}
                <button
                  className="confirm-card__button confirm-card__button--ghost"
                  onClick={switchMode}
                  type="button"
                >
                  Switch Mode
                </button>
                <button
                  className="confirm-card__button confirm-card__button--danger"
                  onClick={resetGame}
                  type="button"
                >
                  Play Again
                </button>
              </div>
            </section>
          </div>
        ) : null}

        <section className={`board-panel${clearImpactActive ? ' board-panel--impact' : ''}`}>
          <GameBoardHost
            inputLocked={inputLocked}
            model={boardModel}
            onExtendSelection={extendSelection}
            onFinalizeSelection={finalizeSelection}
            onStartSelection={startSelection}
            snapRatio={TILE_SNAP_RATIO}
          />
        </section>
      </section>
    </main>
  )
}

export default function App() {
  return <LexplosionApp />
}
