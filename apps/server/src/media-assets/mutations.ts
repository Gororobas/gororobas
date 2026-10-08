import { MediaAssetCredit, MediaAssetRow } from "@gororobas/domain"
import { Struct } from "effect"
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

export const moderateMediaAsset = SqlSchema.void({
  Request: MediaAssetRow.members[0].mapFields((fields) => ({
    ...Struct.pick(fields, ["id", "updatedAt"]),
    moderationStatus: fields.moderationStatus.pick(["CENSORED", "REAPPROVED_AFTER_CENSORING"]),
  })),
  execute: (row) =>
    SqlClient.SqlClient.use(
      (sql) =>
        sql`UPDATE media_assets SET moderation_status = ${row.moderationStatus}, updated_at = ${row.updatedAt}
        WHERE id = ${row.id} AND moderation_status <> ${row.moderationStatus}`,
    ),
})

export const updateMediaAssetDescriptions = SqlSchema.void({
  Request: MediaAssetRow,
  execute: (row) =>
    SqlClient.SqlClient.use(
      (sql) =>
        sql`UPDATE media_assets SET category = ${row.category}, descriptions = ${row.descriptions},
        updated_at = ${row.updatedAt} WHERE id = ${row.id}`,
    ),
})
