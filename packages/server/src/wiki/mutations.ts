import {
  WikiArticleCrdtRow,
  WikiArticleHandleMaterializedRow,
  WikiArticleMaterializedRow,
  WikiArticleRevisionRow,
  WikiArticleRevisionUpdateRow,
  WikiArticleTranslationMaterializedRow,
} from "@gororobas/domain"
import { Effect, Array as EffectArray, Schema } from "effect"
import { SqlSchema } from "effect/unstable/sql"
import { SqlClient } from "effect/unstable/sql/SqlClient"

export const insertCrdtRow = SqlSchema.void({
  Request: WikiArticleCrdtRow,
  execute: (row) => SqlClient.use((sql) => sql`INSERT INTO wiki_article_crdts ${sql.insert(row)}`),
})

export const insertRevisionRow = SqlSchema.void({
  Request: WikiArticleRevisionRow,
  execute: (row) =>
    SqlClient.use((sql) => sql`INSERT INTO wiki_article_revisions ${sql.insert(row)}`),
})

export const updateCrdtRow = SqlSchema.void({
  Request: WikiArticleCrdtRow,
  execute: ({ id, createdAt: _, ...update }) =>
    SqlClient.use(
      (sql) => sql`UPDATE wiki_article_crdts SET ${sql.update(update)} WHERE id = ${id}`,
    ),
})

export const updateRevisionRow = SqlSchema.void({
  Request: WikiArticleRevisionUpdateRow,
  execute: ({ id, ...update }) =>
    SqlClient.use(
      (sql) => sql`UPDATE wiki_article_revisions SET ${sql.update(update)} WHERE id = ${id}`,
    ),
})

export const upsertArticleRow = SqlSchema.void({
  Request: WikiArticleMaterializedRow,
  execute: (row) =>
    SqlClient.use(
      (sql) => sql`
        INSERT INTO wiki_articles ${sql.insert(row)}
        ON CONFLICT(id) DO UPDATE SET ${sql.update(row, ["id", "createdAt"])}
      `,
    ),
})

export const insertTranslationRows = SqlSchema.void({
  Request: Schema.Array(WikiArticleTranslationMaterializedRow),
  execute: EffectArray.match({
    onEmpty: () => Effect.void,
    onNonEmpty: (rows) =>
      SqlClient.use((sql) => sql`INSERT INTO wiki_article_translations ${sql.insert(rows)}`),
  }),
})

export const insertHandleRows = SqlSchema.void({
  Request: Schema.Array(WikiArticleHandleMaterializedRow),
  execute: EffectArray.match({
    onEmpty: () => Effect.void,
    onNonEmpty: (rows) =>
      SqlClient.use((sql) => sql`INSERT INTO wiki_article_handles ${sql.insert(rows)}`),
  }),
})
