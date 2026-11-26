import { type AreaGeometry, type BoundingBox, geometryToBoundingBox } from "@gororobas/domain"
import { Array as EffectArray, Order, Schema } from "effect"
import polygonClipping, { type MultiPolygon, type Pair, type Ring } from "polygon-clipping"

export type RasterWindow = [left: number, top: number, right: number, bottom: number]

export interface RasterGrid {
  readonly west: number
  readonly north: number
  readonly cellWidth: number
  readonly cellHeight: number
  readonly width: number
  readonly height: number
}

export class ClimateRasterError extends Schema.TaggedError<ClimateRasterError>()(
  "ClimateRasterError",
  {
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Unknown),
  },
) {}

interface CellWeight {
  readonly index: number
  readonly area: number
}

// The EPSG:6933 equal-area projection, omitting coordinate scale factors which cancel in ratios.
const projectLatitude = (degrees: number) => {
  const eccentricity = Math.sqrt(0.0066943799901413165)
  const sine = Math.sin((degrees * Math.PI) / 180)
  const eSine = eccentricity * sine
  return sine / (1 - eSine * eSine) + Math.atanh(eSine) / eccentricity
}

const ringArea = (ring: Ring) => {
  const origin = ring[0]
  if (origin === undefined) return 0

  const twiceArea = EffectArray.zip(ring, ring.slice(1)).reduce(
    (sum, [from, to]) =>
      sum +
      (from[0] - origin[0]) * (to[1] - origin[1]) -
      (to[0] - origin[0]) * (from[1] - origin[1]),
    0,
  )

  return Math.abs(twiceArea) / 2
}

const areaOf = (geometry: MultiPolygon) =>
  geometry.reduce(
    (sum, [outer, ...holes]) =>
      sum +
      (outer === undefined ? 0 : ringArea(outer)) -
      holes.reduce((area, hole) => area + ringArea(hole), 0),
    0,
  )

const windowFor = (box: BoundingBox, grid: RasterGrid): RasterWindow => [
  Math.max(0, Math.floor((box.minLongitude - grid.west) / grid.cellWidth)),
  Math.max(0, Math.floor((grid.north - box.maxLatitude) / grid.cellHeight)),
  Math.min(grid.width, Math.ceil((box.maxLongitude - grid.west) / grid.cellWidth)),
  Math.min(grid.height, Math.ceil((grid.north - box.minLatitude) / grid.cellHeight)),
]

const rectangle = ([west, south, east, north]: readonly [number, number, number, number]): [
  Ring,
] => [
  [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ],
]

export interface TerrainTile extends RasterGrid {
  readonly elevation: ArrayLike<number>
  readonly noData: number | null
}

// Sutherland–Hodgman clipping against one axis-aligned half-plane. Only the
// enclosed area is needed, so disconnected pieces can share cancelling edges.
const clipRing = (ring: Ring, [axis, limit, keepAbove]: [0 | 1, number, boolean]): Ring => {
  const result: Ring = []
  let previous = ring.at(-1)
  if (!previous) return result

  // oxlint-disable-next-line effect/imperative-loops -- Each edge starts at the previous vertex.
  for (const point of ring) {
    const inside = keepAbove ? point[axis] >= limit : point[axis] <= limit
    const wasInside = keepAbove ? previous[axis] >= limit : previous[axis] <= limit

    if (inside !== wasInside) {
      const t = (limit - previous[axis]) / (point[axis] - previous[axis])

      result.push(
        axis === 0
          ? [limit, previous[1] + t * (point[1] - previous[1])]
          : [previous[0] + t * (point[0] - previous[0]), limit],
      )
    }

    if (inside) result.push(point)
    previous = point
  }

  return result
}

const rectangleArea = (
  polygon: MultiPolygon,
  [west, south, east, north]: [number, number, number, number],
) =>
  areaOf(
    polygon.map((rings) =>
      rings.map((ring) => {
        const horizontal = clipRing(clipRing(ring, [0, west, true]), [0, east, false])
        const clipped = clipRing(clipRing(horizontal, [1, south, true]), [1, north, false])

        if (clipped[0]) clipped.push(clipped[0])
        return clipped
      }),
    ),
  )

