import { type AreaGeometry, geometryToBoundingBox } from "@gororobas/domain"
import { Array as EffectArray, Effect } from "effect"
import { FetchHttpClient } from "effect/http"
import { fromArrayBuffer } from "geotiff"

import { ClimateRasterError, type TerrainTile } from "./aggregation.js"

export const readTerrain = (baseUrl: string, boundary: AreaGeometry) =>
  Effect.gen(function* () {
    const fetchRaster = yield* FetchHttpClient.Fetch
    const box = geometryToBoundingBox(boundary)
    // GLO-90 is pixel-is-point. The outermost sample footprints straddle degree seams.
    const latitudes = EffectArray.range(
      Math.floor(box.minLatitude - 1 / 2400),
      Math.ceil(box.maxLatitude + 1 / 2400) - 1,
    )
    const longitudes = EffectArray.range(
      Math.floor(box.minLongitude - 1 / 120),
      Math.ceil(box.maxLongitude + 1 / 120) - 1,
    )

    const names = latitudes.flatMap((lat) =>
      longitudes.map(
        (lon) =>
          `Copernicus_DSM_COG_30_${lat < 0 ? "S" : "N"}${String(Math.abs(lat)).padStart(2, "0")}_00_${lon < 0 ? "W" : "E"}${String(Math.abs(lon)).padStart(3, "0")}_00_DEM`,
      ),
    )

    if (names.length > 36) {
      return yield* new ClimateRasterError({ message: "Terrain window exceeds tile limit" })
    }

    return yield* Effect.forEach(
      names,
      (name) =>
        Effect.tryPromise({
          try: async (signal): Promise<TerrainTile> => {
            const response = await fetchRaster(
              `${baseUrl.replace(/\/$/, "")}/${name}/${name}.tif`,
              {
                signal,
              },
            )

            if (!response.ok) {
              throw new ClimateRasterError({
                message: `DEM request returned HTTP ${response.status}`,
              })
            }

            const tiff = await fromArrayBuffer(await response.arrayBuffer())

            // oxlint-disable-next-line effect/avoid-try-catch -- Release the GeoTIFF on failed or interrupted reads.
            try {
              const image = await tiff.getImage()
              const [x, y] = image.getOrigin()
              const [dx, dy] = image.getResolution()

              if (
                image.getGeoKeys()?.GeographicTypeGeoKey !== 4326 ||
                x === undefined ||
                y === undefined ||
                dx === undefined ||
                dy === undefined ||
                !(dx > 0 && dy < 0)
              ) {
                throw new ClimateRasterError({ message: "Invalid GLO-90 georeferencing" })
              }

              const point = image.getGeoKeys()?.GTRasterTypeGeoKey === 2
              const west = x - (point ? dx / 2 : 0)
              const north = y - (point ? dy / 2 : 0)
              const left = Math.max(0, Math.floor((box.minLongitude - west) / dx))
              const right = Math.min(image.getWidth(), Math.ceil((box.maxLongitude - west) / dx))
              const top = Math.max(0, Math.floor((box.maxLatitude - north) / dy))
              const bottom = Math.min(image.getHeight(), Math.ceil((box.minLatitude - north) / dy))
              const width = Math.max(0, right - left)
              const height = Math.max(0, bottom - top)

              const elevation =
                width && height
                  ? await image.readRasters({
                      window: [left, top, right, bottom],
                      samples: [0],
                      interleave: true,
                      signal,
                    })
                  : []

              return {
                west: west + left * dx,
                north: north + top * dy,
                cellWidth: dx,
                cellHeight: -dy,
                width,
                height,
                elevation,
                noData: image.getGDALNoData(),
              }
            } finally {
              await tiff.close()
            }
          },
          catch: (cause) =>
            new ClimateRasterError({ message: `Cannot read GLO-90 tile ${name}`, cause }),
        }).pipe(Effect.timeout("45 seconds")),
      { concurrency: 2 },
    )
  })
