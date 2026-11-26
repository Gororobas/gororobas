import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { FetchHttpClient } from "effect/http"
import { writeArrayBuffer } from "geotiff"

import { aggregateChelsa } from "./chelsa.js"

it.effect("decodes all monthly fields over the selected elevation footprints", () =>
  Effect.gen(function* () {
    const step = 1 / 120

    const raster = (values: number[]) =>
      writeArrayBuffer(new Uint16Array(values), {
        width: 2,
        height: 1,
        ModelPixelScale: [step, step, 0],
        ModelTiepoint: [0, 0, 0, 0.5, 0.5, 0],
        GeographicTypeGeoKey: 4326,
        GTRasterTypeGeoKey: 1,
      })

    const fields = new Map(
      Object.entries({
        tas: raster([2900, 3000]),
        tasmin: raster([2800, 2900]),
        tasmax: raster([3000, 3100]),
        pr: raster([100, 300]),
        hurs: raster([7500, 8500]),
        pet: raster([5000, 7000]),
        vpd: raster([5000, 8000]),
        rsds: raster([150, 200]),
      }),
    )

    const fetchRaster: typeof fetch = async (input, options) => {
      const path = new URL(String(input)).pathname
      if (path.includes("Copernicus")) return new Response(raster([800, 1200]))
      const bytes = fields.get(path.split("/")[1] ?? "")
      const range = /^bytes=(\d+)-(\d+)$/.exec(new Headers(options?.headers).get("Range") ?? "")
      if (!bytes || !range) return new Response(null, { status: 404 })
      const start = Number(range[1])
      const end = Math.min(bytes.byteLength - 1, Number(range[2]))

      return new Response(bytes.slice(start, end + 1), {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${bytes.byteLength}`,
        },
      })
    }

    const boundary = {
      type: "Polygon",
      coordinates: [
        [
          [0.5, 0.5],
          [0.5 + 2 * step, 0.5],
          [0.5 + 2 * step, 0.5 - step],
          [0.5, 0.5 - step],
          [0.5, 0.5],
        ],
      ],
    } as const

    const profile = (meters: number | null) =>
      aggregateChelsa("https://normals.test", boundary, meters, "https://terrain.test").pipe(
        Effect.provideService(FetchHttpClient.Fetch, fetchRaster),
      )
    const selected = yield* profile(1200)
    expect(selected.supportFraction).toBeCloseTo(0.5)
    expect(selected.months).toHaveLength(12)

    for (const month of selected.months) {
      expect(month.temperatureC.mean).toBeCloseTo(26.85)
      expect(month.minimumTemperatureC.mean).toBeCloseTo(16.85)
      expect(month.maximumTemperatureC.mean).toBeCloseTo(36.85)
      expect(month.precipitationMm.mean).toBeCloseTo(30)
      expect(month.relativeHumidityPercent.mean).toBeCloseTo(85)
      expect(month.potentialEvapotranspirationMm.mean).toBeCloseTo(70)
      expect(month.vaporPressureDeficitKpa.mean).toBeCloseTo(0.8)
      expect(month.shortwaveRadiationWm2.mean).toBeCloseTo(200)
      expect(month.daylightHours).toBeGreaterThan(11.9)
      expect(month.daylightHours).toBeLessThan(12.2)
    }

    const whole = yield* profile(null)
    expect(whole.months[0]?.precipitationMm.mean).toBeCloseTo(20)
  }),
)
