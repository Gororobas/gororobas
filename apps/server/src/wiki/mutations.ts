import {
  BookmarkState,
  PersonId,
  WikiArticleId,
  WikiArticleMediaAssetRow,
  WikiArticleCrdtRow,
  WikiArticleHandleProjectionRow,
  WikiArticleProjectionRow,
  WikiArticleRevisionRow,
  WikiArticleRevisionMediaAssetRow,
  WikiArticleRevisionUpdateRow,
  WikiArticleTranslationProjectionRow,
} from "@gororobas/domain"
import { Effect, Array as EffectArray, Schema } from "effect"
import { SqlSchema } from "effect/sql"
import { SqlClient } from "effect/sql/SqlClient"

export const insertCrdtRow = SqlSchema.void({
  Request: WikiArticleCrdtRow,
  execute: (row) => SqlClient.use((sql) => sql`INSERT INTO wiki_article_crdts ${sql.insert(row)}`),
})

export const insertRevisionRow = SqlSchema.void({
  Request: WikiArticleRevisionRow,
  execute: (row) =>
    SqlClient.use((sql) => sql`INSERT INTO wiki_article_revisions ${sql.insert(row)}`),
})

export const insertRevisionMediaAssetRows = SqlSchema.void({
  Request: Schema.Array(WikiArticleRevisionMediaAssetRow),
  execute: EffectArray.match({
    onEmpty: () => Effect.void,
    onNonEmpty: (rows) =>
      SqlClient.use(
        (sql) => sql`INSERT INTO wiki_article_revision_media_assets ${sql.insert(rows)}`,
      ),
  }),
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
  Request: WikiArticleProjectionRow,
  execute: (row) =>
    SqlClient.use(
      (sql) => sql`
        INSERT INTO wiki_articles ${sql.insert(row)}
        ON CONFLICT(id) DO UPDATE SET ${sql.update(row, ["id", "createdAt"])}
      `,
    ),
})

export const insertTranslationRows = SqlSchema.void({
  Request: Schema.Array(WikiArticleTranslationProjectionRow),
  execute: EffectArray.match({
    onEmpty: () => Effect.void,
    onNonEmpty: (rows) =>
      SqlClient.use((sql) => sql`INSERT INTO wiki_article_translations ${sql.insert(rows)}`),
  }),
})

export const insertHandleRows = SqlSchema.void({
  Request: Schema.Array(WikiArticleHandleProjectionRow),
  execute: EffectArray.match({
    onEmpty: () => Effect.void,
    onNonEmpty: (rows) =>
      SqlClient.use((sql) => sql`INSERT INTO wiki_article_handles ${sql.insert(rows)}`),
  }),
})

export const attachMediaToWikiArticle = SqlSchema.void({
  Request: WikiArticleMediaAssetRow,
  execute: (row) =>
    SqlClient.use(
      (sql) => sql`INSERT INTO wiki_article_media_assets ${sql.insert(row)} ON CONFLICT DO NOTHING`,
    ),
})

export const setBookmark = SqlSchema.void({
  Request: Schema.Struct({
    personId: PersonId,
    wikiArticleId: WikiArticleId,
    state: BookmarkState,
  }),
  execute: (row) =>
    SqlClient.use(
      (sql) => sql`
    INSERT INTO bookmarks_wiki_articles ${sql.insert(row)}
    ON CONFLICT(person_id, wiki_article_id) DO UPDATE SET state = excluded.state
  `,
    ),
})

export const removeBookmark = SqlSchema.void({
  Request: Schema.Struct({ personId: PersonId, wikiArticleId: WikiArticleId }),
  execute: ({ personId, wikiArticleId }) =>
    SqlClient.use(
      (sql) => sql`
    DELETE FROM bookmarks_wiki_articles WHERE person_id = ${personId} AND wiki_article_id = ${wikiArticleId}
  `,
    ),
})

export const setMainMedia = SqlSchema.void({
  Request: WikiArticleMediaAssetRow,
  execute: (row) =>
    SqlClient.use(
      (sql) => sql`
    INSERT INTO wiki_article_main_media ${sql.insert(row)}
    ON CONFLICT(wiki_article_id) DO UPDATE SET media_asset_id = excluded.media_asset_id
  `,
    ),
})
