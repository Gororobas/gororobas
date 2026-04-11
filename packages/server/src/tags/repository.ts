import { TagId, TagRow } from "@gororobas/domain"
import { Effect, Schema, Context } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

export class TagsRepository extends Context.Service<TagsRepository>()("TagsRepository", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const findById = SqlSchema.findOneOption({
      Request: TagId,
      Result: TagRow,
      execute: (id) => sql`SELECT * FROM tags WHERE id = ${id}`,
    })

    const findByHandle = SqlSchema.findOneOption({
      execute: (handle) => sql`SELECT * FROM tags WHERE handle = ${handle}`,
      Request: Schema.String,
      Result: TagRow,
    })

    const findAll = SqlSchema.findAll({
      execute: () => sql`SELECT * FROM tags ORDER BY handle`,
      Request: Schema.Void,
      Result: TagRow,
    })

    const findByName = SqlSchema.findOneOption({
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

    const insertRow = SqlSchema.void({
      Request: TagRow,
      execute: (tag) => sql`
        INSERT INTO tags ${sql.insert(tag)}
      `,
    })

    return {
      // Query operations
      findById,
      findByHandle,
      findByName,
      findAll,
      insertRow,
    } as const
  }),
}) {}
