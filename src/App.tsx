import {
  type PointerEvent as ReactPointerEvent,
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'
import { SHUFFLE_PENALTY, STEP_DURATIONS } from './game/constants'
import { createGame, positionsToWord, shuffleGame, submitSelection } from './game/engine'
import type {
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
const INVALID_FLASH_MS = 360

function formatCombo(combo: number): string {
  return combo > 1 ? `${combo}x cascade` : combo === 1 ? 'Word hit' : 'Ready'
}

function hashPosition(position: Position): string {
  return `${position.row}:${position.col}`
}

export function LexplosionApp({
  initialGame,
  stepDurations,
}: LexplosionAppProps) {
  const [game, setGame] = useState<GameState>(() => initialGame ?? createGame())
  const [pendingTurn, setPendingTurn] = useState<TurnResult | null>(null)
  const [stepIndex, setStepIndex] = useState(-1)
  const [statusMessage, setStatusMessage] = useState(
    game.gameOver
      ? 'No words left on the board. Start a new run.'
      : 'Drag across adjacent letters to spell a word.',
  )
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

  useEffect(() => {
    if (!pendingTurn) {
      return
    }

    if (stepIndex >= pendingTurn.steps.length) {
      finishTurn(pendingTurn)
      return
    }

    const timeoutId = window.setTimeout(() => {
      setStepIndex((current) => current + 1)
    }, animationDurations[pendingTurn.steps[stepIndex].phase])

    return () => window.clearTimeout(timeoutId)
  }, [animationDurations, pendingTurn, stepIndex])

  const boardClassName = [
    'board',
    activeStep?.phase === 'clear' ? 'board--shake' : '',
    activeStep?.phase === 'pause-clear' ? 'board--aftershock' : '',
    activeStep?.phase === 'pause-refill' ? 'board--settled' : '',
    inputLocked ? 'board--locked' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const movePreview = useMemo(() => {
    const path = game.selectedPath
    if (path.length > 0) {
      return positionsToWord(game.board, path)
    }

    if (activeStep?.words[0]) {
      return activeStep.words[0].word
    }

    if (game.lastWords.length > 0) {
      return game.lastWords[0]
    }

    return 'Trace a connected word.'
  }, [activeStep, game.board, game.lastWords, game.selectedPath])

  const highlightedPositions = useMemo(() => {
    const selected = new Set(game.selectedPath.map(hashPosition))
    const invalid = new Set(invalidPath.map(hashPosition))
    const cleared = new Set(activeStep?.clearedPositions.map(hashPosition) ?? [])
    const moved = new Set(activeStep?.movedPositions.map(hashPosition) ?? [])
    const spawned = new Set(activeStep?.spawnedPositions.map(hashPosition) ?? [])

    return { selected, invalid, cleared, moved, spawned }
  }, [activeStep, game.selectedPath, invalidPath])

  useEffect(() => {
    return () => {
      if (invalidResetTimeoutRef.current !== null) {
        window.clearTimeout(invalidResetTimeoutRef.current)
      }
    }
  }, [])

  function resetGame() {
    const nextGame = createGame()
    dragPathRef.current = []
    isDraggingRef.current = false
    if (invalidResetTimeoutRef.current !== null) {
      window.clearTimeout(invalidResetTimeoutRef.current)
      invalidResetTimeoutRef.current = null
    }
    setInvalidPath([])
    setGame(nextGame)
    setPendingTurn(null)
    setStepIndex(-1)
    setStatusMessage('Fresh board. Drag to trace your first word.')
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
    <main className="shell">
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
            <strong>{game.score}</strong>
          </div>
          <div className="status-pill">
            <span>Turn</span>
            <strong>{game.turn}</strong>
          </div>
          <div className="status-pill">
            <span>Cleared</span>
            <strong>{game.totalWordsCleared}</strong>
          </div>
        </section>

        <section className="board-panel">
          <div className="board-panel__header">
            <p className="board-panel__status">{statusMessage}</p>
            <div className="combo-badge" data-phase={activeStep?.phase ?? 'idle'}>
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
            {displayBoard.map((row, rowIndex) =>
              row.map((tile, colIndex) => {
                const position = { row: rowIndex, col: colIndex }
                const positionKey = hashPosition(position)
                const stateClasses = [
                  'tile',
                  highlightedPositions.selected.has(positionKey) ? 'tile--selected' : '',
                  highlightedPositions.invalid.has(positionKey) ? 'tile--invalid' : '',
                  highlightedPositions.cleared.has(positionKey) ? 'tile--clearing' : '',
                  highlightedPositions.moved.has(positionKey) ? 'tile--falling' : '',
                  highlightedPositions.spawned.has(positionKey) ? 'tile--spawning' : '',
                ]
                  .filter(Boolean)
                  .join(' ')

                return (
                  <button
                    aria-label={`tile ${rowIndex + 1}-${colIndex + 1} ${tile?.letter ?? 'empty'}`}
                    className={stateClasses}
                    data-col={colIndex}
                    data-row={rowIndex}
                    data-testid={`tile-${rowIndex}-${colIndex}`}
                    disabled={inputLocked || !tile}
                    key={`${rowIndex}-${colIndex}`}
                    onPointerDown={(event) => handleTilePointerDown(event, position)}
                    type="button"
                  >
                    <span>{tile?.letter ?? ''}</span>
                  </button>
                )
              }),
            )}
          </div>

          <div className="board-panel__footer">
            <div>
              <p className="board-panel__label">Word</p>
              <p className="board-panel__words">{movePreview}</p>
            </div>
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
