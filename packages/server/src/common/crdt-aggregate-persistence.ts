import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

export const persistCrdtAggregateCreation = <A, R1, E1, R2, E2, R3, E3>(input: {
  insertCrdt: Effect.Effect<void, E1, R1>
  insertInitialCommit: Effect.Effect<void, E2, R2>
  materialize: Effect.Effect<void, E3, R3>
  result: A
  sql: SqlClient.SqlClient
}) =>
  input.sql.withTransaction(
    Effect.gen(function* () {
      yield* input.insertCrdt
      yield* input.insertInitialCommit
      yield* input.materialize

      return input.result
    }),
  )

export const persistCrdtAggregateUpdate = <R1, E1, R2, E2, R3, E3, R4, E4>(input: {
  ensureSnapshotUpdated: Effect.Effect<boolean, E1, R1>
  insertCommit: Effect.Effect<void, E2, R2>
  materialize: Effect.Effect<void, E3, R3>
  onConflict: Effect.Effect<never, E4, R4>
  sql: SqlClient.SqlClient
}) =>
  input.sql.withTransaction(
    Effect.gen(function* () {
      const updated = yield* input.ensureSnapshotUpdated

      if (!updated) {
        yield* input.onConflict
      }

      yield* input.insertCommit
      yield* input.materialize
    }),
  )
