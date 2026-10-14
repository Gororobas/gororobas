import {
  BookmarkState,
  PersonId,
  SupportedLanguage,
  MediaAssetRow,
  MediaAssetId,
  WikiArticleQueriedCardData,
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
  WikiSearchParams,
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

export const listRevisionHistory = SqlSchema.findAll({
  Request: Schema.Struct({
    wikiArticleId: WikiArticleId,
    evaluation: Schema.optional(WikiArticleRevisionRow.fields.evaluation),
  }),
  Result: WikiArticleRevisionRow,
  execute: ({ wikiArticleId, evaluation }) =>
    SqlClient.use(
      (sql) => sql`
      SELECT * FROM wiki_article_revisions
      WHERE wiki_article_id = ${wikiArticleId}
        ${evaluation === undefined ? sql`` : sql`AND evaluation = ${evaluation}`}
      ORDER BY created_at ASC, rowid ASC
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
  Request: Schema.Struct({ ...WikiArticleLookup.fields, language: SupportedLanguage }),
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
  execute: ({ handle, kind, language }) =>
    SqlClient.use((sql) =>
      sql`
    SELECT article.*, translation.*, route.handle
    FROM wiki_articles AS article
    INNER JOIN wiki_article_handles AS route ON route.wiki_article_id = article.id
    INNER JOIN wiki_article_translations AS translation
      ON translation.wiki_article_id = article.id AND translation.kind = article.kind
    WHERE route.handle = ${handle} AND article.kind = ${kind} AND article.status = 'PUBLISHED'
    ORDER BY CASE WHEN translation.language = ${language} THEN 0
      WHEN translation.language = 'en' THEN 1 WHEN translation.language = 'es' THEN 2 ELSE 3 END
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

export const listPublishedCultivars = SqlSchema.findAll({
  Request: Schema.Struct({ parentPlantId: WikiArticleId, language: SupportedLanguage }),
  Result: WikiArticleProjectionRow.mapMembers((members) =>
    members.map((member) =>
      Schema.Struct({
        ...member.fields,
        commonNames: Schema.fromJsonString(WikiArticleQueriedCardData.fields.commonNames),
      }),
    ),
  ),
  execute: ({ parentPlantId, language }) =>
    SqlClient.use(
      (sql) => sql`
    SELECT a.*, t.common_names FROM wiki_articles a
    JOIN wiki_article_translations t ON t.wiki_article_id = a.id
    WHERE a.kind = 'PLANT_CULTIVAR' AND a.status = 'PUBLISHED'
      AND json_extract(a.attributes, '$.parentPlantId') = ${parentPlantId}
      AND t.language = (
        SELECT preferred.language FROM wiki_article_translations preferred WHERE preferred.wiki_article_id = a.id
        ORDER BY CASE WHEN preferred.language = ${language} THEN 0 WHEN preferred.language = 'en' THEN 1
          WHEN preferred.language = 'es' THEN 2 ELSE 3 END LIMIT 1)
    ORDER BY a.id
  `,
    ),
})

export const listBookmarks = SqlSchema.findAll({
  Request: PersonId,
  Result: Schema.Struct({ wikiArticleId: WikiArticleId, state: BookmarkState }),
  execute: (personId) =>
    SqlClient.use(
      (sql) => sql`
    SELECT b.wiki_article_id, b.state FROM bookmarks_wiki_articles b
    JOIN wiki_articles a ON a.id = b.wiki_article_id
    WHERE b.person_id = ${personId} AND a.status = 'PUBLISHED' ORDER BY b.wiki_article_id
  `,
    ),
})

export const findMainMedia = SqlSchema.findOneOption({
  Request: WikiArticleId,
  Result: MediaAssetRow,
  execute: (id) =>
    SqlClient.use(
      (sql) => sql`
    SELECT m.* FROM media_assets m JOIN wiki_article_main_media main ON main.media_asset_id = m.id
    WHERE main.wiki_article_id = ${id} AND m.moderation_status <> 'CENSORED'
  `,
    ),
})

export const listCards = SqlSchema.findAll({
  Request: SupportedLanguage,
  Result: Schema.Struct({
    ...WikiArticleQueriedCardData.fields,
    commonNames: Schema.fromJsonString(WikiArticleQueriedCardData.fields.commonNames),
    thumbnailMediaAssetId: OptionalColumn(MediaAssetId),
  }),
  execute: (language) =>
    SqlClient.use(
      (sql) => sql`
    SELECT a.id, a.kind, t.language, t.common_names,
      (SELECT h.handle FROM wiki_article_handles h WHERE h.wiki_article_id = a.id
        ORDER BY CASE WHEN h.language = t.language THEN 0 ELSE 1 END, h.handle LIMIT 1) AS handle,
      (SELECT m.id FROM wiki_article_main_media main JOIN media_assets m ON m.id = main.media_asset_id
        WHERE main.wiki_article_id = a.id AND m.moderation_status <> 'CENSORED') AS thumbnail_media_asset_id
    FROM wiki_articles a JOIN wiki_article_translations t ON t.wiki_article_id = a.id
    WHERE a.status = 'PUBLISHED'
      AND t.language = (
      SELECT preferred.language FROM wiki_article_translations preferred WHERE preferred.wiki_article_id = a.id
      ORDER BY CASE WHEN preferred.language = ${language} THEN 0 WHEN preferred.language = 'en' THEN 1
        WHEN preferred.language = 'es' THEN 2 ELSE 3 END LIMIT 1)
    ORDER BY a.id
  `,
    ),
})

export const searchCards = SqlSchema.findAll({
  Request: Schema.Struct({ search: WikiSearchParams, language: SupportedLanguage }),
  Result: Schema.Struct({
    ...WikiArticleQueriedCardData.fields,
    commonNames: Schema.fromJsonString(WikiArticleQueriedCardData.fields.commonNames),
    thumbnailMediaAssetId: OptionalColumn(MediaAssetId),
  }),
  execute: ({ search, language }) =>
    SqlClient.use((sql) => {
      const { kind, text } = search
      const plantFilters = search.kind === "PLANT" ? search : undefined
      const bookFilters = search.kind === "BOOK" ? search : undefined
      const filmFilters = search.kind === "FILM" ? search : undefined
      const entityFilters = search.kind === "NOTEWORTHY_ENTITY" ? search : undefined
      const personFilters = search.kind === "NOTEWORTHY_PERSON" ? search : undefined
      const animalFilters = search.kind === "ANIMAL" ? search : undefined
      const toolFilters = search.kind === "TOOL" ? search : undefined
      const resourceFilters = search.kind === "RESOURCE" ? search : undefined
      const contentProducerFilters = search.kind === "CONTENT_PRODUCER" ? search : undefined

      return sql`
      SELECT a.id, a.kind, t.language, t.common_names,
        (SELECT h.handle FROM wiki_article_handles h WHERE h.wiki_article_id = a.id
          ORDER BY CASE WHEN h.language = t.language THEN 0 ELSE 1 END, h.handle LIMIT 1) AS handle,
        (SELECT m.id FROM wiki_article_main_media main JOIN media_assets m ON m.id = main.media_asset_id
          WHERE main.wiki_article_id = a.id AND m.moderation_status <> 'CENSORED') AS thumbnail_media_asset_id
      FROM wiki_articles a JOIN wiki_article_translations t ON t.wiki_article_id = a.id
      WHERE a.status = 'PUBLISHED' AND t.language = (
        SELECT preferred.language FROM wiki_article_translations preferred WHERE preferred.wiki_article_id = a.id
        ORDER BY CASE WHEN preferred.language = ${language} THEN 0 WHEN preferred.language = 'en' THEN 1
          WHEN preferred.language = 'es' THEN 2 ELSE 3 END LIMIT 1)
        ${kind === undefined ? sql`` : sql`AND a.kind = ${kind}`}
        ${
          text === undefined
            ? sql``
            : sql`AND (
          instr(lower(t.searchable_names), lower(${text})) > 0
          OR instr(lower(t.content_plain_text), lower(${text})) > 0
          OR instr(lower(t.common_names), lower(${text})) > 0
          OR instr(lower((SELECT h.handle FROM wiki_article_handles h WHERE h.wiki_article_id = a.id LIMIT 1)), lower(${text})) > 0
        )`
        }
        ${plantFilters?.plantUsages === undefined ? sql`` : sql`AND EXISTS (SELECT 1 FROM json_each(a.attributes, '$.usage') WHERE value IN ${sql.in(plantFilters.plantUsages)})`}
        ${plantFilters?.plantLifecycles === undefined ? sql`` : sql`AND EXISTS (SELECT 1 FROM json_each(a.attributes, '$.lifecycles') WHERE value IN ${sql.in(plantFilters.plantLifecycles)})`}
        ${plantFilters?.plantingMethods === undefined ? sql`` : sql`AND EXISTS (SELECT 1 FROM json_each(a.attributes, '$.plantingMethods') WHERE value IN ${sql.in(plantFilters.plantingMethods)})`}
        ${plantFilters?.strata === undefined ? sql`` : sql`AND EXISTS (SELECT 1 FROM json_each(a.attributes, '$.strata') WHERE value IN ${sql.in(plantFilters.strata)})`}
        ${plantFilters?.edibleParts === undefined ? sql`` : sql`AND EXISTS (SELECT 1 FROM json_each(a.attributes, '$.edibleParts') WHERE value IN ${sql.in(plantFilters.edibleParts)})`}
        ${plantFilters?.developmentCycleMin === undefined ? sql`` : sql`AND json_extract(a.attributes, '$.developmentCycleMax') >= ${plantFilters.developmentCycleMin}`}
        ${plantFilters?.developmentCycleMax === undefined ? sql`` : sql`AND json_extract(a.attributes, '$.developmentCycleMin') <= ${plantFilters.developmentCycleMax}`}
        ${plantFilters?.heightMin === undefined ? sql`` : sql`AND json_extract(a.attributes, '$.heightMax') >= ${plantFilters.heightMin}`}
        ${plantFilters?.heightMax === undefined ? sql`` : sql`AND json_extract(a.attributes, '$.heightMin') <= ${plantFilters.heightMax}`}
        ${plantFilters?.temperatureMin === undefined ? sql`` : sql`AND json_extract(a.attributes, '$.temperatureMax') >= ${plantFilters.temperatureMin}`}
        ${plantFilters?.temperatureMax === undefined ? sql`` : sql`AND json_extract(a.attributes, '$.temperatureMin') <= ${plantFilters.temperatureMax}`}
        ${bookFilters?.publicationDateMin === undefined ? sql`` : sql`AND substr(json_extract(a.attributes, '$.publicationDate'), 1, length(substr(${bookFilters.publicationDateMin}, 1, instr(${bookFilters.publicationDateMin}, '[') - 1))) >= substr(${bookFilters.publicationDateMin}, 1, instr(${bookFilters.publicationDateMin}, '[') - 1)`}
        ${bookFilters?.publicationDateMax === undefined ? sql`` : sql`AND substr(json_extract(a.attributes, '$.publicationDate'), 1, length(substr(${bookFilters.publicationDateMax}, 1, instr(${bookFilters.publicationDateMax}, '[') - 1))) <= substr(${bookFilters.publicationDateMax}, 1, instr(${bookFilters.publicationDateMax}, '[') - 1)`}
        ${bookFilters?.pageCountMin === undefined ? sql`` : sql`AND json_extract(a.attributes, '$.pageCount') >= ${bookFilters.pageCountMin}`}
        ${bookFilters?.pageCountMax === undefined ? sql`` : sql`AND json_extract(a.attributes, '$.pageCount') <= ${bookFilters.pageCountMax}`}
        ${filmFilters?.releaseDateMin === undefined ? sql`` : sql`AND substr(json_extract(a.attributes, '$.releaseDate'), 1, length(substr(${filmFilters.releaseDateMin}, 1, instr(${filmFilters.releaseDateMin}, '[') - 1))) >= substr(${filmFilters.releaseDateMin}, 1, instr(${filmFilters.releaseDateMin}, '[') - 1)`}
        ${filmFilters?.releaseDateMax === undefined ? sql`` : sql`AND substr(json_extract(a.attributes, '$.releaseDate'), 1, length(substr(${filmFilters.releaseDateMax}, 1, instr(${filmFilters.releaseDateMax}, '[') - 1))) <= substr(${filmFilters.releaseDateMax}, 1, instr(${filmFilters.releaseDateMax}, '[') - 1)`}
        ${entityFilters?.foundedDateMin === undefined ? sql`` : sql`AND substr(json_extract(a.attributes, '$.foundedDate'), 1, length(substr(${entityFilters.foundedDateMin}, 1, instr(${entityFilters.foundedDateMin}, '[') - 1))) >= substr(${entityFilters.foundedDateMin}, 1, instr(${entityFilters.foundedDateMin}, '[') - 1)`}
        ${entityFilters?.foundedDateMax === undefined ? sql`` : sql`AND substr(json_extract(a.attributes, '$.foundedDate'), 1, length(substr(${entityFilters.foundedDateMax}, 1, instr(${entityFilters.foundedDateMax}, '[') - 1))) <= substr(${entityFilters.foundedDateMax}, 1, instr(${entityFilters.foundedDateMax}, '[') - 1)`}
        ${entityFilters?.entityTypes === undefined ? sql`` : sql`AND json_extract(a.attributes, '$.entityType') IN ${sql.in(entityFilters.entityTypes)}`}
        ${entityFilters?.dissolvedDateMin === undefined ? sql`` : sql`AND substr(json_extract(a.attributes, '$.dissolvedDate'), 1, length(substr(${entityFilters.dissolvedDateMin}, 1, instr(${entityFilters.dissolvedDateMin}, '[') - 1))) >= substr(${entityFilters.dissolvedDateMin}, 1, instr(${entityFilters.dissolvedDateMin}, '[') - 1)`}
        ${entityFilters?.dissolvedDateMax === undefined ? sql`` : sql`AND substr(json_extract(a.attributes, '$.dissolvedDate'), 1, length(substr(${entityFilters.dissolvedDateMax}, 1, instr(${entityFilters.dissolvedDateMax}, '[') - 1))) <= substr(${entityFilters.dissolvedDateMax}, 1, instr(${entityFilters.dissolvedDateMax}, '[') - 1)`}
        ${personFilters?.birthDateMin === undefined ? sql`` : sql`AND substr(json_extract(a.attributes, '$.birthDate'), 1, length(substr(${personFilters.birthDateMin}, 1, instr(${personFilters.birthDateMin}, '[') - 1))) >= substr(${personFilters.birthDateMin}, 1, instr(${personFilters.birthDateMin}, '[') - 1)`}
        ${personFilters?.birthDateMax === undefined ? sql`` : sql`AND substr(json_extract(a.attributes, '$.birthDate'), 1, length(substr(${personFilters.birthDateMax}, 1, instr(${personFilters.birthDateMax}, '[') - 1))) <= substr(${personFilters.birthDateMax}, 1, instr(${personFilters.birthDateMax}, '[') - 1)`}
        ${personFilters?.deathDateMin === undefined ? sql`` : sql`AND substr(json_extract(a.attributes, '$.deathDate'), 1, length(substr(${personFilters.deathDateMin}, 1, instr(${personFilters.deathDateMin}, '[') - 1))) >= substr(${personFilters.deathDateMin}, 1, instr(${personFilters.deathDateMin}, '[') - 1)`}
        ${personFilters?.deathDateMax === undefined ? sql`` : sql`AND substr(json_extract(a.attributes, '$.deathDate'), 1, length(substr(${personFilters.deathDateMax}, 1, instr(${personFilters.deathDateMax}, '[') - 1))) <= substr(${personFilters.deathDateMax}, 1, instr(${personFilters.deathDateMax}, '[') - 1)`}
        ${animalFilters?.animalRoles === undefined ? sql`` : sql`AND EXISTS (SELECT 1 FROM json_each(a.attributes, '$.roles') WHERE value IN ${sql.in(animalFilters.animalRoles)})`}
        ${toolFilters?.toolUsages === undefined ? sql`` : sql`AND EXISTS (SELECT 1 FROM json_each(a.attributes, '$.usage') WHERE value IN ${sql.in(toolFilters.toolUsages)})`}
        ${resourceFilters?.resourceFormats === undefined ? sql`` : sql`AND json_extract(a.attributes, '$.format') IN ${sql.in(resourceFilters.resourceFormats)}`}
        ${contentProducerFilters?.contentChannelTypes === undefined ? sql`` : sql`AND EXISTS (SELECT 1 FROM json_each(a.attributes, '$.channels') WHERE json_extract(value, '$.type') IN ${sql.in(contentProducerFilters.contentChannelTypes)})`}
      ORDER BY a.id
    `
    }),
})
