import {
  ApiPublicationCardData,
  ApiPublicationData,
  SupportedLanguage,
  WikiArticleId,
  ApiPublicationSearchParams,
  MediaAssetRow,
  ModeratedPublicationRow,
  PublicationMediaAssetRow,
  Handle,
  ProfileId,
  PublicationCommitRow,
  PublicationCrdtRow,
  PublicationId,
  PublicationPageData,
  PublicationRow,
} from "@gororobas/domain"
import { GetPublicationPageParams } from "@gororobas/domain/publications/api"
import { Schema, Struct } from "effect"
import { SqlSchema } from "effect/sql"
import { SqlClient } from "effect/sql/SqlClient"

/** Includes censored publications: `assertCanViewPublication` decides who can still see them. */
export const searchPublicationRows = SqlSchema.findAll({
  Request: ApiPublicationSearchParams,
  Result: ModeratedPublicationRow,
  execute: (query) => {
    const textPattern =
      query.text === undefined ? undefined : `%${query.text.replace(/[\\%_]/g, "\\$&")}%`

    return SqlClient.use(
      (sql) => sql`
    SELECT publications.*, publication_crdts.moderation_status FROM publications
    JOIN publication_crdts ON publication_crdts.id = publications.id
    WHERE ${sql.and([
      ...(query.ownerProfileId === undefined
        ? []
        : [sql`publications.owner_profile_id = ${query.ownerProfileId}`]),
      ...(query.kind === undefined ? [] : [sql`publications.kind = ${query.kind}`]),
      ...(query.wikiArticleId === undefined
        ? []
        : [
            sql`EXISTS (SELECT 1 FROM publication_wiki_articles linked
              WHERE linked.publication_id = publications.id
                AND linked.wiki_article_id = ${query.wikiArticleId})`,
          ]),
      ...(query.visibility === undefined
        ? []
        : [sql`publications.visibility = ${query.visibility}`]),
      ...(textPattern === undefined
        ? []
        : [
            sql`(
        publications.handle LIKE ${textPattern} ESCAPE '\\'
        OR EXISTS (
          SELECT 1 FROM publication_translations AS translation
          WHERE translation.publication_id = publications.id
            AND translation.content_plain_text LIKE ${textPattern} ESCAPE '\\'
        )
      )`,
          ]),
    ])}
    ORDER BY publications.published_at DESC, publications.id
  `,
    )
  },
})

const PublicationCardContentRow = Schema.Struct({
  content: Schema.fromJsonString(ApiPublicationCardData.fields.content),
  language: ApiPublicationCardData.fields.language,
  originalLanguage: ApiPublicationCardData.fields.originalLanguage,
  owner: Schema.fromJsonString(ApiPublicationCardData.fields.owner),
  conceptIds: Schema.fromJsonString(Schema.Array(WikiArticleId)),
})

/** The card's translation that best matches `language`, its owner and the CONCEPT articles it's about. */
export const findPublicationCardContent = SqlSchema.findOneOption({
  Request: Schema.Struct({ id: PublicationId, language: SupportedLanguage }),
  Result: PublicationCardContentRow,
  execute: ({ id, language }) =>
    SqlClient.use(
      (sql) => sql`
      SELECT t.content, t.language, t.original_language,
        json_object('id', owner.id, 'type', owner.type, 'handle', owner.handle, 'name', owner.name,
          'location', owner.location, 'photoId', photo.id) AS owner,
        (SELECT json_group_array(DISTINCT linked.wiki_article_id)
          FROM publication_wiki_articles linked
          JOIN wiki_articles article ON article.id = linked.wiki_article_id
          WHERE linked.publication_id = p.id AND article.kind = 'CONCEPT') AS concept_ids
      FROM publications p
      JOIN profiles owner ON owner.id = p.owner_profile_id
      LEFT JOIN media_assets photo ON photo.id = owner.photo_id AND photo.moderation_status <> 'CENSORED'
      JOIN publication_translations t ON t.publication_id = p.id AND t.language = (
        SELECT preferred.language FROM publication_translations preferred
        WHERE preferred.publication_id = p.id
        ORDER BY CASE preferred.language WHEN ${language} THEN 1 WHEN 'en' THEN 2 WHEN 'pt' THEN 3
          WHEN 'es' THEN 4 ELSE 5 END
        LIMIT 1)
      WHERE p.id = ${id}
    `,
    ),
})

export const listPublicationCommitRowsByPublicationIdAsc = SqlSchema.findAll({
  Request: PublicationId,
  Result: PublicationCommitRow,
  execute: (publicationId) =>
    SqlClient.use(
      (sql) => sql`
      SELECT * FROM publication_commits
      WHERE publication_id = ${publicationId}
      ORDER BY created_at ASC
    `,
    ),
})

export const listPublicationContributorIdsByPublicationId = SqlSchema.findAll({
  Request: PublicationId,
  Result: Schema.Struct({ createdById: Schema.NullOr(ProfileId) }),
  execute: (publicationId) =>
    SqlClient.use(
      (sql) => sql`
      SELECT DISTINCT created_by_id FROM publication_commits
      WHERE publication_id = ${publicationId} AND created_by_id IS NOT NULL
    `,
    ),
})

