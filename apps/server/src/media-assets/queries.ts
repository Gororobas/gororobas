import {
  MediaAssetId,
  MediaAssetRow,
  PublicationRow,
  WikiArticleMediaAssetRow,
} from "@gororobas/domain"
import { SqlClient, SqlSchema } from "effect/sql"

export const findMediaAssetById = SqlSchema.findOneOption({
  Request: MediaAssetId,
  Result: MediaAssetRow,
  execute: (id) =>
    SqlClient.SqlClient.use((sql) => sql`SELECT * FROM media_assets WHERE id = ${id}`),
})

export const listMediaAssetPublications = SqlSchema.findAll({
  Request: MediaAssetId,
  Result: PublicationRow,
  execute: (id) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
    SELECT p.* FROM publications p JOIN publication_media_assets a ON a.publication_id = p.id
    WHERE a.media_asset_id = ${id} ORDER BY p.id`,
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
