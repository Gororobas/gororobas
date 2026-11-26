import { expect, it } from "@effect/vitest"
import { WhosOnFirstId } from "@gororobas/domain"
import { Effect, Option } from "effect"

import { AppSqlTest } from "../sql.js"
import { finishClimateGeneration, requestClimateGeneration } from "./repository.js"

it.effect("deduplicates matching elevations and isolates retries between elevations", () =>
  Effect.gen(function* () {
    const whosOnFirstId = WhosOnFirstId.make("102054687")
    const request = (elevationMeters: number | null, generation: string) =>
      requestClimateGeneration({ whosOnFirstId, elevationMeters, generation }).pipe(
        Effect.map(Option.getOrThrow),
      )
    const higher = yield* request(1200, "first")
    yield* request(null, "municipality")
    yield* request(800, "lower")
    expect((yield* request(1200, "second")).generation).toBe("first")
    yield* finishClimateGeneration({ ...higher, profile: null })
    expect((yield* request(1200, "retry")).generation).toBe("retry")
    yield* finishClimateGeneration({ ...higher, profile: null })
    expect((yield* request(1200, "duplicate")).generation).toBe("retry")
    expect((yield* request(null, "another")).generation).toBe("municipality")
    expect((yield* request(800, "another")).generation).toBe("lower")
  }).pipe(Effect.provide(AppSqlTest)),
)
