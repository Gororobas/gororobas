import {
  Locale,
  MediaAssetRow,
  OptionalColumn,
  TiptapDocument,
  WikiArticleQueriedPageData,
  WikiArticleTranslationProjectionRow,
  WikiArticleCrdtRow,
  WikiArticleHandleProjectionRow,
  WikiArticleId,
  WikiArticleLookup,
  WikiArticleProjectionRow,
  WikiArticleRevisionId,
  WikiArticleRevisionRow,
  WikiArticleRevisionMediaAssetRow,
} from "@gororobas/domain"
import { Handle } from "@gororobas/domain"
import { Effect, Schema } from "effect"
import { SqlSchema } from "effect/sql"
import { SqlClient } from "effect/sql/SqlClient"

export const findDatabaseRowById = SqlSchema.findOneOption({
  Request: WikiArticleId,
  Result: WikiArticleProjectionRow,
  execute: (id) => SqlClient.use((sql) => sql`SELECT * FROM wiki_articles WHERE id = ${id}`),
})

export const findDatabaseRowByHandleAndKind = SqlSchema.findOneOption({
  Request: WikiArticleLookup,
  Result: WikiArticleProjectionRow,
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

export const findDatabaseRowByHandle = SqlSchema.findOneOption({
  Request: Schema.String,
  Result: WikiArticleProjectionRow,
  execute: (handle) =>
    SqlClient.use(
      (sql) => sql`
        SELECT article.*
        FROM wiki_articles AS article
        INNER JOIN wiki_article_handles AS route
          ON route.wiki_article_id = article.id
        WHERE route.handle = ${handle}
        LIMIT 1
      `,
    ),
})

export const findWikiArticleBySearchableName = SqlSchema.findOneOption({
  Request: Schema.String,
  Result: Schema.Struct({ wikiArticleId: WikiArticleId, handle: Handle }),
  execute: (pattern) =>
    SqlClient.use(
      (sql) => sql`
        SELECT translations.wiki_article_id, route.handle
        FROM wiki_article_translations AS translations
        INNER JOIN wiki_article_handles AS route
          ON route.wiki_article_id = translations.wiki_article_id
        WHERE translations.searchable_names LIKE ${pattern}
        LIMIT 1
      `,
    ),
})

export const listDatabaseRows = SqlSchema.findAll({
  Request: Schema.Void,
  Result: WikiArticleProjectionRow,
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

export const listRevisionMediaAssets = SqlSchema.findAll({
  Request: WikiArticleRevisionId,
  Result: WikiArticleRevisionMediaAssetRow,
  execute: (id) =>
    SqlClient.use(
      (sql) => sql`SELECT * FROM wiki_article_revision_media_assets
        WHERE wiki_article_revision_id = ${id} ORDER BY media_asset_id`,
    ),
})

export const findHandleOwner = SqlSchema.findOneOption({
  Request: WikiArticleLookup,
  Result: WikiArticleHandleProjectionRow,
  execute: ({ handle, kind }) =>
    SqlClient.use(
      (sql) => sql`
        SELECT * FROM wiki_article_handles
        WHERE kind = ${kind} AND handle = ${handle}
      `,
    ),
})

export const findTranslationRows = SqlSchema.findAll({
  Request: WikiArticleId,
  Result: WikiArticleTranslationProjectionRow,
  execute: (id) =>
    SqlClient.use(
      (sql) => sql`SELECT * FROM wiki_article_translations WHERE wiki_article_id = ${id}`,
    ),
})

export const findPageByHandleAndKind = SqlSchema.findOneOption({
  Request: Schema.Struct({ ...WikiArticleLookup.fields, locale: Locale }),
  Result: WikiArticleQueriedPageData.mapMembers((members) =>
    members.map((member) =>
      Schema.Struct({
        ...member.fields,
        attributes: Schema.fromJsonString(member.fields.attributes),
        commonNames: Schema.fromJsonString(member.fields.commonNames),
        content: OptionalColumn(Schema.fromJsonString(TiptapDocument)),
        mediaAssets: Schema.Array(Schema.toType(MediaAssetRow)),
      }),
    ),
  ).pipe(Schema.decodeTo(Schema.toType(WikiArticleQueriedPageData))),
  execute: ({ handle, kind, locale }) =>
    SqlClient.use((sql) =>
      sql`
    SELECT article.*, translation.*, route.handle
    FROM wiki_articles AS article
    INNER JOIN wiki_article_handles AS route ON route.wiki_article_id = article.id
    INNER JOIN wiki_article_translations AS translation
      ON translation.wiki_article_id = article.id AND translation.kind = article.kind
    WHERE route.handle = ${handle} AND article.kind = ${kind}
    ORDER BY CASE WHEN translation.locale = ${locale} THEN 0
      WHEN translation.locale = 'en' THEN 1 WHEN translation.locale = 'es' THEN 2 ELSE 3 END
    LIMIT 1
  `.pipe(
        Effect.flatMap((rows) =>
          Effect.forEach(
            rows,
            (row) =>
              // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Raw SQL values need validation before querying media by article ID.
              Schema.decodeUnknownEffect(WikiArticleId)(row.id).pipe(
                Effect.flatMap(listWikiArticleMedia),
                Effect.map((mediaAssets) => ({ ...row, mediaAssets })),
              ),
            { concurrency: 1 },
          ),
        ),
      ),
    ),
})

export const listWikiArticleMedia = SqlSchema.findAll({
  Request: WikiArticleId,
  Result: MediaAssetRow,
  execute: (id) =>
    SqlClient.use(
      (sql) => sql`
    SELECT m.* FROM media_assets m JOIN wiki_article_media_assets a ON a.media_asset_id = m.id
    WHERE a.wiki_article_id = ${id} AND m.moderation_status <> 'CENSORED' ORDER BY m.id`,
    ),
})
