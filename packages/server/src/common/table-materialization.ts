import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

/**
 * API to make materialization simpler to read, and concetrate documentation in a single place.
 *
 * We first delete all the rows, then we insert them fresh.
 * We'll be doing it in a transaction, so this is safe.
 * Better to pay the small performance overhead than to complicate things by trying to do targeted upserts.
 */
export const materializeJunctionTable = <R1, E1, R2, E2>(input: {
  deleteRows: Effect.Effect<void, E1, R1>
  insertRows: Effect.Effect<void, E2, R2>
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    yield* sql.withTransaction(Effect.all([input.deleteRows, input.insertRows]))
  })
