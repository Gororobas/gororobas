import { MediaAssetCredit, MediaAssetRow } from "@gororobas/domain"
import { SqlClient, SqlSchema } from "effect/sql"

export const insertMediaAsset = SqlSchema.void({
  Request: MediaAssetRow,
  execute: (row) =>
    SqlClient.SqlClient.use((sql) => sql`INSERT INTO media_assets ${sql.insert(row)}`),
})

export const insertMediaAssetCredit = SqlSchema.void({
  Request: MediaAssetCredit,
  execute: (row) =>
    SqlClient.SqlClient.use((sql) => sql`INSERT INTO media_asset_credits ${sql.insert(row)}`),
})

export const censorMediaAsset = SqlSchema.void({
  Request: MediaAssetRow,
  execute: (row) =>
    SqlClient.SqlClient.use(
      (sql) =>
        sql`UPDATE media_assets SET moderation_status = 'CENSORED', updated_at = ${row.updatedAt} WHERE id = ${row.id}`,
    ),
})
