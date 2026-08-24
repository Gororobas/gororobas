import {
  WikiArticleCrdtRow,
  WikiArticleHandleMaterializedRow,
  WikiArticleId,
  WikiArticleLookup,
  WikiArticleMaterializedRow,
  WikiArticleRevisionId,
  WikiArticleRevisionRow,
} from "@gororobas/domain"
import { Schema } from "effect"
import { SqlSchema } from "effect/unstable/sql"
import { SqlClient } from "effect/unstable/sql/SqlClient"

export const findDatabaseRowById = SqlSchema.findOneOption({
  Request: WikiArticleId,
  Result: WikiArticleMaterializedRow,
  execute: (id) => SqlClient.use((sql) => sql`SELECT * FROM wiki_articles WHERE id = ${id}`),
})

export const findDatabaseRowByHandleAndKind = SqlSchema.findOneOption({
  Request: WikiArticleLookup,
  Result: WikiArticleMaterializedRow,
  execute: ({ handle, kind }) =>
    SqlClient.use(
      (sql) => sql`
        SELECT article.*
        FROM wiki_articles AS article
        INNER JOIN wiki_article_handles AS route
          ON route.wiki_article_id = article.id
        WHERE route.kind = ${kind} AND route.handle = ${handle}
      `,
    ),
})

export const listDatabaseRows = SqlSchema.findAll({
  Request: Schema.Void,
  Result: WikiArticleMaterializedRow,
  execute: () => SqlClient.use((sql) => sql`SELECT * FROM wiki_articles ORDER BY created_at ASC`),
})

export const findCrdtRowById = SqlSchema.findOneOption({
  Request: WikiArticleId,
  Result: WikiArticleCrdtRow,
  execute: (id) => SqlClient.use((sql) => sql`SELECT * FROM wiki_article_crdts WHERE id = ${id}`),
})

export const findRevisionById = SqlSchema.findOneOption({
  Request: WikiArticleRevisionId,
  Result: WikiArticleRevisionRow,
  execute: (id) =>
    SqlClient.use((sql) => sql`SELECT * FROM wiki_article_revisions WHERE id = ${id}`),
})

export const listPendingRevisionsByWikiArticleId = SqlSchema.findAll({
  Request: WikiArticleId,
  Result: WikiArticleRevisionRow,
  execute: (wikiArticleId) =>
    SqlClient.use(
      (sql) => sql`
        SELECT * FROM wiki_article_revisions
        WHERE wiki_article_id = ${wikiArticleId} AND evaluation = 'PENDING'
        ORDER BY created_at ASC
      `,
    ),
})

export const findHandleOwner = SqlSchema.findOneOption({
  Request: WikiArticleLookup,
  Result: WikiArticleHandleMaterializedRow,
  execute: ({ handle, kind }) =>
    SqlClient.use(
      (sql) => sql`
        SELECT * FROM wiki_article_handles
        WHERE kind = ${kind} AND handle = ${handle}
      `,
    ),
})
