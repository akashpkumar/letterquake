export interface BoardMetrics {
  width: number
  height: number
  cols: number
  rows: number
  gap: number
  cellWidth: number
  cellHeight: number
  pitchX: number
  pitchY: number
  offsetX: number
  offsetY: number
  radius: number
}

export function getBoardMetrics(
  width: number,
  height: number,
  rows: number,
  cols: number,
): BoardMetrics {
  const boardSize = Math.max(1, Math.min(width, height))
  const gap = Math.max(4, boardSize * 0.013)
  const totalGapX = gap * Math.max(0, cols - 1)
  const totalGapY = gap * Math.max(0, rows - 1)
  const cellWidth = (boardSize - totalGapX) / cols
  const cellHeight = (boardSize - totalGapY) / rows

  return {
    width,
    height,
    cols,
    rows,
    gap,
    cellWidth,
    cellHeight,
    pitchX: cellWidth + gap,
    pitchY: cellHeight + gap,
    offsetX: (width - boardSize) / 2,
    offsetY: (height - boardSize) / 2,
    radius: Math.min(cellWidth, cellHeight) * 0.16,
  }
}

export function getCellPosition(row: number, col: number, metrics: BoardMetrics) {
  return {
    x: metrics.offsetX + col * metrics.pitchX,
    y: metrics.offsetY + row * metrics.pitchY,
  }
}

export function getCellCenter(row: number, col: number, metrics: BoardMetrics) {
  const position = getCellPosition(row, col, metrics)
  return {
    x: position.x + metrics.cellWidth / 2,
    y: position.y + metrics.cellHeight / 2,
  }
}
