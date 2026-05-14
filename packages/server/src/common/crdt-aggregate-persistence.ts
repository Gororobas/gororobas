import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

/**
 * API to remind that creating crdt-based documents always requires:
 *
 * 1. Persisting the CRDT row
 * 2. Adding an initial commit or revision
 * 3. Materializing the indexed tables to query the source data through SQL
 *
 * This method is mostly for documentation and doesn't do anything fancy,
 * it just wraps them in a SQL transaction to ensure operation consistency.
 */
export const persistCrdtDocumentCreation = <R1, E1, R2, E2, R3, E3>(input: {
  insertCrdt: Effect.Effect<void, E1, R1>
  insertCommitOrRevision: Effect.Effect<void, E2, R2>
  materialize: Effect.Effect<void, E3, R3>
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    yield* sql.withTransaction(
      Effect.all([input.insertCrdt, input.insertCommitOrRevision, input.materialize]),
    )
  })

/**
 * API to remind that updating crdt-based documents always requires:
 *
 * 1. Persisting the CRDT row
 * 2. Adding a commit or revision
 * 3. Materializing the indexed tables to query the source data through SQL
 *
 * This method is mostly for documentation and doesn't do anything fancy,
 * it just wraps them in a SQL transaction to ensure operation consistency.
 */
export const persistCrdtDocumentUpdate = <R1, E1, R2, E2, R3, E3>(input: {
  /**
   * For commits, there's a chance of race conditions where the document changes while the user is submitting
   * the commit. To to prevent race conditions, the update function should take the document's frontier
   * into consideration and error out if the frontier changed before the request could complete.
   */
  updateCrdtRow: Effect.Effect<void, E1, R1>
  insertCommitOrUpdateRevision: Effect.Effect<void, E2, R2>
  materialize: Effect.Effect<void, E3, R3>
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    yield* sql.withTransaction(
      Effect.all([input.updateCrdtRow, input.insertCommitOrUpdateRevision, input.materialize]),
    )
  })
