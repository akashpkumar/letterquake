import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LexplosionApp } from './App'
import type { BoardRenderModel } from './board/types'
import { createGame, makeBoardFromRows } from './game/engine'

const sceneMocks = vi.hoisted(() => ({
  sceneResize: vi.fn(),
  sceneSync: vi.fn(),
  sceneDestroy: vi.fn(),
  createBoardScene: vi.fn(
    async (_mountNode: HTMLDivElement, initialModel: BoardRenderModel) => {
      sceneMocks.sceneSync(initialModel)
      return {
        resize: sceneMocks.sceneResize,
        sync: sceneMocks.sceneSync,
        destroy: sceneMocks.sceneDestroy,
      }
    },
  ),
}))

vi.mock('./board/BoardScene', () => ({
  createBoardScene: sceneMocks.createBoardScene,
}))

function renderApp(boardRows: string[]) {
  const game = createGame({ seed: 7, board: makeBoardFromRows(boardRows) })
  return render(
    <LexplosionApp
      initialGame={game}
      stepDurations={{ clear: 1, 'pause-clear': 1, gravity: 1, 'pause-refill': 1, refill: 1 }}
    />,
  )
}

function installBoardGeometry() {
  const board = screen.getByTestId('board')
  const rect = {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 216,
    height: 216,
    right: 216,
    bottom: 216,
    toJSON: () => ({}),
  }

  Object.defineProperty(board, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect,
  })
}

function latestBoardModel() {
  const lastCall = sceneMocks.sceneSync.mock.calls.at(-1)
  if (!lastCall) {
    throw new Error('Board scene was never synced')
  }
  return lastCall[0] as BoardRenderModel
}

