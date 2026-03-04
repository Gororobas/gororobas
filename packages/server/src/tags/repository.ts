/**
 * Tags repository with CRDT-based revision workflow.
 */
import { SqlClient, SqlSchema } from "@effect/sql"
import { TagId, TagRow } from "@gororobas/domain"
import { Effect, Schema } from "effect"

export class TagsRepository extends Effect.Service<TagsRepository>()("TagsRepository", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    // Materialized data queries
    const findById = SqlSchema.findOne({
      execute: (id) => sql`SELECT * FROM tags WHERE id = ${id}`,
      Request: TagId,
      Result: TagRow,
    })

    const findByHandle = SqlSchema.findOne({
      execute: (handle) => sql`SELECT * FROM tags WHERE handle = ${handle}`,
      Request: Schema.String,
      Result: TagRow,
    })

    const findAll = SqlSchema.findAll({
      execute: () => sql`SELECT * FROM tags ORDER BY handle`,
      Request: Schema.Void,
      Result: TagRow,
    })

    const findByName = SqlSchema.findOne({
      execute: (pattern) => sql`
          SELECT id, handle FROM tags
          WHERE LOWER(names) LIKE ${pattern}
          LIMIT 1
        `,
      Request: Schema.String,
      Result: Schema.Struct({
        id: TagId,
        handle: Schema.String,
      }),
    })

    return {
      // Query operations
      findById,
      findByHandle,
      findByName,
      findAll,
    } as const
  }),
}) {}
