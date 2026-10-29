import { BookmarkState, PersonId, WikiArticleId } from "@gororobas/domain"
import { Effect, FileSystem, Schema, Record } from "effect"

import { GelClient } from "./gel-client.js"
import { IngestionError } from "./ingestion-error.js"
import { archiveGelResult } from "./preview-exports.js"
import { MigrationContext } from "./services/migration-context.js"

const statuses = {
  QUERO_CULTIVAR: "INTERESTED",
  ESTOU_CULTIVANDO: "ACTIVE",
  JA_CULTIVEI: "PREVIOUSLY_ACTIVE",
  SEM_INTERESSE: "INDIFFERENT",
} as const

const GelBookmark = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals(Record.keys(statuses)),
  user_profile: Schema.Struct({ id: Schema.String }),
  vegetable: Schema.Struct({ id: Schema.String }),
})

export const MigratedBookmark = Schema.Struct({
  sourceId: Schema.String,
  personId: PersonId,
  wikiArticleId: WikiArticleId,
  state: BookmarkState,
})

export const sourceGelBookmarks = Effect.gen(function* () {
  const client = yield* GelClient
  const context = yield* MigrationContext
  const fs = yield* FileSystem.FileSystem

  const rows = yield* client
    .use((gel) =>
      gel.query("select UserWishlist { id, status, user_profile: { id }, vegetable: { id } }"),
    )
    .pipe(
      Effect.tap(archiveGelResult("bookmarks")),
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(GelBookmark))),
    )

  const bookmarks = yield* Effect.forEach(
    rows,
    (row) =>
      Effect.gen(function* () {
        const state = Record.toEntries(statuses).find(([status]) => status === row.status)?.[1]

        if (!state) {
          return yield* new IngestionError({ message: `Unknown bookmark status ${row.status}` })
        }

        return {
          sourceId: row.id,
          personId: PersonId.make(yield* context.resolveId(row.user_profile.id, "Profile")),
          wikiArticleId: WikiArticleId.make(
            yield* context.resolveId(row.vegetable.id, "WikiArticle"),
          ),
          state,
        }
      }),
    { concurrency: 1 },
  )

  yield* fs.writeFileString(
    new URL("../debug/bookmarks.json", import.meta.url).pathname,
    yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Array(MigratedBookmark), { space: 2 }))(
      bookmarks,
    ),
  )
})
