/**
 * Test infrastructure helpers for Effect-based testing.
 */
import { IdGen, SessionContext, type Session } from "@gororobas/domain"
import { Effect, Layer } from "effect"
import { v7 } from "uuid"

import { PeopleRepository } from "../src/people/repository.js"
import { ProfilesRepository } from "../src/profiles/repository.js"
import { AppSqlTest } from "../src/sql.js"
import { getTelemetryLayer } from "./telemetry.js"

/**
 * Test database layer using AppSqlTest (in-memory SQLite with migrations).
 *
 * AppSqlTest provides:
 * - In-memory SQLite database (":memory:")
 * - Automatic schema migrations from production
 * - Column name transformations (snake_case ↔ camelCase)
 *
 * Database schema is identical to production - no test-specific schema changes.
 */
export const TestSqlLayer = AppSqlTest

/**
 * Run an effect with a test session context.
 *
 * This helper provides a session to effects that require SessionContext.
 */
export const withSession = <A, E, R>(
  effect: Effect.Effect<A, E, R | SessionContext>,
  session: Session,
): Effect.Effect<A, E, Exclude<R, SessionContext>> =>
  effect.pipe(Effect.provide(Layer.succeed(SessionContext, session)))

/**
 * IdGen test layer that generates UUIDv7 identifiers.
 *
 * Uses the same UUID generation strategy as production.
 */
export const IdGenTest = Layer.succeed(IdGen, {
  generate: () => v7(),
})

/**
 * Compose test layers for common test scenarios.
 *
 * Includes:
 * - getTelemetryLayer(): Optional OpenTelemetry instrumentation (enabled via ENABLE_TELEMETRY)
 * - TestSqlLayer: In-memory SQLite with migrations
 * - IdGenTest: UUID generation
 * - PeopleRepository: People data access layer
 * - ProfilesRepository: Profiles data access layer
 */
export const TestLayer = Layer.mergeAll(
  getTelemetryLayer(),
  IdGenTest,
  Layer.effect(PeopleRepository, PeopleRepository.make),
  Layer.effect(ProfilesRepository, ProfilesRepository.make),
).pipe(Layer.provideMerge(TestSqlLayer))
