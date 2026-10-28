import {
  BookmarkState,
  LoroDocFrontier,
  MediaAssetId,
  PersonId,
  TimestampColumn,
  WikiArticleRevisionId,
  WikiArticleId,
  WikiArticleMediaAssetRow,
  WikiArticleSourceRow,
  WikiArticleHandleProjectionRow,
  WikiArticleProjectionRow,
  type LinkSource,
  WikiArticleRelationRow,
  WikiArticleRevisionInsertRow,
  WikiArticleRevisionMediaAssetRow,
  WikiArticleRevisionUpdateRow,
  WikiArticleTranslationProjectionRow,
} from "@gororobas/domain"
import { Effect, Array as EffectArray, Schema } from "effect"
import { SqlSchema } from "effect/sql"
import { SqlClient } from "effect/sql/SqlClient"

import { persistProjectionJunctionTables } from "../common/table-projection.js"

export const insertSourceRow = SqlSchema.void({
  Request: WikiArticleSourceRow,
  execute: (row) =>
    SqlClient.use((sql) => sql`INSERT INTO wiki_article_sources ${sql.insert(row)}`),
})

export const insertRevisionRow = SqlSchema.void({
  Request: WikiArticleRevisionInsertRow,
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

export const insertRelationRows = SqlSchema.void({
  Request: Schema.Array(WikiArticleRelationRow),
  execute: EffectArray.match({
    onEmpty: () => Effect.void,
    onNonEmpty: (rows) =>
      SqlClient.use((sql) => sql`INSERT INTO wiki_article_relations ${sql.insert(rows)}`),
  }),
})

/**
 * Replaces the CRDT snapshot only while the projection still holds `expectedCrdtFrontier`,
 * or still has no projection when it's `None` (a first approval).
 * `None` as a result means another write landed first, a second line of defence behind the in-transaction read.
 */
export const updateSourceRow = SqlSchema.findOneOption({
  Request: Schema.Struct({
    ...WikiArticleSourceRow.fields,
    expectedCrdtFrontier: Schema.OptionFromNullOr(Schema.fromJsonString(LoroDocFrontier)),
  }),
  Result: Schema.Struct({ id: WikiArticleId }),
  execute: ({ id, createdAt: _, expectedCrdtFrontier, ...update }) =>
    SqlClient.use(
      (sql) => sql`
        UPDATE wiki_article_sources SET ${sql.update(update)}
        WHERE id = ${id} AND (
          SELECT current_crdt_frontier FROM wiki_article_projections WHERE id = ${id}
        ) IS ${expectedCrdtFrontier}
        RETURNING id
      `,
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
        INSERT INTO wiki_article_projections ${sql.insert(row)}
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

export const removeUnselectedWikiArticleMedia = SqlSchema.void({
  Request: Schema.Struct({
    wikiArticleId: WikiArticleId,
    selectedMediaAssetIds: Schema.Array(MediaAssetId),
  }),
  execute: ({ wikiArticleId, selectedMediaAssetIds }) =>
    SqlClient.use(
      (sql) => sql`
        DELETE FROM wiki_article_media_assets
        WHERE wiki_article_id = ${wikiArticleId}
        ${EffectArray.match(selectedMediaAssetIds, {
          onEmpty: () => sql``,
          onNonEmpty: (ids) => sql`AND media_asset_id NOT IN ${sql.in(ids)}`,
        })}
      `,
    ),
})

/** Copies the category and descriptions a revision chose onto its selected media assets. */
export const applyRevisionMediaDetails = SqlSchema.void({
  Request: Schema.Struct({ revisionId: WikiArticleRevisionId, updatedAt: TimestampColumn }),
  execute: ({ revisionId, updatedAt }) =>
    SqlClient.use(
      (sql) => sql`
        UPDATE media_assets SET
          category = CASE
            WHEN (
              SELECT selection.has_category_override FROM wiki_article_revision_media_assets selection
              WHERE selection.wiki_article_revision_id = ${revisionId} AND selection.media_asset_id = media_assets.id
            ) THEN (
              SELECT selection.category FROM wiki_article_revision_media_assets selection
              WHERE selection.wiki_article_revision_id = ${revisionId} AND selection.media_asset_id = media_assets.id
            )
            ELSE category
          END,
          descriptions = COALESCE((
            SELECT selection.descriptions FROM wiki_article_revision_media_assets selection
            WHERE selection.wiki_article_revision_id = ${revisionId} AND selection.media_asset_id = media_assets.id
          ), descriptions),
          updated_at = ${updatedAt}
        WHERE id IN (
          SELECT media_asset_id FROM wiki_article_revision_media_assets
          WHERE wiki_article_revision_id = ${revisionId}
        )
      `,
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

/** Replaces the relations a single source found, leaving other sources' relations untouched. */
export const replaceRelations = Effect.fn("replaceRelations")(function* <
  Source extends LinkSource,
>(input: {
  wikiArticleId: WikiArticleId
  source: Source
  rows: ReadonlyArray<Extract<WikiArticleRelationRow, { readonly source: Source }>>
}) {
  const sql = yield* SqlClient

  yield* persistProjectionJunctionTables({
    deleteRows: sql`
        DELETE FROM wiki_article_relations
        WHERE wiki_article_id = ${input.wikiArticleId} AND source = ${input.source}
      `,
    insertRows: insertRelationRows(
      input.rows.filter(
        (row) =>
          row.wikiArticleId === input.wikiArticleId &&
          row.relatedWikiArticleId !== input.wikiArticleId,
      ),
    ),
  })
})
