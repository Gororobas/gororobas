import {
  BookmarkState,
  PersonId,
  SupportedLanguage,
  MediaAssetRow,
  MediaAssetId,
  RelatedWikiArticle,
  WikiArticleQueriedCardData,
  WikiArticleCommonName,
  OptionalColumn,
  TiptapDocument,
  WikiArticleQueriedPageRow,
  WikiArticleTranslationProjectionRow,
  WikiArticleSourceRow,
  WikiArticleHandleProjectionRow,
  WikiArticleId,
  WikiArticleKind,
  WikiArticleLookup,
  WikiArticleProjectionRow,
  WikiArticleRevisionId,
  WikiArticleRevisionRow,
  WikiArticleRevisionMediaAssetRow,
  WikiSearchParams,
  WikiArticleBookmarker,
  WikiArticleContributor,
  toSearchableText,
} from "@gororobas/domain"
import { Handle } from "@gororobas/domain"
import { Array as EffectArray, Effect, Option, Schema } from "effect"
import { SqlSchema } from "effect/sql"
import { SqlClient } from "effect/sql/SqlClient"

import {
  containsEveryTerm,
  fullTextQuery,
  rankBySimilarity,
  SIMILARITY_CANDIDATES,
  similarityQuery,
} from "../db/full-text-search.js"
import { orderByLanguagePreference } from "../db/language-preference.js"

export const findDatabaseRowById = SqlSchema.findOneOption({
  Request: WikiArticleId,
  Result: WikiArticleProjectionRow,
  execute: (id) =>
    SqlClient.use((sql) => sql`SELECT * FROM wiki_article_projections WHERE id = ${id}`),
})

export const findDatabaseRowByHandleAndKind = SqlSchema.findOneOption({
  Request: WikiArticleLookup,
  Result: WikiArticleProjectionRow,
  execute: ({ handle, kind }) =>
    SqlClient.use(
      (sql) => sql`
        SELECT article.*
        FROM wiki_article_projections AS article
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
        FROM wiki_article_projections AS article
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
        WHERE translations.searchable_title LIKE ${pattern} OR translations.searchable_names LIKE ${pattern}
        LIMIT 1
      `,
    ),
})

/** Every name an article goes by, for link inference to recognize; archived articles are left out. */
export const listWikiArticleAliases = SqlSchema.findAll({
  Request: Schema.Void,
  Result: Schema.Struct({
    wikiArticleId: WikiArticleId,
    kind: WikiArticleKind,
    alias: Schema.String,
  }),
  execute: () =>
    SqlClient.use(
      (sql) => sql`
        WITH aliases AS (
          SELECT translations.wiki_article_id, json_extract(name.value, '$.name') AS alias
          FROM wiki_article_translations AS translations, json_each(translations.common_names) AS name
          UNION ALL
          SELECT articles.id, name.value
          FROM wiki_article_projections AS articles,
            json_each(
              CASE WHEN articles.kind = 'PLANT_CULTIVAR' THEN
                CASE WHEN json_extract(articles.attributes, '$.scientificNames._tag') = 'Value'
                  THEN json_extract(articles.attributes, '$.scientificNames.value')
                  ELSE '[]'
                END
              ELSE json_extract(articles.attributes, '$.scientificNames') END
            ) AS name
          UNION ALL
          SELECT articles.id, name.value
          FROM wiki_article_projections AS articles, json_each(articles.attributes, '$.names') AS name
          UNION ALL
          SELECT wiki_article_id, handle FROM wiki_article_handles
        )
        SELECT DISTINCT aliases.wiki_article_id, articles.kind, aliases.alias
        FROM aliases
        INNER JOIN wiki_article_projections AS articles ON articles.id = aliases.wiki_article_id
        WHERE articles.status <> 'ARCHIVED' AND aliases.alias IS NOT NULL
      `,
    ),
})

export const listDatabaseRows = SqlSchema.findAll({
  Request: Schema.Void,
  Result: WikiArticleProjectionRow,
  execute: () =>
    SqlClient.use((sql) => sql`SELECT * FROM wiki_article_projections ORDER BY created_at ASC`),
})

