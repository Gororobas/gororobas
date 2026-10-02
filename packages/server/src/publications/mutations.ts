import {
  PublicationCommitRow,
  PublicationCrdtRow,
  PublicationId,
  PublicationRow,
  PublicationTagRow,
  PublicationTranslationRow,
  PublicationWikiArticleRow,
} from "@gororobas/domain"
import { Schema, Struct } from "effect"
import { SqlSchema } from "effect/unstable/sql"
import { SqlClient } from "effect/unstable/sql/SqlClient"

export const deletePublication = SqlSchema.void({
  Request: PublicationId,
  execute: (publicationId) =>
    SqlClient.use((sql) => sql`DELETE FROM publication_crdts WHERE id = ${publicationId}`),
})

export const insertPublicationCommitRow = SqlSchema.void({
  Request: PublicationCommitRow,
  execute: (row) => SqlClient.use((sql) => sql`INSERT INTO publication_commits ${sql.insert(row)}`),
})

export const insertPublicationCrdtRow = SqlSchema.void({
  Request: PublicationCrdtRow,
  execute: (row) => SqlClient.use((sql) => sql`INSERT INTO publication_crdts ${sql.insert(row)}`),
})

export const insertPublicationTranslationRows = SqlSchema.void({
  Request: Schema.Array(PublicationTranslationRow),
  execute: (rows) =>
    SqlClient.use((sql) => sql`INSERT INTO publication_translations ${sql.insert(rows)}`),
})

export const insertPublicationTagRows = SqlSchema.void({
  Request: Schema.Array(PublicationTagRow),
  execute: (rows) => SqlClient.use((sql) => sql`INSERT INTO publication_tags ${sql.insert(rows)}`),
})

export const insertPublicationWikiArticleRows = SqlSchema.void({
  Request: Schema.Array(PublicationWikiArticleRow),
  execute: (rows) =>
    SqlClient.use((sql) => sql`INSERT INTO publication_wiki_articles ${sql.insert(rows)}`),
})

export const updatePublicationCrdtRow = SqlSchema.void({
  Request: PublicationCrdtRow.mapFields(
    Struct.omit(["classification", "createdAt", "ownerProfileId"]),
  ),
  execute: ({ id, ...update }) =>
    SqlClient.use(
      (sql) => sql`UPDATE publication_crdts SET ${sql.update(update)} WHERE id = ${id}`,
    ),
})

export const upsertPublicationRow = SqlSchema.void({
  Request: PublicationRow,
  execute: (row) =>
    SqlClient.use(
      (sql) => sql`
      INSERT INTO publications ${sql.insert(row)}
      ON CONFLICT(id) DO UPDATE SET ${sql.update(row, ["id", "createdAt"])}
    `,
    ),
})