describe('LexplosionApp', () => {
  beforeEach(() => {
    sceneMocks.sceneResize.mockReset()
    sceneMocks.sceneSync.mockReset()
    sceneMocks.sceneDestroy.mockReset()
    sceneMocks.createBoardScene.mockClear()
  })

  it('supports drag selection on a mobile-sized viewport', async () => {
    vi.useFakeTimers()
    window.innerWidth = 390

    renderApp([
      'CATQZ',
      'RLMNV',
      'SPTUW',
      'ODGHI',
      'YJBCD',
    ])

    await act(async () => {})
    installBoardGeometry()

    fireEvent.pointerDown(screen.getByTestId('board'), {
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    })
    fireEvent.pointerMove(screen.getByTestId('board'), {
      pointerId: 1,
      clientX: 64,
      clientY: 20,
    })
    fireEvent.pointerMove(screen.getByTestId('board'), {
      pointerId: 1,
      clientX: 108,
      clientY: 20,
    })
    fireEvent.pointerUp(window)

    await act(async () => {})
    act(() => {
      vi.advanceTimersByTime(1)
    })
    await act(async () => {})

    expect(screen.getByText(/^Clear(?:ed|ing) CAT$/)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('disables board input while resolution animation is active', () => {
    vi.useFakeTimers()

    renderApp([
      'CATQZ',
      'RLMNV',
      'SPTUW',
      'ODGHI',
      'YJBCD',
    ])

    installBoardGeometry()

    fireEvent.pointerDown(screen.getByTestId('board'), {
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    })
    fireEvent.pointerMove(screen.getByTestId('board'), {
      pointerId: 1,
      clientX: 64,
      clientY: 20,
    })
    fireEvent.pointerMove(screen.getByTestId('board'), {
      pointerId: 1,
      clientX: 108,
      clientY: 20,
    })
    fireEvent.pointerUp(window)

    expect(screen.getByTestId('board')).toHaveClass('board--locked')

    act(() => {
      vi.runAllTimers()
    })
    vi.useRealTimers()
  })

  it('ignores pointer movement that does not reach the center of the next tile', async () => {
    renderApp([
      'CATQZ',
      'RLMNV',
      'SPTUW',
      'ODGHI',
      'YJBCD',
    ])

    await act(async () => {})
    installBoardGeometry()

    fireEvent.pointerDown(screen.getByTestId('board'), {
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    })
    fireEvent.pointerMove(screen.getByTestId('board'), {
      pointerId: 1,
      clientX: 49,
      clientY: 20,
    })

    await act(async () => {})
    expect(latestBoardModel().segments).toHaveLength(0)
  })

  it('updates the board model while dragging', async () => {
    renderApp([
      'CATQZ',
      'RLMNV',
      'SPTUW',
      'ODGHI',
      'YJBCD',
    ])

    await act(async () => {})
    installBoardGeometry()

    fireEvent.pointerDown(screen.getByTestId('board'), {
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    })
    fireEvent.pointerMove(screen.getByTestId('board'), {
      pointerId: 1,
      clientX: 64,
      clientY: 20,
    })

    await act(async () => {})
    let model = latestBoardModel()
    expect(model.segments).toHaveLength(1)
    expect(
      model.tiles
        .filter((tile: { selectedOrder?: number }) => tile.selectedOrder !== undefined)
        .map((tile: { selectedOrder?: number }) => tile.selectedOrder),
    ).toEqual([1, 2])

    fireEvent.pointerMove(screen.getByTestId('board'), {
      pointerId: 1,
      clientX: 108,
      clientY: 20,
    })

    await act(async () => {})
    model = latestBoardModel()
    expect(model.segments).toHaveLength(2)
    expect(
      model.tiles
        .filter((tile: { selectedOrder?: number }) => tile.selectedOrder !== undefined)
        .map((tile: { selectedOrder?: number }) => tile.selectedOrder),
    ).toEqual([1, 2, 3])
  })

  it('marks auto-clears distinctly', async () => {
    vi.useFakeTimers()

    renderApp([
      'ZZZQZ',
      'ZZZQZ',
      'DOGQZ',
      'CATQZ',
      'ZZZQZ',
    ])

    await act(async () => {})
    installBoardGeometry()

    fireEvent.pointerDown(screen.getByTestId('board'), {
      pointerId: 1,
      clientX: 20,
      clientY: 152,
    })
    fireEvent.pointerMove(screen.getByTestId('board'), {
      pointerId: 1,
      clientX: 64,
      clientY: 152,
    })
    fireEvent.pointerMove(screen.getByTestId('board'), {
      pointerId: 1,
      clientX: 108,
      clientY: 152,
    })
    fireEvent.pointerUp(window)

    for (let index = 0; index < 5; index += 1) {
      act(() => {
        vi.runOnlyPendingTimers()
      })
    }

    expect(screen.getByText(/Auto-cleared|Auto-clearing/i)).toBeInTheDocument()
    expect(document.querySelector('.event-banner--auto')).not.toBeNull()
    vi.useRealTimers()
  })

  it('renders score, cleared count, and game-over state', () => {
    renderApp([
      'QZXQZ',
      'ZXQZX',
      'XQZXQ',
      'QZXQZ',
      'ZXQZX',
    ])

    expect(screen.getByText('Score')).toBeInTheDocument()
    expect(screen.getByText('Cleared')).toBeInTheDocument()
    expect(screen.getByText(/No words left on the board/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restart run' })).toBeInTheDocument()
  })

  it('lets the player shuffle with a visible penalty', () => {
    renderApp([
      'CATQZ',
      'RLMNV',
      'SPTUW',
      'ODGHI',
      'YJBCD',
    ])

    fireEvent.click(screen.getByRole('button', { name: /Shuffle board for -75/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }))

    expect(screen.getByText('Board shuffled for -75.')).toBeInTheDocument()
  })

  it('can cancel the shuffle confirmation', () => {
    renderApp([
      'CATQZ',
      'RLMNV',
      'SPTUW',
      'ODGHI',
      'YJBCD',
    ])

    fireEvent.click(screen.getByRole('button', { name: /Shuffle board for -75/i }))

    expect(screen.getByText('Shuffle Board?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Shuffle Board?')).toBeNull()
    expect(screen.queryByText('Board shuffled for -75.')).toBeNull()
  })

  it('shows special tile rules in help and syncs special tile kinds to the board scene', async () => {
    const game = createGame({
      seed: 7,
      board: makeBoardFromRows(
        [
          'CATQZ',
          'RLMNV',
          'SPTUW',
          'ODGHI',
          'YJBCD',
        ],
        [
          { position: { row: 0, col: 0 }, kind: 'gold' },
          { position: { row: 0, col: 1 }, kind: 'cracked' },
          { position: { row: 0, col: 2 }, kind: 'anchor' },
        ],
      ),
    })

    render(
      <LexplosionApp
        initialGame={game}
        stepDurations={{ clear: 1, 'pause-clear': 1, gravity: 1, 'pause-refill': 1, refill: 1 }}
      />,
    )

    await act(async () => {})
    const model = latestBoardModel()
    expect(model.tiles.some((tile: { kind: string }) => tile.kind === 'gold')).toBe(true)
    expect(model.tiles.some((tile: { kind: string }) => tile.kind === 'cracked')).toBe(true)
    expect(model.tiles.some((tile: { kind: string }) => tile.kind === 'anchor')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Open help' }))

    expect(screen.getByText(/Gold: Adds bonus points/i)).toBeInTheDocument()
    expect(screen.getByText(/Cracked: Needs two valid word hits/i)).toBeInTheDocument()
    expect(screen.getByText(/Anchor: Stays fixed during gravity/i)).toBeInTheDocument()
  })
})
