import { AreaGeometry, PlaceClimateProfile, type ProfileLocationData } from "@gororobas/domain"
import { Config, DateTime, Effect, FileSystem, Option, Path, Schema } from "effect"
import * as Length from "effect-units/Length"
import { Activity, DurableClock, Workflow } from "effect/workflow"

import { Gazetteer } from "../places/gazetteer.js"
import { aggregateChelsa, CHELSA_CLIMATOLOGIES_URL } from "./chelsa.js"
import {
  ClimateGeneration,
  finishClimateGeneration,
  requestClimateGeneration,
} from "./repository.js"

const BoundarySnapshot = Schema.fromJsonString(
  Schema.Struct({
    type: Schema.Literal("Feature"),
    geometry: AreaGeometry,
    properties: Schema.Struct({
      geometry_source: Schema.Literals(["IBGE", "IGAC", "DANE"]),
      geometry_version: Schema.String,
    }),
  }),
)

export const PlaceClimateWorkflow = Workflow.make("PlaceClimateProfile/v1", {
  payload: ClimateGeneration,
  success: Schema.Void,
  idempotencyKey: ({ whosOnFirstId, elevationMeters, generation }) =>
    `${whosOnFirstId}:${elevationMeters}:${generation}`,
})

export const PlaceClimateWorkflowLive = PlaceClimateWorkflow.toLayer(
  Effect.fn(function* (generation) {
    const { whosOnFirstId } = generation
    const gazetteer = yield* Gazetteer

    const generate = Effect.gen(function* () {
      const baseUrl = yield* Config.String("CHELSA_CLIMATOLOGIES_URL").pipe(
        Config.withDefault(CHELSA_CLIMATOLOGIES_URL),
      )
      const path = yield* Path.Path
      const bundled = yield* path.fromFileUrl(
        new URL("../../assets/climate-boundaries/", import.meta.url),
      )
      const directory = yield* Config.String("CLIMATE_BOUNDARIES_DIRECTORY").pipe(
        Config.withDefault(bundled),
      )
      const filename = path.join(directory, `admin-${whosOnFirstId}.geojson`)
      const fs = yield* FileSystem.FileSystem

      const official = (yield* fs.exists(filename))
        ? yield* fs
            .readFileString(filename)
            .pipe(Effect.flatMap(Schema.decodeEffect(BoundarySnapshot)))
        : null

      const boundary =
        official?.geometry ??
        Option.getOrUndefined(yield* gazetteer.findMunicipalityBoundary(whosOnFirstId))?.geometry
      if (boundary === undefined) return null

      const demUrl = yield* Config.String("CLIMATE_DEM_URL").pipe(
        Config.withDefault("https://copernicus-dem-90m.s3.amazonaws.com"),
      )

      return PlaceClimateProfile.make({
        dataset: "CHELSA v2.1",
        baseline: "1981–2010",
        boundarySource: official?.properties.geometry_source ?? "Who's On First",
        boundaryVersion: official?.properties.geometry_version ?? null,
        computedAt: DateTime.formatIso(yield* DateTime.now),
        elevationMeters: generation.elevationMeters,
        ...(yield* aggregateChelsa(baseUrl, boundary, generation.elevationMeters, demUrl)),
      })
    }).pipe(
      Effect.tapError((error) =>
        Effect.logWarning("Climate profile generation failed", { whosOnFirstId, error }),
      ),
      Effect.mapError(() => "Climate profile generation failed"),
    )

    const run = (name: string) =>
      Activity.make({
        name,
        success: Schema.NullOr(PlaceClimateProfile),
        error: Schema.String,
        execute: generate,
      })

    const profile = yield* run("aggregate").pipe(
      Effect.catch(() =>
        DurableClock.sleep({
          name: "retry-delay",
          duration: "1 minute",
          inMemoryThreshold: 0,
        }).pipe(
          Effect.andThen(run("aggregate-retry")),
          Effect.orElseSucceed(() => null),
        ),
      ),
    )

    yield* Activity.make({
      name: "publish",
      execute: finishClimateGeneration({ ...generation, profile }).pipe(Effect.orDie),
    })
  }),
)

export const queueLocationClimate = Effect.fn("profileLocations.queueClimate")(function* (
  location: ProfileLocationData,
) {
  if (location.place._tag !== "KnownPlace") return location
  const place = location.place.gazetteerPlace
  if (place?.placeKind !== "MUNICIPALITY") return location

  const generation = yield* requestClimateGeneration({
    whosOnFirstId: place.id,
    elevationMeters:
      location.place.elevation === null ? null : Length.inMeters(location.place.elevation),
    generation: DateTime.formatIso(yield* DateTime.now),
  })

  if (Option.isNone(generation)) return location

  yield* PlaceClimateWorkflow.execute(generation.value, { discard: true })
  return { ...location, place: { ...location.place, climate: { _tag: "Generating" as const } } }
})
