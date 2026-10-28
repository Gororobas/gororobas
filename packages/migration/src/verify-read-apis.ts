import { NodeHttpClient, NodeRuntime, NodeServices } from "@effect/platform-node"
import {
  ApiPublicationCardData,
  ApiPublicationData,
  ApiPublicationHistoryEntry,
  ProfileRow,
  ProfileId,
  Handle,
  PublicationId,
  PublicationVisibility,
  MediaAssetId,
  WikiArticleQueriedCardData,
  WikiArticleQueriedPageData,
  WikiArticleRevisionRow,
  TransformedImageWidthBreakpoints,
} from "@gororobas/domain"
import { makeAppSqlClient } from "@gororobas/server/sql"
import { Config, Effect, FileSystem, Layer, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { SqlClient, SqlSchema } from "effect/sql"

import { IngestionError } from "./ingestion-error.js"

export const verifyReadApis = Effect.gen(function* () {
  const origin = yield* Config.String("MIGRATION_API_ORIGIN").pipe(
    Config.withDefault("http://127.0.0.1:4000"),
  )
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest(HttpClientRequest.prependUrl(origin)),
  )
  const sql = yield* SqlClient.SqlClient
  let requests = 0

  const response = (route: string, expectedStatus = 200) =>
    client.get(route).pipe(
      Effect.flatMap((result) =>
        Effect.gen(function* () {
          requests++

          if (result.status !== expectedStatus) {
            return yield* new IngestionError({
              message: `GET ${route}: expected ${expectedStatus}, got ${result.status}`,
            })
          }

          return result
        }),
      ),
    )

  const cards = yield* response("/wiki").pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Array(WikiArticleQueriedCardData))),
  )

  const wikiCount = yield* SqlSchema.findOne({
    Request: Schema.Void,
    Result: Schema.Struct({ count: Schema.Int }),
    execute: () =>
      sql`SELECT COUNT(*) AS count FROM wiki_article_projections WHERE status = 'PUBLISHED'`,
  })()

  if (cards.length !== wikiCount.count) {
    return yield* new IngestionError({ message: "Wiki listing count differs from imported data" })
  }

  yield* Effect.forEach(
    cards,
    (card) =>
      Effect.gen(function* () {
        const route = `/wiki/${card.kind}/${encodeURIComponent(card.handle)}`
        const page = yield* response(route).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(WikiArticleQueriedPageData)),
        )

        if (page.id !== card.id) {
          return yield* new IngestionError({
            message: `Wiki lookup returned a different ID: ${route}`,
          })
        }

        const revisions = yield* response(`${route}/revisions`).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Array(WikiArticleRevisionRow))),
        )
        if (!revisions.length || revisions.some((revision) => !revision.createdById)) {
          return yield* new IngestionError({ message: `Missing attributed history: ${route}` })
        }
      }),
    { concurrency: 4 },
  )

  const profiles = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.Struct({ id: ProfileId, handle: Handle }),
    execute: () => sql`SELECT id, handle FROM profiles WHERE visibility = 'PUBLIC'`,
  })()

  yield* Effect.forEach(
    profiles,
    (profile) =>
      Effect.gen(function* () {
        const result = yield* response(`/profiles/${encodeURIComponent(profile.handle)}`).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(ProfileRow)),
        )
        if (result.id !== profile.id) {
          return yield* new IngestionError({ message: `Profile mismatch: ${profile.handle}` })
        }
      }),
    { concurrency: 4 },
  )

  const publications = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.Struct({ id: PublicationId, handle: Handle, visibility: PublicationVisibility }),
    execute: () => sql`SELECT id, handle, visibility FROM publication_sources`,
  })()

  const publicPublications = publications.filter(
    (publication) => publication.visibility === "PUBLIC",
  )
  const listing = yield* response("/publications?pageSize=10000&currentPage=0").pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Array(ApiPublicationCardData))),
  )

  if (
    listing.length !== publicPublications.length ||
    listing.some((item) => item.visibility !== "PUBLIC")
  ) {
    return yield* new IngestionError({
      message: "Publication search omitted public data or exposed community data",
    })
  }

  yield* Effect.forEach(
    publications,
    (publication) =>
      Effect.gen(function* () {
        if (publication.visibility !== "PUBLIC") {
          yield* response(`/publications/${publication.id}`, 403)
          yield* response(`/publications/${publication.id}/history`, 403)
          return
        }

        const byId = yield* response(`/publications/${publication.id}`).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(ApiPublicationData)),
        )
        const byHandle = yield* response(
          `/publications/handle/${encodeURIComponent(publication.handle)}`,
        ).pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(ApiPublicationData)))

        const history = yield* response(`/publications/${publication.id}/history`).pipe(
          Effect.flatMap(
            HttpClientResponse.schemaBodyJson(Schema.Array(ApiPublicationHistoryEntry)),
          ),
        )

        if (byId.id !== publication.id || byHandle.id !== publication.id || !history.length) {
          return yield* new IngestionError({
            message: `Publication lookup/history mismatch: ${publication.id}`,
          })
        }
      }),
    { concurrency: 4 },
  )

  const media = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.Struct({ id: MediaAssetId }),
    execute: () =>
      sql`SELECT m.id FROM media_assets m WHERE EXISTS (SELECT 1 FROM wiki_article_media_assets a WHERE a.media_asset_id = m.id)
      OR EXISTS (SELECT 1 FROM publication_media_assets a JOIN publication_sources p ON p.id = a.publication_id JOIN people owner ON owner.id = p.owner_profile_id WHERE a.media_asset_id = m.id AND p.visibility = 'PUBLIC' AND owner.access_level <> 'NEWCOMER')
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.photo_id = m.id AND p.visibility = 'PUBLIC')`,
  })()

  yield* Effect.forEach(
    media,
    (asset) =>
      Effect.forEach(
        [
          "original/original",
          ...TransformedImageWidthBreakpoints.literals.map((width) => `images/${width}`),
        ],
        (variant) =>
          response(`/media/${asset.id}/${variant}`).pipe(
            Effect.flatMap((result) => result.arrayBuffer),
            Effect.flatMap((bytes) =>
              bytes.byteLength
                ? Effect.void
                : Effect.fail(
                    new IngestionError({ message: `Empty media: ${asset.id}/${variant}` }),
                  ),
            ),
          ),
        { concurrency: 1 },
      ),
    { concurrency: 4 },
  )

  yield* response("/wiki/bookmarks", 403)
  yield* response("/profiles/does-not-exist", 404)
  yield* response("/wiki/PLANT/does-not-exist", 404)

  const report = {
    wikiArticles: cards.length,
    profiles: profiles.length,
    publicPublications: listing.length,
    communityPublications: publications.length - listing.length,
    publicMedia: media.length,
    requests,
  }

  yield* Effect.log(
    `Verified read APIs: ${Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(report)}`,
  )
  const reportFile = yield* Config.option(Config.String("MIGRATION_API_REPORT_FILENAME"))

  if (Option.isSome(reportFile)) {
    yield* (yield* FileSystem.FileSystem).writeFileString(
      reportFile.value,
      Schema.encodeSync(Schema.fromJsonString(Schema.Unknown, { space: 2 }))(report),
    )
  }

  return report
})

if (process.argv[1] === import.meta.filename) {
  verifyReadApis.pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.unwrap(
          Effect.map(
            Config.String("APP_DB_FILENAME").pipe(
              Config.withDefault(
                new URL("../../../apps/server/gororobas.db", import.meta.url).pathname,
              ),
            ),
            (filename) => makeAppSqlClient(filename, { readonly: true }),
          ),
        ),
        NodeHttpClient.layerUndici,
        NodeServices.layer,
      ),
    ),
    NodeRuntime.runMain,
  )
}
