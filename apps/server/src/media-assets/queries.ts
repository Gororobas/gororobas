import {
  MediaAssetId,
  MediaAssetImport,
  MediaAssetRow,
  ProfileRow,
  type Session,
  WikiArticleMediaAssetRow,
} from "@gororobas/domain"
import { Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

import { publicationVisibleTo } from "../content-visibility/visible-to.js"

export const findMediaAssetById = SqlSchema.findOneOption({
  Request: MediaAssetId,
  Result: MediaAssetRow,
  execute: (id) =>
    SqlClient.SqlClient.use((sql) => sql`SELECT * FROM media_assets WHERE id = ${id}`),
})

/** Whether publications attach the media, and whether `session` can see any of them. */
export const findMediaAssetPublicationAccess = (session: Session) =>
  SqlSchema.findOne({
    Request: MediaAssetId,
    Result: Schema.Struct({
      isAttachedToPublication: Schema.BooleanFromBit,
      canViewPublication: Schema.BooleanFromBit,
    }),
    execute: (id) =>
      SqlClient.SqlClient.use(
        (sql) => sql`
      SELECT
        EXISTS (SELECT 1 FROM publication_media_assets WHERE media_asset_id = ${id})
          AS is_attached_to_publication,
        EXISTS (
          SELECT 1 FROM publication_media_assets attachment
          JOIN publication_sources source ON source.id = attachment.publication_id
          WHERE attachment.media_asset_id = ${id} AND ${publicationVisibleTo(sql, session)}
        ) AS can_view_publication`,
      ),
  })

/** Articles showing the media: in their own gallery, or as a provider's photo. */
export const listMediaAssetWikiArticles = SqlSchema.findAll({
  Request: MediaAssetId,
  Result: WikiArticleMediaAssetRow,
  execute: (id) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
      SELECT wiki_article_id, media_asset_id FROM wiki_article_media_assets WHERE media_asset_id = ${id}
      UNION
      SELECT wiki_article_id, media_asset_id FROM wiki_article_external_media WHERE media_asset_id = ${id}`,
    ),
})

export const findMediaAssetImportByUrl = SqlSchema.findOneOption({
  Request: MediaAssetImport.fields.mediaUrl,
  Result: MediaAssetImport,
  execute: (mediaUrl) =>
    SqlClient.SqlClient.use(
      (sql) => sql`SELECT * FROM media_asset_imports WHERE media_url = ${mediaUrl}`,
    ),
})

export const listMediaAssetProfiles = SqlSchema.findAll({
  Request: MediaAssetId,
  Result: ProfileRow,
  execute: (id) =>
    SqlClient.SqlClient.use(
      (sql) =>
        sql`SELECT p.* FROM profiles p WHERE photo_id = ${id} AND NOT EXISTS (SELECT 1 FROM auth_subjects a WHERE a.id = p.id AND a.active = 0)`,
    ),
})
