import {
  LinkInferenceRun,
  type LinkSource,
  PublicationMediaAssetRow,
  PublicationCommitRow,
  PublicationCrdtRow,
  PublicationId,
  PublicationRow,
  PublicationTranslationRow,
  PublicationWikiArticleRow,
} from "@gororobas/domain"
import { Effect, Array as EffectArray, Schema, Struct } from "effect"
import { SqlSchema } from "effect/sql"
import { SqlClient } from "effect/sql/SqlClient"

import { persistProjectionJunctionTables } from "../common/table-projection.js"

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

export const insertPublicationWikiArticleRows = SqlSchema.void({
  Request: Schema.Array(PublicationWikiArticleRow),
  execute: EffectArray.match({
    onEmpty: () => Effect.void,
    onNonEmpty: (rows) =>
      SqlClient.use((sql) => sql`INSERT INTO publication_wiki_articles ${sql.insert(rows)}`),
  }),
})

/** Replaces the links a single source found, leaving other sources' links untouched. */
export const replacePublicationWikiArticleLinks = <Source extends LinkSource>(input: {
  publicationId: PublicationId
  source: Source
  rows: ReadonlyArray<Extract<PublicationWikiArticleRow, { readonly source: Source }>>
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient

    yield* persistProjectionJunctionTables({
      deleteRows: sql`
        DELETE FROM publication_wiki_articles
        WHERE publication_id = ${input.publicationId} AND source = ${input.source}
      `,
      insertRows: insertPublicationWikiArticleRows(
        input.rows.filter((row) => row.publicationId === input.publicationId),
      ),
    })
  }).pipe(Effect.withSpan("replacePublicationWikiArticleLinks"))

export const updatePublicationLinkInference = SqlSchema.void({
  Request: Schema.Struct({
    id: PublicationId,
    linkInference: Schema.fromJsonString(LinkInferenceRun),
  }),
  execute: ({ id, linkInference }) =>
    SqlClient.use(
      (sql) => sql`UPDATE publication_crdts SET link_inference = ${linkInference} WHERE id = ${id}`,
    ),
})

export const updatePublicationCrdtRow = SqlSchema.void({
  Request: PublicationCrdtRow.mapFields(
    Struct.omit(["linkInference", "createdAt", "moderationStatus", "ownerProfileId"]),
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

export const attachMediaToPublication = SqlSchema.void({
  Request: PublicationMediaAssetRow,
  execute: (row) =>
    SqlClient.use(
      (sql) => sql`INSERT INTO publication_media_assets ${sql.insert(row)} ON CONFLICT DO NOTHING`,
    ),
})

export const deletePublicationMediaAttachments = SqlSchema.void({
  Request: PublicationId,
  execute: (publicationId) =>
    SqlClient.use(
      (sql) => sql`DELETE FROM publication_media_assets WHERE publication_id = ${publicationId}`,
    ),
})
