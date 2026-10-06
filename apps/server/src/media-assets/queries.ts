import { MediaAssetId, MediaAssetRow, MediaAssetFormat } from "@gororobas/domain"
import { Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

export const findMediaAssetById = SqlSchema.findOneOption({
  Request: MediaAssetId,
  Result: MediaAssetRow,
  execute: (id) =>
    SqlClient.SqlClient.use((sql) => sql`SELECT * FROM media_assets WHERE id = ${id}`),
})

export const findMediaAssetDeliveryById = SqlSchema.findOneOption({
  Request: MediaAssetId,
  Result: Schema.Struct({ format: MediaAssetFormat, contentType: Schema.NullOr(Schema.String) }),
  execute: (id) =>
    SqlClient.SqlClient.use(
      (sql) =>
        sql`SELECT format, content_type FROM media_assets WHERE id = ${id} AND (moderation_status IS NULL OR moderation_status <> 'CENSORED')`,
    ),
})
