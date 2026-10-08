import {
  PublicationCommentContentRevisionRow,
  PublicationCommentId,
  PublicationCommentData,
  PublicationCommentTranslationRow,
  SupportedLanguage,
  PublicationId,
  TiptapDocument,
} from "@gororobas/domain"
import { Schema } from "effect"
import { SqlSchema } from "effect/sql"
import { SqlClient } from "effect/sql/SqlClient"

export const findPublicationCommentRowById = SqlSchema.findOneOption({
  Request: PublicationCommentId,
  Result: PublicationCommentData,
  execute: (id) =>
    SqlClient.use(
      (sql) => sql`SELECT publication_comments.*,
      (SELECT id FROM publication_comment_content_revisions WHERE publication_comment_id = publication_comments.id ORDER BY created_at DESC, id DESC LIMIT 1) AS current_revision_id,
      (SELECT COUNT(*) - 1 FROM publication_comment_content_revisions WHERE publication_comment_id = publication_comments.id) AS edit_count,
      CASE WHEN (SELECT COUNT(*) FROM publication_comment_content_revisions WHERE publication_comment_id = publication_comments.id) > 1
        THEN (SELECT created_at FROM publication_comment_content_revisions WHERE publication_comment_id = publication_comments.id ORDER BY created_at DESC, id DESC LIMIT 1) ELSE NULL END AS edited_at
      FROM publication_comments WHERE id = ${id}`,
    ),
})

export const findPublicationCommentContentByIdAndLanguage = SqlSchema.findOneOption({
  Request: Schema.Struct({
    publicationCommentId: PublicationCommentId,
    language: SupportedLanguage,
  }),
  Result: Schema.Struct({ content: Schema.fromJsonString(TiptapDocument) }),
  execute: ({ publicationCommentId, language }) =>
    SqlClient.use(
      (sql) => sql`
      SELECT source_content AS content FROM publication_comments WHERE id = ${publicationCommentId} AND (source_language = ${language} OR source_language LIKE ${`${language}-%`})
      UNION ALL
      SELECT translation.content FROM publication_comment_translations translation
      JOIN publication_comments publication_comment ON publication_comment.id = translation.publication_comment_id AND translation.translated_at_revision_id = (SELECT id FROM publication_comment_content_revisions WHERE publication_comment_id = publication_comment.id ORDER BY created_at DESC, id DESC LIMIT 1)
      WHERE translation.publication_comment_id = ${publicationCommentId} AND translation.language = ${language} AND publication_comment.source_language <> ${language} AND publication_comment.source_language NOT LIKE ${`${language}-%`}
    `,
    ),
})

export const listPublicationCommentTranslationRowsByPublicationCommentId = SqlSchema.findAll({
  Request: PublicationCommentId,
  Result: PublicationCommentTranslationRow,
  execute: (publicationCommentId) =>
    SqlClient.use(
      (sql) =>
        sql`SELECT * FROM publication_comment_translations WHERE publication_comment_id = ${publicationCommentId}`,
    ),
})

export const listPublicationCommentContentRevisionRowsByPublicationCommentIdAsc = SqlSchema.findAll(
  {
    Request: PublicationCommentId,
    Result: PublicationCommentContentRevisionRow,
    execute: (publicationCommentId) =>
      SqlClient.use(
        (sql) => sql`
      SELECT * FROM publication_comment_content_revisions
      WHERE publication_comment_id = ${publicationCommentId}
      ORDER BY created_at ASC, id ASC
    `,
      ),
  },
)

export const listPublicationCommentRowsByPublicationId = SqlSchema.findAll({
  Request: PublicationId,
  Result: PublicationCommentData,
  execute: (publicationId) =>
    SqlClient.use(
      (sql) => sql`
      SELECT publication_comments.*,
      (SELECT id FROM publication_comment_content_revisions WHERE publication_comment_id = publication_comments.id ORDER BY created_at DESC, id DESC LIMIT 1) AS current_revision_id,
      (SELECT COUNT(*) - 1 FROM publication_comment_content_revisions WHERE publication_comment_id = publication_comments.id) AS edit_count,
      CASE WHEN (SELECT COUNT(*) FROM publication_comment_content_revisions WHERE publication_comment_id = publication_comments.id) > 1
        THEN (SELECT created_at FROM publication_comment_content_revisions WHERE publication_comment_id = publication_comments.id ORDER BY created_at DESC, id DESC LIMIT 1) ELSE NULL END AS edited_at
      FROM publication_comments
      WHERE publication_id = ${publicationId}
      ORDER BY created_at ASC, id ASC
    `,
    ),
})
