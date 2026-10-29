import {
  applyModerationDecision,
  IdGen,
  ModerationEventId,
  ModerationEventRow,
  ModerationResult,
  ModerationStatus,
  Policies,
  TimestampColumn,
  type MediaAssetId,
  type ModeratedContentType,
  type ModerationDecision,
  type PersonId,
  type PublicationCommentId,
  type PublicationId,
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

const updateModerationStatus = (input: {
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

const insertModerationEvent = SqlSchema.void({
  Request: ModerationEventRow,
  execute: (row) =>
    SqlClient.SqlClient.use((sql) => sql`INSERT INTO moderation_events ${sql.insert(row)}`),
})

type ModeratedContent =
  | { readonly contentType: "PUBLICATION"; readonly id: PublicationId }
  | { readonly contentType: "PUBLICATION_COMMENT"; readonly id: PublicationCommentId }
  | { readonly contentType: "MEDIA_ASSET"; readonly id: MediaAssetId }

/** Which `moderation_events` column points at each kind of content. */
const eventContentColumns = (content: ModeratedContent) => ({
  publicationId: content.contentType === "PUBLICATION" ? content.id : null,
  publicationCommentId: content.contentType === "PUBLICATION_COMMENT" ? content.id : null,
  mediaAssetId: content.contentType === "MEDIA_ASSET" ? content.id : null,
})

/**
 * Applies a decision and records it in `moderation_events` when it changes the content's status,
 * without authorization: services go through `moderateContent`. None when the content doesn't
 * exist.
 */
export const recordModerationDecision = (
  input: ModeratedContent & {
    readonly decision: ModerationDecision
    readonly reason?: string | undefined
    readonly decidedById: PersonId
  },
) =>
  SqlClient.SqlClient.use((sql) =>
    Effect.gen(function* () {
      const current = yield* SqlSchema.findOneOption({
        Request: ModerationTarget,
        Result: ModerationStatusRow,
        execute: ({ id }) =>
          sql`SELECT moderation_status FROM ${sql(MODERATED_TABLES[input.contentType])} WHERE id = ${id}`,
      })({ id: input.id })

      if (Option.isNone(current)) return Option.none<ModerationResult>()

      const moderationStatus = applyModerationDecision(
        current.value.moderationStatus,
        input.decision,
      )

      if (moderationStatus !== current.value.moderationStatus) {
        const now = yield* DateTime.now

        yield* updateModerationStatus({
          contentType: input.contentType,
          id: input.id,
          moderationStatus,
          updatedAt: now,
        })

        yield* insertModerationEvent(
          ModerationEventRow.make({
            id: yield* IdGen.make(ModerationEventId),
            ...eventContentColumns(input),
            decision: input.decision,
            reason: input.reason ?? null,
            moderationStatus,
            decidedById: input.decidedById,
            decidedAt: now,
          }),
        )
      }

      return Option.some(ModerationResult.make({ moderationStatus }))
    }).pipe(sql.withTransaction),
  )

/**
 * Censors or reapproves a piece of content after checking the moderator's permission.
 * Fails with `notFound` when the content doesn't exist.
 */
export const moderateContent = <E>(
  input: ModeratedContent & {
    readonly decision: ModerationDecision
    readonly reason?: string | undefined
    readonly notFound: () => E
  },
) =>
  Effect.gen(function* () {
    yield* Policies.moderation.canModerateContent
    const session = yield* Policies.common.assertAuthenticated

    const result = yield* recordModerationDecision({
      ...input,
      decidedById: session.personId,
    })
    if (Option.isNone(result)) return yield* Effect.fail(input.notFound())
    return result.value
  })
