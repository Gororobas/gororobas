/**
 * The one way to delete publication comments, so other people's replies keep their place: used
 * when people delete a comment and when profiles are deleted.
 */
import { isDeletedPublicationComment, ProfileId, PublicationCommentId } from "@gororobas/domain"
import { DateTime, Effect, Option, Schema } from "effect"
import { SqlError, SqlSchema } from "effect/sql"
import { SqlClient } from "effect/sql/SqlClient"

const findThreadPosition = SqlSchema.findOneOption({
  Request: PublicationCommentId,
  Result: Schema.Struct({
    parentPublicationCommentId: Schema.NullOr(PublicationCommentId),
    deletedAt: Schema.NullOr(Schema.String),
    replyCount: Schema.Int,
  }),
  execute: (id) =>
    SqlClient.use(
      (sql) => sql`
        SELECT parent_publication_comment_id, deleted_at,
          (SELECT COUNT(*) FROM publication_comments reply WHERE reply.parent_publication_comment_id = comment.id) AS reply_count
        FROM publication_comments comment WHERE id = ${id}
      `,
    ),
})

/** Removes a comment no reply remains under, then the deleted comments it was the last reply to (deleted parents). */
const removeWithEmptiedAncestors = (
  id: PublicationCommentId,
): Effect.Effect<void, SqlError.SqlError | Schema.SchemaError, SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const position = yield* findThreadPosition(id)
    yield* sql`DELETE FROM publication_comments WHERE id = ${id}`

    const parentId = Option.flatMapNullishOr(position, (row) => row.parentPublicationCommentId)
    if (Option.isNone(parentId)) return

    const parent = yield* findThreadPosition(parentId.value)
    if (Option.exists(parent, (row) => row.replyCount === 0 && isDeletedPublicationComment(row))) {
      yield* removeWithEmptiedAncestors(parentId.value)
    }
  })

/**
 * Deletes a comment. One that people replied to stays as a tombstone in their thread
 * (`DeletedPublicationCommentRow`): its owner, content, revisions and translations are wiped. One
 * without replies is removed, along with deleted comments left without any.
 */
export const deletePublicationComment = (id: PublicationCommentId) =>
  SqlClient.use((sql) =>
    Effect.gen(function* () {
      const position = yield* findThreadPosition(id)
      if (Option.isNone(position)) return

      if (position.value.replyCount === 0) return yield* removeWithEmptiedAncestors(id)

      const now = DateTime.formatIso(yield* DateTime.now)

      yield* sql`
        UPDATE publication_comments
        SET deleted_at = ${now}, updated_at = ${now}, owner_profile_id = NULL, source_language = NULL, source_content = NULL
        WHERE id = ${id}
      `

      // Their translations go with the revisions they were made from.
      yield* sql`DELETE FROM publication_comment_content_revisions WHERE publication_comment_id = ${id}`
    }).pipe(sql.withTransaction),
  )

const listPublicationCommentIdsByOwner = SqlSchema.findAll({
  Request: ProfileId,
  Result: Schema.Struct({ id: PublicationCommentId }),
  execute: (ownerProfileId) =>
    SqlClient.use(
      (sql) => sql`SELECT id FROM publication_comments WHERE owner_profile_id = ${ownerProfileId}`,
    ),
})

/** Profiles are deleted after their comments are, so other people's replies to them remain. */
export const deletePublicationCommentsOwnedBy = (ownerProfileId: ProfileId) =>
  listPublicationCommentIdsByOwner(ownerProfileId).pipe(
    Effect.flatMap((owned) =>
      Effect.forEach(owned, ({ id }) => deletePublicationComment(id), {
        concurrency: 1,
        discard: true,
      }),
    ),
  )
