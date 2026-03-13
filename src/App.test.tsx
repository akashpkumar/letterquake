import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LexplosionApp } from './App'
import { createGame, makeBoardFromRows } from './game/engine'

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
    expect(screen.getByText('CAT')).toBeInTheDocument()
    expect(screen.getByText('+90')).toBeInTheDocument()
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
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()

    fireEvent.pointerMove(screen.getByTestId('board'), {
      pointerId: 1,
      clientX: 108,
      clientY: 20,
    })

    expect(screen.getAllByTestId('overlay-active')).toHaveLength(2)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('marks auto-clears distinctly', () => {
    vi.useFakeTimers()

    renderApp([
      'ZZZQZX',
      'ZZZQZX',
      'DOGQZX',
      'CATQZX',
      'ZZZQZX',
      'ZZZQZX',
    ])

    installBoardGeometry()

    fireEvent.pointerDown(screen.getByTestId('tile-3-0'), {
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

    fireEvent.click(screen.getByRole('button', { name: /Shuffle board for -75/i }))

    expect(screen.getByText('Board shuffled for -75.')).toBeInTheDocument()
  })

  it('shows special tile rules in help and renders special tile markers', () => {
    const game = createGame({
      seed: 7,
      board: makeBoardFromRows(
        [
          'CATQZX',
          'RLMNVB',
          'SPTUWE',
          'ODGHIK',
          'YJBCDF',
          'EGHIRT',
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

    expect(document.querySelector('.tile__block--kind-gold')).not.toBeNull()
    expect(document.querySelector('.tile__block--kind-cracked')).not.toBeNull()
    expect(document.querySelector('.tile__block--kind-anchor')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open help' }))

    expect(screen.getByText(/Gold: Adds bonus points/i)).toBeInTheDocument()
    expect(screen.getByText(/Cracked: Needs two valid word hits/i)).toBeInTheDocument()
    expect(screen.getByText(/Anchor: Stays fixed during gravity/i)).toBeInTheDocument()
  })
})