const elevationArea = ({
  polygon,
  bounds,
  terrain,
}: {
  polygon: MultiPolygon
  bounds: [number, number, number, number]
  terrain: TerrainSelection
}) => {
  const { tiles, meters: target } = terrain
  const [west, south, east, north] = bounds
  let total = 0

  // oxlint-disable-next-line effect/imperative-loops -- Scan DEM windows without allocating a list of pixel coordinates.
  for (const tile of tiles) {
    const [left, top, right, bottom] = windowFor(
      {
        minLongitude: west,
        maxLongitude: east,
        minLatitude: south,
        maxLatitude: north,
      },
      tile,
    )

    // oxlint-disable-next-line effect/imperative-loops -- Accumulate one raster scanline at a time.
    for (let row = top; row < bottom; row++) {
      const y = tile.north - row * tile.cellHeight
      const upper = projectLatitude(Math.min(north, y))
      const lower = projectLatitude(Math.max(south, y - tile.cellHeight))
      // Adjacent matching DEM pixels on a scanline form a single rectangle.
      let run = left

      // oxlint-disable-next-line effect/imperative-loops -- Track the start of each contiguous altitude run in constant memory.
      for (let col = left; col <= right; col++) {
        const height = tile.elevation[row * tile.width + col]

        if (
          col < right &&
          height !== undefined &&
          height !== tile.noData &&
          height >= target - 50 &&
          height < target + 50
        ) {
          continue
        }

        if (col > run && upper > lower) {
          const start = Math.max(west, tile.west + run * tile.cellWidth)
          const end = Math.min(east, tile.west + col * tile.cellWidth)
          if (end > start) total += rectangleArea(polygon, [start, lower, end, upper])
        }

        run = col + 1
      }
    }
  }

  return total
}

interface TerrainSelection {
  tiles: readonly TerrainTile[]
  meters: number
}

export const climateCellWeights = ({
  boundary,
  grid,
  terrain,
}: {
  boundary: AreaGeometry
  grid: RasterGrid
  terrain?: TerrainSelection | undefined
}) => {
  const window = windowFor(geometryToBoundingBox(boundary), grid)
  const [left, top, right, bottom] = window
  const width = right - left

  if (width <= 0 || bottom <= top || width * (bottom - top) > 100_000) {
    throw new ClimateRasterError({
      message: "Municipality exceeds the supported climate raster window",
    })
  }

  const polygons = boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates

  const projected = polygons.map((polygon) =>
    polygon.map((ring) =>
      ring.map(([longitude, latitude]): Pair => [longitude, projectLatitude(latitude)]),
    ),
  )

  const polygonArea = areaOf(projected)
  if (polygonArea <= 0) {
    throw new ClimateRasterError({ message: "Municipality has no polygon area" })
  }

  const longitude = (column: number) => grid.west + column * grid.cellWidth
  const latitude = (row: number) => projectLatitude(grid.north - row * grid.cellHeight)
  const columns = EffectArray.range(left, right - 1)

  const cells = EffectArray.range(top, bottom - 1).flatMap((row) => {
    const north = latitude(row)
    const south = latitude(row + 1)
    const strip = polygonClipping.intersection(
      projected,
      rectangle([longitude(left), south, longitude(right), north]),
    )
    if (EffectArray.isReadonlyArrayEmpty(strip)) return []

    return columns.flatMap((column): ReadonlyArray<CellWeight> => {
      const cut = polygonClipping.intersection(
        strip,
        rectangle([longitude(column), south, longitude(column + 1), north]),
      )

      const area =
        terrain && cut.length
          ? elevationArea({
              polygon: cut,
              bounds: [
                longitude(column),
                grid.north - (row + 1) * grid.cellHeight,
                longitude(column + 1),
                grid.north - row * grid.cellHeight,
              ],
              terrain,
            })
          : areaOf(cut)

      return area > 0 ? [{ index: (row - top) * width + column - left, area }] : []
    })
  })

  const matchingArea = cells.reduce((sum, cell) => sum + cell.area, 0)
  if (matchingArea <= 0) {
    throw new ClimateRasterError({ message: "No terrain within the requested elevation range" })
  }

  return {
    window,
    cells,
    polygonArea: terrain ? matchingArea : polygonArea,
    supportFraction: Math.min(1, matchingArea / polygonArea),
  }
}

export const summarizeClimateCells = ({
  weights: { cells, polygonArea },
  values,
  decode,
}: {
  readonly weights: ReturnType<typeof climateCellWeights>
  readonly values: ArrayLike<number>
  readonly decode: (raw: number) => number | null
}) => {
  const samples = EffectArray.sort(
    cells.flatMap(({ index, area }) => {
      const raw = values[index]
      const value = raw === undefined ? null : decode(raw)
      return value === null ? [] : [{ value, area }]
    }),
    Order.mapInput(Order.Number, (sample: { readonly value: number }) => sample.value),
  )

  const last = samples.at(-1)
  if (last === undefined) {
    throw new ClimateRasterError({ message: "No valid climate cells intersect the municipality" })
  }

  const cumulativeAreas = EffectArray.scan(samples, 0, (sum, sample) => sum + sample.area)
  const area = cumulativeAreas.at(-1) ?? 0
  const quantile = (fraction: number) => {
    const index = cumulativeAreas.findIndex((cumulative) => cumulative >= area * fraction) - 1
    return samples[index]?.value ?? last.value
  }

  return {
    mean: samples.reduce((sum, sample) => sum + sample.value * sample.area, 0) / area,
    p10: quantile(0.1),
    p50: quantile(0.5),
    p90: quantile(0.9),
    coverage: Math.min(1, area / polygonArea),
    cellCount: samples.length,
  }
}
