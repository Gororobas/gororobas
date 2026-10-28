import {
  MediaAssetId,
  MediaAssetRow,
  ModeratedPublicationRow,
  ProfileRow,
  WikiArticleMediaAssetRow,
} from "@gororobas/domain"
import { SqlClient, SqlSchema } from "effect/sql"

import { selectPublicationRows } from "../publications/queries.js"

export const findMediaAssetById = SqlSchema.findOneOption({
  Request: MediaAssetId,
  Result: MediaAssetRow,
  execute: (id) =>
    SqlClient.SqlClient.use((sql) => sql`SELECT * FROM media_assets WHERE id = ${id}`),
})

export const listMediaAssetPublications = SqlSchema.findAll({
  Request: MediaAssetId,
  Result: ModeratedPublicationRow,
  execute: (id) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
    ${selectPublicationRows(sql)}
    JOIN publication_media_assets a ON a.publication_id = projection.id
    WHERE a.media_asset_id = ${id} ORDER BY projection.id`,
    ),
})

export const listMediaAssetWikiArticles = SqlSchema.findAll({
  Request: MediaAssetId,
  Result: WikiArticleMediaAssetRow,
  execute: (id) =>
    SqlClient.SqlClient.use(
      (sql) => sql`SELECT * FROM wiki_article_media_assets WHERE media_asset_id = ${id}`,
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
