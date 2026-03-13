import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LexplosionApp } from './App'
import { createGame, makeBoardFromRows } from './game/engine'

function renderApp(boardRows: string[]) {
  const game = createGame({ seed: 7, board: makeBoardFromRows(boardRows) })
  return render(
    <LexplosionApp
      initialGame={game}
      stepDurations={{ clear: 1, gravity: 1, refill: 1 }}
    />,
  )
}

function installBoardGeometry() {
  const tileSize = 40
  const gap = 4
  const originalElementFromPoint =
    document.elementFromPoint?.bind(document) ?? (() => null)

  const tiles = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-row][data-col]'))
  tiles.forEach((tile) => {
    const row = Number(tile.dataset.row)
    const col = Number(tile.dataset.col)
    const left = col * (tileSize + gap)
    const top = row * (tileSize + gap)
    const rect = {
      x: left,
      y: top,
      left,
      top,
      width: tileSize,
      height: tileSize,
      right: left + tileSize,
      bottom: top + tileSize,
      toJSON: () => ({}),
    }
    Object.defineProperty(tile, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect,
    })
  })

  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: (x: number, y: number) =>
      tiles.find((tile) => {
        const rect = tile.getBoundingClientRect()
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
      }) ?? originalElementFromPoint(x, y),
  })
}

describe('LexplosionApp', () => {
  it('supports drag selection on a mobile-sized viewport', async () => {
    vi.useFakeTimers()
    window.innerWidth = 390

    renderApp([
      'CATQZX',
      'RLMNVB',
      'SPTUWE',
      'ODGHIK',
      'YJBCDF',
      'EGHIRT',
    ])

    installBoardGeometry()

    fireEvent.pointerDown(screen.getByTestId('tile-0-0'), {
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

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(screen.getByText(/^Clear(?:ed|ing) CAT$/)).toBeInTheDocument()
    expect(screen.getAllByTestId('overlay-event')).toHaveLength(2)
    vi.useRealTimers()
  })

  it('disables board input while resolution animation is active', () => {
    vi.useFakeTimers()

    renderApp([
      'CATQZX',
      'RLMNVB',
      'SPTUWE',
      'ODGHIK',
      'YJBCDF',
      'EGHIRT',
    ])

    installBoardGeometry()

    fireEvent.pointerDown(screen.getByTestId('tile-0-0'), {
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

    expect(screen.getByTestId('tile-0-3')).toBeDisabled()

    act(() => {
      vi.runAllTimers()
    })
    vi.useRealTimers()
  })

  it('ignores pointer movement that does not reach the center of the next tile', () => {
    renderApp([
      'CATQZX',
      'RLMNVB',
      'SPTUWE',
      'ODGHIK',
      'YJBCDF',
      'EGHIRT',
    ])

    installBoardGeometry()

    fireEvent.pointerDown(screen.getByTestId('tile-0-0'), {
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    })
    fireEvent.pointerMove(screen.getByTestId('board'), {
      pointerId: 1,
      clientX: 49,
      clientY: 20,
    })

    expect(screen.queryAllByTestId('overlay-active')).toHaveLength(0)
  })

  it('draws path arrows while dragging', () => {
    renderApp([
      'CATQZX',
      'RLMNVB',
      'SPTUWE',
      'ODGHIK',
      'YJBCDF',
      'EGHIRT',
    ])

    installBoardGeometry()

    fireEvent.pointerDown(screen.getByTestId('tile-0-0'), {
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    })
    fireEvent.pointerMove(screen.getByTestId('board'), {
      pointerId: 1,
      clientX: 64,
      clientY: 20,
    })

    expect(screen.getAllByTestId('overlay-active')).toHaveLength(1)

    fireEvent.pointerMove(screen.getByTestId('board'), {
      pointerId: 1,
      clientX: 108,
      clientY: 20,
    })

    expect(screen.getAllByTestId('overlay-active')).toHaveLength(2)
  })

  it('renders score, cleared count, and game-over state', () => {
    renderApp([
      'QZXQZX',
      'ZXQZXQ',
      'XQZXQZ',
      'QZXQZX',
      'ZXQZXQ',
      'XQZXQZ',
    ])

    expect(screen.getByText('Score')).toBeInTheDocument()
    expect(screen.getByText('Cleared')).toBeInTheDocument()
    expect(screen.getByText(/No words left on the board/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restart run' })).toBeInTheDocument()
  })

  it('lets the player shuffle with a visible penalty', () => {
    renderApp([
      'CATQZX',
      'RLMNVB',
      'SPTUWE',
      'ODGHIK',
      'YJBCDF',
      'EGHIRT',
    ])

    fireEvent.click(screen.getByRole('button', { name: /Shuffle -75/i }))

    expect(screen.getByText('Board shuffled for -75.')).toBeInTheDocument()
  })
})
