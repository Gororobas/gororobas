import { describe, expect, it } from "@effect/vitest"

import { climateCellWeights, summarizeClimateCells } from "./aggregation.js"

describe("climate cell aggregation", () => {
  it("weights a partial cell, removes a hole and reports missing coverage", () => {
    const weights = climateCellWeights({
      boundary: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1.5, 0],
            [1.5, 1],
            [0, 1],
            [0, 0],
          ],
          [
            [0.25, 0.25],
            [0.75, 0.25],
            [0.75, 0.75],
            [0.25, 0.75],
            [0.25, 0.25],
          ],
        ],
      },
      grid: { west: 0, north: 1, cellWidth: 1, cellHeight: 1, width: 2, height: 1 },
    })

    expect(weights.window).toEqual([0, 0, 2, 1])
    const summary = summarizeClimateCells({ weights, values: [10, 30], decode: (value) => value })
    expect(summary.mean).toBeCloseTo(18, 3)
    expect(summary).toMatchObject({ p10: 10, p50: 10, p90: 30, cellCount: 2 })
    expect(summary.coverage).toBeCloseTo(1)

    const withMissingCell = summarizeClimateCells({
      weights,
      values: [10, 65535],
      decode: (value) => (value === 65535 ? null : value),
    })

    expect(withMissingCell).toMatchObject({ mean: 10, p90: 10, cellCount: 1 })
    expect(withMissingCell.coverage).toBeCloseTo(0.6, 3)
  })
})

it("clips matching DEM footprints across climate cells and excludes terrain outside the boundary", () => {
  const boundary = {
    type: "Polygon" as const,
    coordinates: [
      [
        [0, 0],
        [1.75, 0],
        [1.75, 1],
        [0, 1],
        [0, 0],
      ],
    ],
  } as const

  const grid = { west: 0, north: 1, cellWidth: 1, cellHeight: 1, width: 2, height: 1 }

  // The 1,000 m footprint crosses the climate-cell edge. Only 1/4 of the
  // 1,049 m footprint lies in the municipality. 1,050 m is in the next band.
  const tile = {
    ...grid,
    west: -0.5,
    cellWidth: 1,
    width: 3,
    elevation: [1050, 1000, 1049],
    noData: null,
  }

  const weights = climateCellWeights({ boundary, grid, terrain: { tiles: [tile], meters: 1000 } })
  expect(weights.supportFraction).toBeCloseTo(1.25 / 1.75)
  const summary = summarizeClimateCells({ weights, values: [10, 30], decode: (value) => value })
  expect(summary.mean).toBeCloseTo((10 * 0.5 + 30 * 0.75) / 1.25)
  expect(summary.coverage).toBeCloseTo(1)
  expect(() =>
    climateCellWeights({ boundary, grid, terrain: { tiles: [tile], meters: 500 } }),
  ).toThrow(/No terrain/)
})
