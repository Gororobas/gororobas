import {
  CommentCommitRow,
  CommentCrdtRow,
  CommentId,
  CommentRow,
  CommentTranslationRow,
  SupportedLanguage,
  PublicationId,
  TiptapDocument,
} from "@gororobas/domain"
import { Schema, Struct } from "effect"
import { SqlSchema } from "effect/sql"
import { SqlClient } from "effect/sql/SqlClient"

export const findCommentRowById = SqlSchema.findOneOption({
  Request: CommentId,
  Result: CommentRow,
  execute: (id) => SqlClient.use((sql) => sql`SELECT * FROM comments WHERE id = ${id}`),
})

export const findCommentCrdtSnapshotById = SqlSchema.findOneOption({
  Request: CommentId,
  Result: CommentCrdtRow.mapFields(Struct.pick(["crdtSnapshot"])),
  execute: (id) =>
    SqlClient.use((sql) => sql`SELECT crdt_snapshot FROM comment_crdts WHERE id = ${id}`),
})

export const findCommentContentByIdAndLanguage = SqlSchema.findOneOption({
  Request: Schema.Struct({ commentId: CommentId, language: SupportedLanguage }),
  Result: Schema.Struct({ content: Schema.fromJsonString(TiptapDocument) }),
  execute: ({ commentId, language }) =>
    SqlClient.use(
      (sql) => sql`
      SELECT content FROM comment_translations
      WHERE comment_id = ${commentId} AND language = ${language}
    `,
    ),
})

export const listCommentTranslationRowsByCommentId = SqlSchema.findAll({
  Request: CommentId,
  Result: CommentTranslationRow,
  execute: (commentId) =>
    SqlClient.use((sql) => sql`SELECT * FROM comment_translations WHERE comment_id = ${commentId}`),
})

export const listCommentCommitRowsByCommentIdAsc = SqlSchema.findAll({
  Request: CommentId,
  Result: CommentCommitRow,
  execute: (commentId) =>
    SqlClient.use(
      (sql) => sql`
      SELECT * FROM comment_commits
      WHERE comment_id = ${commentId}
      ORDER BY created_at ASC
    `,
    ),
})

export const listCommentRowsByPublicationId = SqlSchema.findAll({
  Request: PublicationId,
  Result: CommentRow,
  execute: (publicationId) =>
    SqlClient.use(
      (sql) => sql`
      SELECT * FROM comments
      WHERE publication_id = ${publicationId}
      ORDER BY created_at ASC
    `,
    ),
})
