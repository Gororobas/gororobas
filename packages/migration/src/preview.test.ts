import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { it } from "@effect/vitest"
import {
  MediaAssetId,
  WikiArticleEditableData,
  WikiArticleId,
  WikiPlantArticle,
} from "@gororobas/domain"
import { makeAppSqlClient } from "@gororobas/server/sql"
import { Effect, FileSystem, Layer, Option, Schema } from "effect"
import { HttpClient, HttpRouter } from "effect/http"
import { SqlClient } from "effect/sql"
import { join } from "node:path"
import { expect } from "vitest"

import { importPreview } from "./import-preview.js"
import { readPreviewDataset } from "./preview-dataset.js"
import { previewCollections } from "./preview-exports.js"
import { makePreviewRoutes } from "./preview-server.js"
import { gelVegetableNamesToCrdtList } from "./vegetables/gel-vegetable-to-wiki-plant-article.js"
import { WikiMigrationVersion, buildWikiMigrationHistory } from "./wiki-migration-history.js"

const articleId = WikiArticleId.make("01900000-0000-7000-8000-000000000001")
const article = (origin: string) =>
  WikiPlantArticle.EditableArticle.make({
    kind: "PLANT",
    attributes: Schema.decodeUnknownSync(WikiPlantArticle.EditableAttributes)({}),
    translations: {
      pt: {
        commonNames: gelVegetableNamesToCrdtList(["Test plant"]),
        origin: Option.some(origin),
        content: Option.none(),
        grammaticalGender: Option.none(),
      },
    },
  })
const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const directory = yield* fs.makeTempDirectoryScoped()
  for (const folder of [...Object.values(previewCollections), "references"])
    yield* fs.makeDirectory(join(directory, folder))
  yield* fs.writeFileString(join(directory, "references/index.json"), "[]")
  const versions = yield* buildWikiMigrationHistory(
    ["First origin", "Second origin", "First origin"].map((origin) => ({
      article: article(origin),
      timestamp: "2025-04-01T12:00:00Z",
      actorId: null,
      reviewerId: null,
      sourceEditId: null,
    })),
  )
  yield* fs.writeFileString(
    join(directory, "vegetables/test.json"),
    yield* Schema.encodeEffect(
      Schema.fromJsonString(
        Schema.Struct({
          id: WikiArticleId,
          versions: Schema.Array(WikiMigrationVersion),
          latest_source: Schema.Unknown,
          photoIds: Schema.Array(MediaAssetId),
        }),
      ),
    )({
      id: articleId,
      versions,
      latest_source: { id: "gel-plant", handle: "test" },
      photoIds: [],
    }),
  )
  return directory
})

it.effect(
  "imports and replays history against schema.sql, then serves database state independently of the conversion JSON",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fixture
      const report = yield* importPreview(directory, join(directory, "sqlite"))
      expect(report.revisions).toBe(3)
      const raw = JSON.parse(yield* fs.readFileString(join(report.directory, "raw.json")))
      expect(raw.plants[0].data).toEqual({ id: "gel-plant", handle: "test" })
      const converted = JSON.parse(
        yield* fs.readFileString(join(report.directory, "converted.json")),
      )
      converted.plants[0].data.versions.forEach((version: { article: unknown }) => {
        version.article = null
      })
      yield* fs.writeFileString(join(report.directory, "converted.json"), JSON.stringify(converted))
      yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        expect(yield* sql`PRAGMA foreign_key_check`).toEqual([])
        const dataset = yield* readPreviewDataset(report.directory)
        const plants = Schema.decodeUnknownSync(
          Schema.Array(
            Schema.Struct({
              article: WikiArticleEditableData,
              versions: Schema.Array(Schema.Struct({ article: WikiArticleEditableData })),
            }),
          ),
        )(dataset.plants)
        expect(
          plants[0].versions.map((version) =>
            version.article.kind === "PLANT" ? version.article.translations.pt?.origin : null,
          ),
        ).toEqual([
          Option.some("First origin"),
          Option.some("Second origin"),
          Option.some("First origin"),
        ])
        expect(plants[0].article).toEqual(plants[0].versions.at(-1)?.article)
        yield* makePreviewRoutes(report.directory).pipe(HttpRouter.serve, Layer.build)
        expect((yield* HttpClient.get("/exports.json")).status).toBe(200)
        expect((yield* HttpClient.get("/raw.json")).status).toBe(404)
        expect((yield* HttpClient.post("/exports.json")).status).toBe(405)
        expect((yield* HttpClient.get("/stored-media-assets/invalid/1280.webp")).status).toBe(404)
      }).pipe(
        Effect.provide(makeAppSqlClient(report.database, true)),
        Effect.provide(NodeHttpServer.layerTest),
      )
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
)

it.effect(
  "rolls back an import with a dangling mediaAsset reference and leaves no completed report",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fixture
      const filename = join(directory, "vegetables/test.json")
      const data = JSON.parse(yield* fs.readFileString(filename))
      data.photoIds = ["01900000-0000-7000-8000-000000000002"]
      yield* fs.writeFileString(filename, JSON.stringify(data))
      const result = yield* importPreview(directory, join(directory, "sqlite")).pipe(Effect.result)
      expect(result._tag).toBe("Failure")
      const runs = yield* fs.readDirectory(join(directory, "sqlite"))
      const run = join(directory, "sqlite", runs[0])
      expect(yield* fs.exists(join(run, "verification.json"))).toBe(false)
      yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        expect(yield* sql`SELECT name FROM sqlite_master WHERE type = 'table'`).toEqual([])
      }).pipe(Effect.provide(makeAppSqlClient(join(run, "preview.sqlite"), true)))
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
)
