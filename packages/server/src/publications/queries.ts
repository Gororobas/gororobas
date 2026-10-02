import {
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
import { SqlSchema } from "effect/unstable/sql"
import { SqlClient } from "effect/unstable/sql/SqlClient"

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
          pt.locale,
          pt.original_locale,
          pt.content,
          ROW_NUMBER() OVER (
            ORDER BY CASE pt.locale
              WHEN ${req.locale} THEN 1
              WHEN 'en' THEN 2
              WHEN 'pt' THEN 3
              WHEN 'es' THEN 4
              ELSE 5
            END
          ) AS priority_rank
        FROM publication_translations pt
        INNER JOIN target_publication ON target_publication.id = pt.publication_id
      ),
      aggregated_tags AS (
        SELECT JSON_GROUP_ARRAY(JSON_OBJECT(
          'tag_id', pt.tag_id,
          'extraction_text', pt.extraction_text
        )) AS tags
        FROM publication_tags pt
        INNER JOIN target_publication ON target_publication.id = pt.publication_id
      ),
      aggregated_wiki_articles AS (
        SELECT JSON_GROUP_ARRAY(JSON_OBJECT(
          'wiki_article_id', pv.wiki_article_id,
          'extraction_text', pv.extraction_text
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
        t.locale,
        t.original_locale,
        t.content,
        tags.tags,
        vegs.wiki_articles
      FROM target_publication p
      LEFT JOIN best_translation t ON t.priority_rank = 1
      LEFT JOIN aggregated_tags tags ON TRUE
      LEFT JOIN aggregated_wiki_articles vegs ON TRUE
    `,
    ),
  Request: GetPublicationPageParams,
  Result: PublicationPageData,
})

export const findPublicationRowById = SqlSchema.findOneOption({
  Request: PublicationId,
  Result: PublicationRow,
  execute: (id) => SqlClient.use((sql) => sql`SELECT * FROM publications WHERE id = ${id}`),
})

export const findPublicationRowByHandle = SqlSchema.findOneOption({
  Request: Handle,
  Result: PublicationRow,
  execute: (handle) =>
    SqlClient.use((sql) => sql`SELECT * FROM publications WHERE handle = ${handle}`),
})

export const findPublicationCrdtSnapshotById = SqlSchema.findOneOption({
  Request: PublicationId,
  Result: PublicationCrdtRow.mapFields(Struct.pick(["crdtSnapshot"])),
  execute: (id) =>
    SqlClient.use((sql) => sql`SELECT crdt_snapshot FROM publication_crdts WHERE id = ${id}`),
})
