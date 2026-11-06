import {
  CreditedMediaAssetRow,
  CreditedProfile,
  MediaAssetId,
  type MediaAssetRow,
} from "@gororobas/domain"
import { Array as EffectArray, Effect, Schema } from "effect"
import { SqlSchema } from "effect/sql"
import { SqlClient } from "effect/sql/SqlClient"

/** Public, active profiles as `CreditedProfile` JSON; null for anyone else. */
const creditedProfileJson = (sql: SqlClient, profileIdColumn: string) => sql`
  (SELECT json_object('id', p.id, 'handle', p.handle, 'name', p.name, 'photoId', photo.id)
    FROM profiles p
    LEFT JOIN media_assets photo ON photo.id = p.photo_id AND photo.moderation_status <> 'CENSORED'
    WHERE p.id = ${sql.literal(profileIdColumn)} AND p.visibility = 'PUBLIC'
      AND NOT EXISTS (SELECT 1 FROM auth_subjects s WHERE s.id = p.id AND s.active = 0))
`

const MediaCreditRow = Schema.Struct({
  mediaAssetId: MediaAssetId,
  profile: Schema.NullOr(Schema.fromJsonString(CreditedProfile)),
  creditLine: Schema.NullOr(Schema.String),
  creditUrl: Schema.NullOr(Schema.String),
})

/** Each media's credits in order. Media without credits of its own credits whoever uploaded it. */
const listMediaCredits = SqlSchema.findAll({
  Request: Schema.Array(MediaAssetId),
  Result: MediaCreditRow,
  execute: (mediaAssetIds) =>
    SqlClient.use(
      (sql) => sql`
    SELECT media_asset_id, profile, credit_line, credit_url FROM (
      SELECT c.media_asset_id, ${creditedProfileJson(sql, "c.person_id")} AS profile,
        c.credit_line, c.credit_url, c.order_index
      FROM media_asset_credits c WHERE ${sql.in("c.media_asset_id", mediaAssetIds)}
      UNION ALL
      SELECT m.id, ${creditedProfileJson(sql, "m.owner_profile_id")}, NULL, NULL, 0
      FROM media_assets m
      WHERE ${sql.in("m.id", mediaAssetIds)}
        AND NOT EXISTS (SELECT 1 FROM media_asset_credits c WHERE c.media_asset_id = m.id)
    )
    ORDER BY media_asset_id, order_index`,
    ),
})

/** Media with whom to credit for each; credits naming no one readable are left out. */
export const withMediaCredits = Effect.fn(function* (media: ReadonlyArray<MediaAssetRow>) {
  const credits = EffectArray.isReadonlyArrayNonEmpty(media)
    ? yield* listMediaCredits(media.map((asset) => asset.id))
    : []

  return media.map((asset): CreditedMediaAssetRow => ({
    ...asset,
    credits: credits.flatMap(({ mediaAssetId, ...credit }) =>
      mediaAssetId === asset.id && (credit.profile !== null || credit.creditLine !== null)
        ? [credit]
        : [],
    ),
  }))
})
