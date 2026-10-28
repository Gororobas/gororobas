import {
  applyModerationDecision,
  ModerationResult,
  ModerationStatus,
  Policies,
  TimestampColumn,
  type ModeratedContentType,
  type ModerationDecision,
} from "@gororobas/domain"
import { DateTime, Effect, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

/** Aggregate tables that keep their content's `moderation_status`. */
const MODERATED_TABLES = {
  PUBLICATION: "publication_sources",
  PUBLICATION_COMMENT: "publication_comments",
  MEDIA_ASSET: "media_assets",
} as const satisfies Record<ModeratedContentType, string>

const ModerationTarget = Schema.Struct({ id: Schema.String })
const ModerationStatusRow = Schema.Struct({ moderationStatus: ModerationStatus })

/** Writes a moderation status without authorization; services go through `moderateContent`. */
export const updateModerationStatus = (input: {
  readonly contentType: ModeratedContentType
  readonly id: string
  readonly moderationStatus: ModerationStatus
  readonly updatedAt: DateTime.Utc
}) =>
  SqlClient.SqlClient.use((sql) =>
    SqlSchema.void({
      Request: Schema.Struct({
        ...ModerationTarget.fields,
        ...ModerationStatusRow.fields,
        updatedAt: TimestampColumn,
      }),
      execute: (row) =>
        sql`UPDATE ${sql(MODERATED_TABLES[input.contentType])} SET moderation_status = ${row.moderationStatus}, updated_at = ${row.updatedAt} WHERE id = ${row.id}`,
    })(input),
  )

/**
 * Censors or reapproves a piece of content after checking the moderator's permission.
 * Fails with `notFound` when the content doesn't exist.
 */
export const moderateContent = <E>(input: {
  readonly contentType: ModeratedContentType
  readonly id: string
  readonly decision: ModerationDecision
  readonly notFound: () => E
}) =>
  SqlClient.SqlClient.use((sql) =>
    Effect.gen(function* () {
      yield* Policies.moderation.canModerateContent

      const current = yield* SqlSchema.findOneOption({
        Request: ModerationTarget,
        Result: ModerationStatusRow,
        execute: ({ id }) =>
          sql`SELECT moderation_status FROM ${sql(MODERATED_TABLES[input.contentType])} WHERE id = ${id}`,
      })({ id: input.id })

      if (Option.isNone(current)) return yield* Effect.fail(input.notFound())

      const moderationStatus = applyModerationDecision(
        current.value.moderationStatus,
        input.decision,
      )

      if (moderationStatus !== current.value.moderationStatus) {
        yield* updateModerationStatus({
          contentType: input.contentType,
          id: input.id,
          moderationStatus,
          updatedAt: yield* DateTime.now,
        })
      }

      return ModerationResult.make({ moderationStatus })
    }).pipe(sql.withTransaction),
  )