export const listPublicationRowsByOwnerProfileId = SqlSchema.findAll({
  Request: ProfileId,
  Result: PublicationRow,
  execute: (ownerProfileId) =>
    SqlClient.use(
      (sql) => sql`
      SELECT * FROM publications
      WHERE owner_profile_id = ${ownerProfileId}
      ORDER BY updated_at DESC
    `,
    ),
})

export const countPublicationRowsByOwnerProfileId = SqlSchema.findOne({
  Request: ProfileId,
  Result: Schema.Struct({ count: Schema.Number }),
  execute: (ownerProfileId) =>
    SqlClient.use(
      (sql) => sql`
      SELECT COUNT(*) as count FROM publications WHERE owner_profile_id = ${ownerProfileId}
    `,
    ),
})

export const findPublicationPageData = SqlSchema.findOneOption({
  execute: (req) =>
    SqlClient.use(
      (sql) => sql`
      WITH
      target_publication AS (
        SELECT * FROM publications WHERE handle = ${req.handle} LIMIT 1
      ),
      best_translation AS (
        SELECT
          pt.publication_id,
          pt.language,
          pt.original_language,
          pt.content,
          ROW_NUMBER() OVER (
            ORDER BY CASE pt.language
              WHEN ${req.language} THEN 1
              WHEN 'en' THEN 2
              WHEN 'pt' THEN 3
              WHEN 'es' THEN 4
              ELSE 5
            END
          ) AS priority_rank
        FROM publication_translations pt
        INNER JOIN target_publication ON target_publication.id = pt.publication_id
      ),
      aggregated_wiki_articles AS (
        SELECT JSON_GROUP_ARRAY(JSON_OBJECT(
          'wikiArticleId', pv.wiki_article_id,
          'source', pv.source,
          'evidence', json(pv.evidence)
        )) AS wiki_articles
        FROM publication_wiki_articles pv
        INNER JOIN target_publication ON target_publication.id = pv.publication_id
      )
      SELECT
        p.id,
        p.current_crdt_frontier,
        p.handle,
        p.visibility,
        p.published_at,
        p.updated_at,
        p.owner_profile_id,
        p.kind,
        p.start_date,
        p.end_date,
        p.location_or_url,
        p.attendance_mode,
        t.language,
        t.original_language,
        t.content,
        linked.wiki_articles
      FROM target_publication p
      LEFT JOIN best_translation t ON t.priority_rank = 1
      LEFT JOIN aggregated_wiki_articles linked ON TRUE
    `,
    ),
  Request: GetPublicationPageParams,
  Result: PublicationPageData,
})

export const findPublicationRowById = SqlSchema.findOneOption({
  Request: PublicationId,
  Result: ModeratedPublicationRow,
  execute: (id) =>
    SqlClient.use(
      (sql) => sql`
      SELECT p.*, c.moderation_status FROM publications p
      JOIN publication_crdts c ON c.id = p.id
      WHERE p.id = ${id}`,
    ),
})

export const findPublicationRowByHandle = SqlSchema.findOneOption({
  Request: Handle,
  Result: ModeratedPublicationRow,
  execute: (handle) =>
    SqlClient.use(
      (sql) => sql`
      SELECT p.*, c.moderation_status FROM publications p
      JOIN publication_crdts c ON c.id = p.id
      WHERE p.handle = ${handle}`,
    ),
})

export const findPublicationCrdtSnapshotById = SqlSchema.findOneOption({
  Request: PublicationId,
  Result: PublicationCrdtRow.mapFields(Struct.pick(["crdtSnapshot"])),
  execute: (id) =>
    SqlClient.use((sql) => sql`SELECT crdt_snapshot FROM publication_crdts WHERE id = ${id}`),
})

export const findPublicationApiData = SqlSchema.findOneOption({
  Request: PublicationId,
  Result: ApiPublicationData,
  execute: (id) =>
    SqlClient.use(
      (sql) => sql` 
    SELECT p.*, t.content, t.language FROM publications p
    JOIN publication_translations t ON t.publication_id = p.id
    WHERE p.id = ${id}
    ORDER BY CASE t.language WHEN 'pt' THEN 0 WHEN 'en' THEN 1 ELSE 2 END LIMIT 1
  `,
    ),
})

export const listPublicationMediaAssets = SqlSchema.findAll({
  Request: PublicationMediaAssetRow.fields.publicationId,
  Result: MediaAssetRow,
  execute: (id) =>
    SqlClient.use(
      (sql) => sql`
    SELECT m.* FROM media_assets m JOIN publication_media_assets a ON a.media_asset_id = m.id
    WHERE a.publication_id = ${id} AND m.moderation_status <> 'CENSORED' ORDER BY m.id`,
    ),
})

export const listPublicationMediaAttachments = SqlSchema.findAll({
  Request: PublicationId,
  Result: PublicationMediaAssetRow,
  execute: (id) =>
    SqlClient.use(
      (sql) => sql`SELECT * FROM publication_media_assets WHERE publication_id = ${id}`,
    ),
})