export const findSourceRowById = SqlSchema.findOneOption({
  Request: WikiArticleId,
  Result: WikiArticleSourceRow,
  execute: (id) => SqlClient.use((sql) => sql`SELECT * FROM wiki_article_sources WHERE id = ${id}`),
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

export const listTranslationContents = SqlSchema.findAll({
  Request: WikiArticleId,
  Result: Schema.Struct({ content: Schema.fromJsonString(TiptapDocument) }),
  execute: (id) =>
    SqlClient.use(
      (sql) => sql`
      SELECT content FROM wiki_article_translations
      WHERE wiki_article_id = ${id} AND content IS NOT NULL
      ORDER BY language
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
  Result: WikiArticleQueriedPageRow.mapMembers((members) =>
    members.map((member) =>
      Schema.Struct({
        ...member.fields,
        attributes: Schema.fromJsonString(member.fields.attributes),
        commonNames: Schema.fromJsonString(member.fields.commonNames),
        content: OptionalColumn(Schema.fromJsonString(TiptapDocument)),
        mediaAssets: Schema.Array(Schema.toType(MediaAssetRow)),
      }),
    ),
  ).pipe(Schema.decodeTo(Schema.toType(WikiArticleQueriedPageRow))),
  execute: ({ handle, kind, language }) =>
    SqlClient.use((sql) =>
      sql`
    SELECT article.*, translation.*, route.handle
    FROM wiki_article_projections AS article
    INNER JOIN wiki_article_handles AS route ON route.wiki_article_id = article.id
    INNER JOIN wiki_article_translations AS translation
      ON translation.wiki_article_id = article.id AND translation.kind = article.kind
    WHERE route.handle = ${handle} AND article.kind = ${kind} AND article.status = 'PUBLISHED'
    ORDER BY ${orderByLanguagePreference(sql, { languageColumn: "translation.language", language })}
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
    SELECT a.*, t.common_names FROM wiki_article_projections a
    JOIN wiki_article_translations t ON t.wiki_article_id = a.id
    WHERE a.kind = 'PLANT_CULTIVAR' AND a.status = 'PUBLISHED'
      AND json_extract(a.attributes, '$.parentPlantId') = ${parentPlantId}
      AND t.language = (
        SELECT preferred.language FROM wiki_article_translations preferred WHERE preferred.wiki_article_id = a.id
        ORDER BY ${orderByLanguagePreference(sql, { languageColumn: "preferred.language", language })} LIMIT 1)
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
    JOIN wiki_article_projections a ON a.id = b.wiki_article_id
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

const QueriedCardRow = Schema.Struct({
  ...WikiArticleQueriedCardData.fields,
  commonNames: Schema.fromJsonString(WikiArticleQueriedCardData.fields.commonNames),
  scientificNames: Schema.fromJsonString(WikiArticleQueriedCardData.fields.scientificNames),
  parentPlantName: OptionalColumn(Schema.fromJsonString(WikiArticleCommonName)),
  thumbnailMediaAssetId: OptionalColumn(MediaAssetId),
})

/** Cards of published articles, each in its translation that best matches `language`. */
const publishedCardsQuery = (sql: SqlClient, language: SupportedLanguage) => sql`
  SELECT a.id, a.kind, t.language, t.common_names,
    CASE WHEN a.kind = 'PLANT' THEN coalesce(json_extract(a.attributes, '$.scientificNames'), '[]')
      ELSE '[]' END AS scientific_names,
    CASE WHEN a.kind = 'PLANT_CULTIVAR' THEN (
      SELECT json_extract(parent.common_names, '$[0]') FROM wiki_article_translations parent
      WHERE parent.wiki_article_id = json_extract(a.attributes, '$.parentPlantId')
      ORDER BY ${orderByLanguagePreference(sql, { languageColumn: "parent.language", language })} LIMIT 1)
    END AS parent_plant_name,
    (SELECT h.handle FROM wiki_article_handles h WHERE h.wiki_article_id = a.id
      ORDER BY CASE WHEN h.language = t.language THEN 0 ELSE 1 END, h.handle LIMIT 1) AS handle,
    (SELECT m.id FROM wiki_article_main_media main JOIN media_assets m ON m.id = main.media_asset_id
      WHERE main.wiki_article_id = a.id AND m.moderation_status <> 'CENSORED') AS thumbnail_media_asset_id
  FROM wiki_article_projections a JOIN wiki_article_translations t ON t.wiki_article_id = a.id
  WHERE a.status = 'PUBLISHED' AND t.language = (
    SELECT preferred.language FROM wiki_article_translations preferred WHERE preferred.wiki_article_id = a.id
    ORDER BY ${orderByLanguagePreference(sql, { languageColumn: "preferred.language", language })} LIMIT 1)
`

export const listCards = SqlSchema.findAll({
  Request: SupportedLanguage,
  Result: QueriedCardRow,
  execute: (language) =>
    SqlClient.use((sql) => sql`${publishedCardsQuery(sql, language)} ORDER BY a.id`),
})

export const listCardsByIds = SqlSchema.findAll({
  Request: Schema.Struct({
    wikiArticleIds: Schema.Array(WikiArticleId),
    language: SupportedLanguage,
  }),
  Result: QueriedCardRow,
  execute: ({ wikiArticleIds, language }) =>
    SqlClient.use(
      (sql) =>
        sql`${publishedCardsQuery(sql, language)} AND a.id IN ${sql.in(wikiArticleIds)} ORDER BY a.id`,
    ),
})

/** Cards of a plant's published cultivars, so its page can show them with their photos. */
export const listCultivarCards = SqlSchema.findAll({
  Request: Schema.Struct({ parentPlantId: WikiArticleId, language: SupportedLanguage }),
  Result: QueriedCardRow,
  execute: ({ parentPlantId, language }) =>
    SqlClient.use(
      (sql) => sql`${publishedCardsQuery(sql, language)}
        AND a.kind = 'PLANT_CULTIVAR' AND json_extract(a.attributes, '$.parentPlantId') = ${parentPlantId}
        ORDER BY a.id`,
    ),
})

const RelatedCardRow = Schema.Struct({
  ...QueriedCardRow.fields,
  links: Schema.fromJsonString(RelatedWikiArticle.fields.links),
})

/** Relations are symmetric for readers: an article lists both the articles it relates to and those relating to it. */
export const listRelatedCards = SqlSchema.findAll({
  Request: Schema.Struct({ wikiArticleId: WikiArticleId, language: SupportedLanguage }),
  Result: RelatedCardRow,
  execute: ({ wikiArticleId, language }) =>
    SqlClient.use(
      (sql) => sql`
    WITH relation_links AS (
      SELECT related_wiki_article_id AS other_id, 'OUTGOING' AS direction, source, evidence
      FROM wiki_article_relations WHERE wiki_article_id = ${wikiArticleId}
      UNION ALL
      SELECT wiki_article_id AS other_id, 'INCOMING' AS direction, source, evidence
      FROM wiki_article_relations WHERE related_wiki_article_id = ${wikiArticleId}
    )
    SELECT cards.*,
      (SELECT JSON_GROUP_ARRAY(JSON_OBJECT(
          'direction', ordered.direction,
          'source', ordered.source,
          'evidence', json(ordered.evidence)
        ))
        FROM (SELECT * FROM relation_links l WHERE l.other_id = cards.id ORDER BY l.direction DESC, l.source) ordered
      ) AS links
    FROM (${publishedCardsQuery(sql, language)}) cards
    WHERE cards.id IN (SELECT other_id FROM relation_links)
    ORDER BY cards.id
  `,
    ),
})

export const searchCards = SqlSchema.findAll({
  Request: Schema.Struct({ search: WikiSearchParams, language: SupportedLanguage }),
  Result: QueriedCardRow,
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

      const filtered = sql`
      ${publishedCardsQuery(sql, language)}
        ${kind === undefined ? sql`` : sql`AND a.kind = ${kind}`}
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
    `

      if (text === undefined) return sql`${filtered} ORDER BY a.id`

      // Any translation can match: someone reading in Portuguese may still search for "corn".
      const matching = Option.match(fullTextQuery(sql, text), {
        onNone: () => Effect.succeed([]),
        onSome: (query) => sql`
          WITH matches AS (
            SELECT wiki_article_id, searchable_title, searchable_names, searchable_content,
              fts_score(searchable_title, searchable_names, searchable_content, ${query}) AS score
            FROM wiki_article_translations
            WHERE fts_match(searchable_title, searchable_names, searchable_content, ${query})
          ),
          article_matches AS (
            SELECT wiki_article_id, max(score) AS score,
              max(searchable_title = ${toSearchableText(text)}) AS matches_title_exactly
            FROM matches
            WHERE ${containsEveryTerm(sql, {
              searchable: sql`searchable_title || ' ' || searchable_names || ' ' || searchable_content`,
              text,
            })}
            GROUP BY wiki_article_id
          )
          SELECT cards.* FROM (${filtered}) cards
          JOIN article_matches ON article_matches.wiki_article_id = cards.id
          -- BM25 adds up matches across fields, so "Feijão Jalo", also called "feijão-manteiga",
          -- would otherwise outrank the article named exactly what was searched: "Feijão".
          ORDER BY article_matches.matches_title_exactly DESC, article_matches.score DESC, cards.id
        `,
      })

      // Nothing matches a misspelled name, so look for names within a few edits of it.
      const similar = Effect.gen(function* () {
        const candidates = yield* findNameCandidates(text)

        const ids = EffectArray.dedupe(
          rankBySimilarity({
            text,
            candidates,
            words: (candidate) => `${candidate.searchableTitle} ${candidate.searchableNames}`,
            title: (candidate) => candidate.searchableTitle,
          }).map(({ wikiArticleId }) => wikiArticleId),
        )

        if (EffectArray.isReadonlyArrayEmpty(ids)) return []

        return yield* sql`
          SELECT cards.* FROM (${filtered}) cards
          JOIN json_each(${encodeIds(ids)}) ranked ON ranked.value = cards.id
          ORDER BY ranked.key
        `
      })

      return Effect.filterOrElse(
        matching,
        (rows) => !EffectArray.isReadonlyArrayEmpty(rows),
        (_rows) => similar,
      )
    }),
})

const encodeIds = Schema.encodeSync(Schema.fromJsonString(Schema.Array(WikiArticleId)))

/** Translations sharing trigrams with a search, best first, to compare their names with it. */
const findNameCandidates = SqlSchema.findAll({
  Request: Schema.String,
  Result: Schema.Struct({
    wikiArticleId: WikiArticleId,
    searchableTitle: Schema.String,
    searchableNames: Schema.String,
  }),
  execute: (text) =>
    SqlClient.use((sql) =>
      Option.match(similarityQuery(sql, text), {
        onNone: () => Effect.succeed([]),
        onSome: (query) => sql`
          WITH matches AS (
            SELECT wiki_article_id, searchable_title, searchable_names,
              fts_score(searchable_title, searchable_names, searchable_content, ${query}) AS score
            FROM wiki_article_translations
            WHERE fts_match(searchable_title, searchable_names, searchable_content, ${query})
          )
          SELECT wiki_article_id, searchable_title, searchable_names FROM matches
          ORDER BY score DESC LIMIT ${sql.literal(String(SIMILARITY_CANDIDATES))}
        `,
      }),
    ),
})

/** Public, active profiles as `ProfileCardData` JSON, for nesting in a row. */
const publicProfileCardJson = (sql: SqlClient, personIdColumn: string) => sql`
  (SELECT json_object('id', p.id, 'type', p.type, 'handle', p.handle, 'name', p.name,
      'location', p.location, 'photoId', photo.id)
    FROM profiles p
    LEFT JOIN media_assets photo ON photo.id = p.photo_id AND photo.moderation_status <> 'CENSORED'
    WHERE p.id = ${sql.literal(personIdColumn)} AND p.visibility = 'PUBLIC'
      AND NOT EXISTS (SELECT 1 FROM auth_subjects s WHERE s.id = p.id AND s.active = 0))
`

/** Like profile search, only public profiles are listed: anyone can read an article's people. */
export const listBookmarkers = SqlSchema.findAll({
  Request: WikiArticleId,
  Result: Schema.Struct({
    ...WikiArticleBookmarker.fields,
    profile: Schema.fromJsonString(WikiArticleBookmarker.fields.profile),
  }),
  execute: (wikiArticleId) =>
    SqlClient.use(
      (sql) => sql`
    SELECT * FROM (
      SELECT b.state, ${publicProfileCardJson(sql, "b.person_id")} AS profile
      FROM bookmarks_wiki_articles b
      WHERE b.wiki_article_id = ${wikiArticleId} AND b.state <> 'INDIFFERENT'
    ) WHERE profile IS NOT NULL
    ORDER BY json_extract(profile, '$.name') COLLATE NOCASE, json_extract(profile, '$.id')
  `,
    ),
})

export const listContributors = SqlSchema.findAll({
  Request: WikiArticleId,
  Result: Schema.Struct({
    ...WikiArticleContributor.fields,
    profile: Schema.fromJsonString(WikiArticleContributor.fields.profile),
  }),
  execute: (wikiArticleId) =>
    SqlClient.use(
      (sql) => sql`
    SELECT * FROM (
      SELECT ${publicProfileCardJson(sql, "r.created_by_id")} AS profile,
        COUNT(*) AS revision_count, MAX(r.created_at) AS last_contributed_at
      FROM wiki_article_revisions r
      WHERE r.wiki_article_id = ${wikiArticleId} AND r.evaluation = 'APPROVED'
        AND r.created_by_id IS NOT NULL
      GROUP BY r.created_by_id
    ) WHERE profile IS NOT NULL
    ORDER BY revision_count DESC, last_contributed_at DESC
  `,
    ),
})
