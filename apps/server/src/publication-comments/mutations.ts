import {
  ActivePublicationCommentRow,
  PublicationCommentContentRevisionRow,
  PublicationCommentTranslationRow,
} from "@gororobas/domain"
import { Struct } from "effect"
import { SqlSchema } from "effect/sql"
import { SqlClient } from "effect/sql/SqlClient"

export const insertPublicationCommentRow = SqlSchema.void({
  Request: ActivePublicationCommentRow,
  execute: (row) =>
    SqlClient.use((sql) => sql`INSERT INTO publication_comments ${sql.insert(row)}`),
})

export const insertPublicationCommentContentRevisionRow = SqlSchema.void({
  Request: PublicationCommentContentRevisionRow,
  execute: (row) =>
    SqlClient.use(
      (sql) => sql`INSERT INTO publication_comment_content_revisions ${sql.insert(row)}`,
    ),
})

export const updatePublicationCommentRow = SqlSchema.void({
  Request: ActivePublicationCommentRow.mapFields(
    Struct.pick(["id", "sourceLanguage", "sourceContent", "updatedAt"]),
  ),
  execute: ({ id, ...update }) =>
    SqlClient.use(
      (sql) => sql`UPDATE publication_comments SET ${sql.update(update)} WHERE id = ${id}`,
    ),
})

export const upsertPublicationCommentTranslationRow = SqlSchema.void({
  Request: PublicationCommentTranslationRow,
  execute: (row) =>
    SqlClient.use(
      (sql) =>
        sql`INSERT INTO publication_comment_translations ${sql.insert(row)} ON CONFLICT(publication_comment_id, language) DO UPDATE SET ${sql.update(row, ["publicationCommentId", "language"])}`,
    ),
})

export const updatePublicationCommentLanguage = SqlSchema.void({
  Request: ActivePublicationCommentRow.mapFields(Struct.pick(["id", "sourceLanguage"])),
  execute: ({ id, sourceLanguage }) =>
    SqlClient.use(
      (sql) =>
        sql`UPDATE publication_comments SET source_language = ${sourceLanguage} WHERE id = ${id}`,
    ),
})
