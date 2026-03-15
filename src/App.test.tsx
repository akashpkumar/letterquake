import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LexplosionApp } from './App'
import { getBoardMetrics } from './board/layout'
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

  const metrics = getBoardMetrics(rect.width, rect.height, 5, 5)
  const centerOf = (row: number, col: number) => ({
    clientX: metrics.offsetX + col * metrics.pitchX + metrics.cellWidth / 2,
    clientY: metrics.offsetY + row * metrics.pitchY + metrics.cellHeight / 2,
  })
  const shortStepX = (ratio: number) => metrics.cellWidth * ratio

  return { board, centerOf, shortStepX }
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
    const { board, centerOf } = installBoardGeometry()

    fireEvent.pointerDown(board, {
      pointerId: 1,
      ...centerOf(0, 0),
    })
    fireEvent.pointerMove(board, {
      pointerId: 1,
      ...centerOf(0, 1),
    })
    fireEvent.pointerMove(board, {
      pointerId: 1,
      ...centerOf(0, 2),
    })
    fireEvent.pointerUp(window)

    act(() => {
      vi.runAllTimers()
    })
    await act(async () => {})

    expect(screen.getByTestId('board')).toHaveClass('board--locked')
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

    const { board, centerOf } = installBoardGeometry()

    fireEvent.pointerDown(board, {
      pointerId: 1,
      ...centerOf(0, 0),
    })
    fireEvent.pointerMove(board, {
      pointerId: 1,
      ...centerOf(0, 1),
    })
    fireEvent.pointerMove(board, {
      pointerId: 1,
      ...centerOf(0, 2),
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
    const { board, centerOf, shortStepX } = installBoardGeometry()

    fireEvent.pointerDown(board, {
      pointerId: 1,
      ...centerOf(0, 0),
    })
    fireEvent.pointerMove(board, {
      pointerId: 1,
      clientX: centerOf(0, 0).clientX + shortStepX(0.38),
      clientY: centerOf(0, 0).clientY,
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
    const { board, centerOf } = installBoardGeometry()

    fireEvent.pointerDown(board, {
      pointerId: 1,
      ...centerOf(0, 0),
    })
    fireEvent.pointerMove(board, {
      pointerId: 1,
      ...centerOf(0, 1),
    })

    await act(async () => {})
    let model = latestBoardModel()
    expect(model.segments).toHaveLength(1)
    expect(
      model.tiles
        .filter((tile: { selectedOrder?: number }) => tile.selectedOrder !== undefined)
        .map((tile: { selectedOrder?: number }) => tile.selectedOrder),
    ).toEqual([1, 2])

    fireEvent.pointerMove(board, {
      pointerId: 1,
      ...centerOf(0, 2),
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
    const { board, centerOf } = installBoardGeometry()

    fireEvent.pointerDown(board, {
      pointerId: 1,
      ...centerOf(3, 0),
    })
    fireEvent.pointerMove(board, {
      pointerId: 1,
      ...centerOf(3, 1),
    })
    fireEvent.pointerMove(board, {
      pointerId: 1,
      ...centerOf(3, 2),
    })
    fireEvent.pointerUp(window)

    for (let index = 0; index < 5; index += 1) {
      act(() => {
        vi.runOnlyPendingTimers()
      })
    }

    expect(
      latestBoardModel().labels.some((label: { variant: string; text: string }) =>
        label.variant === 'combo' && /Combo x/i.test(label.text),
      ),
    ).toBe(true)
    vi.useRealTimers()
  })

  it('defaults to clear-board mode and can switch to endless mode', async () => {
    render(
      <LexplosionApp
        stepDurations={{ clear: 1, 'pause-clear': 1, gravity: 1, 'pause-refill': 1, refill: 1 }}
      />,
    )

    await act(async () => {})

    expect(screen.getByRole('button', { name: 'Switch to endless mode' })).toHaveTextContent(
      'Clear Board',
    )
    expect(screen.getByText('Reserve')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Switch to endless mode' }))

    expect(screen.getByRole('button', { name: 'Switch to clear board mode' })).toHaveTextContent(
      'Endless',
    )
    expect(screen.getByText('Mode')).toBeInTheDocument()
  })

  it('renders score, cleared count, and game-over state', () => {
    renderApp([
      'QZXQZ',
      'ZXQZX',
      'XQZXQ',
      'QZXQZ',
      'ZXQZX',
    ])

    expect(screen.getByRole('region', { name: 'game stats' })).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Run over' })).toBeInTheDocument()
    expect(screen.getByText(/No valid words remain on the board/i)).toBeInTheDocument()
    expect(screen.getByText('Best Combo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restart run' })).toBeInTheDocument()
  })

  it('lets the player shuffle with a visible penalty', async () => {
    renderApp([
      'CATQZ',
      'RLMNV',
      'SPTUW',
      'ODGHI',
      'YJBCD',
    ])
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: /Shuffle board for -75/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }))

    expect(
      latestBoardModel().labels.some((label: { variant: string; text: string }) =>
        label.variant === 'system' && label.text === 'Board shuffled for -75.',
      ),
    ).toBe(true)
  })

  it('can cancel the shuffle confirmation', async () => {
    renderApp([
      'CATQZ',
      'RLMNV',
      'SPTUW',
      'ODGHI',
      'YJBCD',
    ])
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: /Shuffle board for -75/i }))

    expect(screen.getByText('Shuffle Board?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Shuffle Board?')).toBeNull()
    expect(
      latestBoardModel().labels.some((label: { text: string }) => label.text === 'Board shuffled for -75.'),
    ).toBe(false)
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
