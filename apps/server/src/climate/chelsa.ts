import { type AreaGeometry } from "@gororobas/domain"
import { Effect, Schedule } from "effect"
import { FetchHttpClient } from "effect/http"
import { fromCustomClient, type GeoTIFFImage } from "geotiff"

import {
  climateCellWeights,
  ClimateRasterError,
  type RasterGrid,
  summarizeClimateCells,
} from "./aggregation.js"
import { readTerrain } from "./terrain.js"

export const CHELSA_CLIMATOLOGIES_URL =
  "https://os.unil.cloud.switch.ch/chelsa02/chelsa/global/climatologies"

const encodingScale = {
  tas: 0.1,
  pr: 0.1,
  tasmin: 0.1,
  tasmax: 0.1,
  hurs: 0.01,
  pet: 0.01,
  rsds: 1,
  vpd: 0.1,
} as const

type Field = keyof typeof encodingScale

// Approximate sunrise to sunset on the 15th, including standard horizon refraction.
export const daylightHours = (latitude: number, month: number) => {
  const radians = Math.PI / 180
  const day = (Date.UTC(2021, month - 1, 15) - Date.UTC(2021, 0, 0)) / 86400000
  const declination = 23.44 * radians * Math.sin((2 * Math.PI * (day - 80)) / 365)
  const lat = latitude * radians
  const hourAngle =
    (Math.sin(-0.833 * radians) - Math.sin(lat) * Math.sin(declination)) /
    (Math.cos(lat) * Math.cos(declination))
  return (24 * Math.acos(Math.max(-1, Math.min(1, hourAngle)))) / Math.PI
}

const rasterGrid = (image: GeoTIFFImage): RasterGrid => {
  const [west, north] = image.getOrigin()
  const [stepLongitude, stepLatitude] = image.getResolution()
  const geoKeys = image.getGeoKeys()
  const expectedResolution = 1 / 120

  if (
    geoKeys?.GeographicTypeGeoKey !== 4326 ||
    west === undefined ||
    north === undefined ||
    stepLongitude === undefined ||
    stepLatitude === undefined ||
    Math.abs(stepLongitude - expectedResolution) > 1e-9 ||
    Math.abs(stepLatitude + expectedResolution) > 1e-9
  ) {
    throw new ClimateRasterError({
      message: "Expected a north-up EPSG:4326 CHELSA grid at 30 arc-seconds",
    })
  }

  return {
    west,
    north,
    cellWidth: stepLongitude,
    cellHeight: -stepLatitude,
    width: image.getWidth(),
    height: image.getHeight(),
  }
}

const matchesGrid = (left: RasterGrid, right: RasterGrid) =>
  Math.abs(left.west - right.west) < 1e-9 &&
  Math.abs(left.north - right.north) < 1e-9 &&
  Math.abs(left.cellWidth - right.cellWidth) < 1e-9 &&
  Math.abs(left.cellHeight - right.cellHeight) < 1e-9 &&
  left.width === right.width &&
  left.height === right.height

export const aggregateChelsa = (
  baseUrl: string,
  boundary: AreaGeometry,
  elevation: number | null,
  demUrl: string,
) =>
  Effect.gen(function* () {
    const fetchRaster = yield* FetchHttpClient.Fetch
    const terrain =
      elevation === null
        ? undefined
        : { meters: elevation, tiles: yield* readTerrain(demUrl, boundary) }
    let shared: { grid: RasterGrid; weights: ReturnType<typeof climateCellWeights> } | undefined

    const read = (field: Field, month: number) => {
      const url = `${baseUrl.replace(/\/$/, "")}/${field}/1981-2010/CHELSA_${field}_${String(month).padStart(2, "0")}_1981-2010_V.2.1.tif`

      const failed = (cause: unknown) =>
        new ClimateRasterError({
          message: "Could not read CHELSA " + field + " for month " + month,
          cause,
        })

      return Effect.acquireUseRelease(
        Effect.tryPromise({
          try: (signal) =>
            fromCustomClient(
              {
                url,
                request: async (options) => {
                  const response = await fetchRaster(url, {
                    headers: options?.headers ?? {},
                    signal: options?.signal ?? signal,
                  })

                  if (response.status !== 206) {
                    await response.body?.cancel()
                    throw new ClimateRasterError({
                      message: "CHELSA range request returned HTTP " + response.status,
                    })
                  }

                  return {
                    status: response.status,
                    ok: response.ok,
                    getHeader: (name) => response.headers.get(name) ?? undefined,
                    getData: () => response.arrayBuffer(),
                  }
                },
              },
              {},
              signal,
            ),
          catch: failed,
        }).pipe(Effect.interruptible),
        (tiff) =>
          Effect.tryPromise({
            try: async (signal) => {
              const image = await tiff.getImage()
              const grid = rasterGrid(image)
              shared ??= { grid, weights: climateCellWeights(boundary, grid, terrain) }
              if (!matchesGrid(shared.grid, grid)) {
                throw new ClimateRasterError({ message: "CHELSA grids do not align" })
              }

              const values = await image.readRasters({
                window: shared.weights.window,
                samples: [0],
                interleave: true,
                signal,
              })

              const metadata = await image.getGDALMetadata(0)
              // Default encodings come from the pinned CHELSA v2.1 source manifest.
              const scale = Number(metadata?.SCALE ?? encodingScale[field])
              const offset = Number(metadata?.OFFSET ?? 0)
              const noData = image.getGDALNoData() ?? 65535
              if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(offset)) {
                throw new ClimateRasterError({ message: "Invalid CHELSA raster encoding" })
              }

              return summarizeClimateCells({
                weights: shared.weights,
                values,
                decode: (raw) =>
                  !Number.isFinite(raw) || raw === noData
                    ? null
                    : (raw * scale + offset - (field.startsWith("tas") ? 273.15 : 0)) /
                      (field === "vpd" ? 1000 : 1),
              })
            },
            catch: failed,
          }),
        (tiff) => Effect.tryPromise(() => Promise.resolve(tiff.close())).pipe(Effect.ignore),
      ).pipe(
        Effect.timeout("30 seconds"),
        Effect.retry({ times: 1, schedule: Schedule.spaced("250 millis") }),
      )
    }

    const normals = yield* Effect.forEach(
      Array.from({ length: 12 }, (_, index) => index + 1),
      (month) =>
        Effect.all(
          {
            month: Effect.succeed(month),
            relativeHumidityPercent: read("hurs", month),
            potentialEvapotranspirationMm: read("pet", month),
            vaporPressureDeficitKpa: read("vpd", month),
            shortwaveRadiationWm2: read("rsds", month),
            minimumTemperatureC: read("tasmin", month),
            maximumTemperatureC: read("tasmax", month),
            temperatureC: read("tas", month),
            precipitationMm: read("pr", month),
          },
          { concurrency: 2 },
        ),
      { concurrency: 2 },
    )

    if (!shared) return yield* new ClimateRasterError({ message: "Missing climate grid" })
    const { grid, weights } = shared as {
      grid: RasterGrid
      weights: ReturnType<typeof climateCellWeights>
    }
    const [left, top, right] = weights.window
    const area = weights.cells.reduce((sum, cell) => sum + cell.area, 0)

    return {
      supportFraction: weights.supportFraction,
      months: normals.map((month) => ({
        ...month,
        daylightHours:
          weights.cells.reduce((sum, cell) => {
            const row = top + Math.floor(cell.index / (right - left))
            return (
              sum +
              cell.area * daylightHours(grid.north - (row + 0.5) * grid.cellHeight, month.month)
            )
          }, 0) / area,
      })),
    }
  })
