import {
  LinkInferenceRun,
  type LinkSource,
  PublicationMediaAssetRow,
  PublicationCommitRow,
  PublicationSourceRow,
  PublicationId,
  PublicationProjectionRow,
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
    SqlClient.use((sql) => sql`DELETE FROM publication_sources WHERE id = ${publicationId}`),
})

export const insertPublicationCommitRow = SqlSchema.void({
  Request: PublicationCommitRow,
  execute: (row) => SqlClient.use((sql) => sql`INSERT INTO publication_commits ${sql.insert(row)}`),
})

export const insertPublicationSourceRow = SqlSchema.void({
  Request: PublicationSourceRow,
  execute: (row) => SqlClient.use((sql) => sql`INSERT INTO publication_sources ${sql.insert(row)}`),
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
export const replacePublicationWikiArticleLinks = Effect.fn("replacePublicationWikiArticleLinks")(
  function* <Source extends LinkSource>(input: {
    publicationId: PublicationId
    source: Source
    rows: ReadonlyArray<Extract<PublicationWikiArticleRow, { readonly source: Source }>>
  }) {
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
  },
)

export const updatePublicationLinkInference = SqlSchema.void({
  Request: Schema.Struct({
    id: PublicationId,
    linkInference: Schema.fromJsonString(LinkInferenceRun),
  }),
  execute: ({ id, linkInference }) =>
    SqlClient.use(
      (sql) =>
        sql`UPDATE publication_sources SET link_inference = ${linkInference} WHERE id = ${id}`,
    ),
})

export const updatePublicationSourceRow = SqlSchema.void({
  Request: PublicationSourceRow.mapFields(Struct.pick(["id", "crdtSnapshot", "updatedAt"])),
  execute: ({ id, ...update }) =>
    SqlClient.use(
      (sql) => sql`UPDATE publication_sources SET ${sql.update(update)} WHERE id = ${id}`,
    ),
})

export const updatePublicationSourceVisibility = SqlSchema.void({
  Request: PublicationSourceRow.mapFields(Struct.pick(["id", "visibility", "updatedAt"])),
  execute: ({ id, ...update }) =>
    SqlClient.use(
      (sql) => sql`UPDATE publication_sources SET ${sql.update(update)} WHERE id = ${id}`,
    ),
})

export const upsertPublicationProjectionRow = SqlSchema.void({
  Request: PublicationProjectionRow,
  execute: (row) =>
    SqlClient.use(
      (sql) => sql`
      INSERT INTO publication_projections ${sql.insert(row)}
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
