import {
  CommentCommitRow,
  CommentCrdtRow,
  CommentId,
  CommentRow,
  CommentTranslationRow,
} from "@gororobas/domain"
import { Schema, Struct } from "effect"
import { SqlSchema } from "effect/sql"
import { SqlClient } from "effect/sql/SqlClient"

export const deleteComment = SqlSchema.void({
  Request: CommentId,
  execute: (commentId) =>
    SqlClient.use((sql) => sql`DELETE FROM comment_crdts WHERE id = ${commentId}`),
})

export const insertCommentCrdtRow = SqlSchema.void({
  Request: CommentCrdtRow,
  execute: (row) => SqlClient.use((sql) => sql`INSERT INTO comment_crdts ${sql.insert(row)}`),
})

export const insertCommentCommitRow = SqlSchema.void({
  Request: CommentCommitRow,
  execute: (row) => SqlClient.use((sql) => sql`INSERT INTO comment_commits ${sql.insert(row)}`),
})

export const insertCommentTranslationRows = SqlSchema.void({
  Request: Schema.Array(CommentTranslationRow),
  execute: (rows) =>
    SqlClient.use((sql) => sql`INSERT INTO comment_translations ${sql.insert(rows)}`),
})

export const updateCommentCrdtRow = SqlSchema.void({
  Request: CommentCrdtRow.mapFields(
    Struct.omit([
      "createdAt",
      "moderationStatus",
      "ownerProfileId",
      "parentCommentId",
      "publicationId",
    ]),
  ),
  execute: ({ id, ...update }) =>
    SqlClient.use((sql) => sql`UPDATE comment_crdts SET ${sql.update(update)} WHERE id = ${id}`),
})

export const upsertCommentRow = SqlSchema.void({
  Request: CommentRow,
  execute: (row) =>
    SqlClient.use(
      (sql) => sql`
      INSERT INTO comments ${sql.insert(row)}
      ON CONFLICT(id) DO UPDATE SET ${sql.update(row, [
        "id",
        "createdAt",
        "publicationId",
        "parentCommentId",
        "ownerProfileId",
      ])}
    `,
    ),
})
