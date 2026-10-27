import { Array, Equal, Option, pipe } from 'effect'

import { MAX_HISTORY } from './constant'
import type { Cell, Grid, MirrorMode, PaletteIndex } from './model'

export const isGridEmpty = (grid: typeof Grid.Type): boolean =>
  grid.every(row => row.every(Option.isNone))

export const getCell = (
  grid: typeof Grid.Type,
  x: number,
  y: number,
): typeof Cell.Type =>
  pipe(
    grid,
    Array.get(y),
    Option.flatMap(Array.get(x)),
    Option.getOrElse(() => Option.none<typeof PaletteIndex.Type>()),
  )

export const createEmptyGrid = (size: number): typeof Grid.Type =>
  Array.makeBy(size, () =>
    Array.makeBy(size, () => Option.none<typeof PaletteIndex.Type>()),
  )

export const setPixel = (
  grid: typeof Grid.Type,
  x: number,
  y: number,
  colorIndex: typeof PaletteIndex.Type,
): typeof Grid.Type =>
  Array.map(grid, (row, rowIndex) =>
    rowIndex === y
      ? Array.map(row, (cell, colIndex) =>
          colIndex === x ? Option.some(colorIndex) : cell,
        )
      : row,
  )

export const setPixels = (
  grid: typeof Grid.Type,
  positions: ReadonlyArray<readonly [number, number]>,
  colorIndex: typeof PaletteIndex.Type,
): typeof Grid.Type =>
  Array.reduce(positions, grid, (currentGrid, [positionX, positionY]) =>
    setPixel(currentGrid, positionX, positionY, colorIndex),
  )

export const erasePixel = (
  grid: typeof Grid.Type,
  x: number,
  y: number,
): typeof Grid.Type =>
  Array.map(grid, (row, rowIndex) =>
    rowIndex === y
      ? Array.map(row, (cell, colIndex) =>
          colIndex === x ? Option.none() : cell,
        )
      : row,
  )

export const erasePixels = (
  grid: typeof Grid.Type,
  positions: ReadonlyArray<readonly [number, number]>,
): typeof Grid.Type =>
  Array.reduce(positions, grid, (currentGrid, [positionX, positionY]) =>
    erasePixel(currentGrid, positionX, positionY),
  )

export const getMirroredPositions = (
  x: number,
  y: number,
  gridSize: number,
  mirrorMode: typeof MirrorMode.Type,
): ReadonlyArray<readonly [number, number]> => {
  const mirrorX = gridSize - 1 - x
  const mirrorY = gridSize - 1 - y

  if (mirrorMode === 'Both') {
    return [
      [x, y],
      [mirrorX, y],
      [x, mirrorY],
      [mirrorX, mirrorY],
    ]
  }
  if (mirrorMode === 'Horizontal') {
    return [
      [x, y],
      [mirrorX, y],
    ]
  }
  if (mirrorMode === 'Vertical') {
    return [
      [x, y],
      [x, mirrorY],
    ]
  }
  return [[x, y]]
}

export const floodFill = (
  grid: typeof Grid.Type,
  startX: number,
  startY: number,
  fillColorIndex: typeof PaletteIndex.Type,
): typeof Grid.Type => {
  const targetCell = getCell(grid, startX, startY)
  const fillCell: typeof Cell.Type = Option.some(fillColorIndex)
  if (Equal.equals(targetCell, fillCell)) {
    return grid
  }

  const size = grid.length
  const result = grid.map(row => [...row])
  const stack: Array<readonly [number, number]> = [[startX, startY]]

  while (true) {
    const maybePosition = stack.pop()
    if (maybePosition === undefined) {
      break
    }
    const [x, y] = maybePosition
    if (x < 0 || x >= size || y < 0 || y >= size) {
      continue
    }
    const row = result[y]
    if (row === undefined || !Equal.equals(row[x], targetCell)) {
      continue
    }

    row[x] = fillCell
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }

  return result
}

export const pushHistory = (
  stack: ReadonlyArray<typeof Grid.Type>,
  grid: typeof Grid.Type,
): ReadonlyArray<typeof Grid.Type> =>
  Array.takeRight([...stack, grid], MAX_HISTORY)
