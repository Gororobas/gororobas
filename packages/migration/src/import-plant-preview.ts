import { NodePath, NodeHttpClient, NodeServices } from "@effect/platform-node"
import {
  MediaAssetId,
  MediaAssetRow,
  Handle,
  IdGen,
  AuthSecurityRevision,
  loroDocToUpdate,
  parseWikiArticleCrdtUpdate,
  PersonId,
  ProfileId,
  snapshotToLoroDoc,
  WikiArticleEditableData,
  WikiArticleId,
} from "@gororobas/domain"
import { IdGenLive } from "@gororobas/server/id-gen-live"
import { insertMediaAsset, insertMediaAssetCredit } from "@gororobas/server/media-assets/mutations"
import { MediaAssetsRepository } from "@gororobas/server/media-assets/repository"
import { MediaAssetsService } from "@gororobas/server/media-assets/service"
import { MediaAssetsStorage } from "@gororobas/server/media-assets/storage"
import { makeAppSql } from "@gororobas/server/sql"
import {
  findCrdtRowById,
  findDatabaseRowById,
  findPageByHandleAndKind,
  findTranslationRows,
} from "@gororobas/server/wiki/queries"
import { WikiArticlesRepository } from "@gororobas/server/wiki/repository"
import { FileSystem, ConfigProvider, DateTime, Effect, Layer, Option, Schema, Path } from "effect"
import { HttpClient } from "effect/http"
import { SqlClient, SqlSchema } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"

import { WikiMigrationVersion } from "./wiki-migration-history.js"

const { join, resolve } = Effect.runSync(Effect.provide(Path.Path, NodePath.layer))

const PlantPreviewSource = Schema.Struct({
  id: WikiArticleId,
  photoIds: Schema.Array(MediaAssetId),
  versions: Schema.Array(WikiMigrationVersion),
  latest_source: Schema.Struct({
    photos: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        sanity_id: Schema.String,
        label: Schema.NullOr(Schema.String),
        sources: Schema.Array(
          Schema.Struct({
            credits: Schema.NullOr(Schema.String),
            origin: Schema.NullOr(Schema.String),
          }),
        ),
      }),
    ),
  }),
})

const SourceMediaAsset = Schema.Struct({
  id: MediaAssetId,
  latest_source: Schema.Struct({ id: Schema.String }),
})

/** A fresh preview imports the latest converted state, not reconstructed historical revisions. */
export const importPlantPreview = async (sourceFilename: string, previewRoot: string) => {
  const filesystem = await Effect.runPromise(
    Effect.provide(FileSystem.FileSystem, NodeServices.layer),
  )
  const plant = Schema.decodeUnknownSync(Schema.fromJsonString(PlantPreviewSource))(
    await Effect.runPromise(filesystem.readFileString(sourceFilename)),
  )
  const latest = plant.versions.at(-1)
  if (!latest || latest.article.kind !== "PLANT") {
    throw new Error("Expected a converted plant version")
  }
  await Effect.runPromise(filesystem.makeDirectory(previewRoot, { recursive: true }))
  const directory = await Effect.runPromise(
    filesystem.makeTempDirectory({ directory: previewRoot, prefix: "plant-" }),
  )
  const database = join(directory, "preview.sqlite")
  const mediaAssetsDirectory = join(directory, "media-assets")
  let enrichmentRequests = 0

  const noEnrichment = Layer.effect(WorkflowEngine.WorkflowEngine)(
    Effect.gen(function* () {
      const engine = yield* WorkflowEngine.WorkflowEngine

      return {
        ...engine,
        execute: () => {
          enrichmentRequests++
          return Effect.die(new Error("Preview must not submit enrichment"))
        },
      }
    }),
  ).pipe(Layer.provide(WorkflowEngine.layerMemory))

  const dependencies = Layer.mergeAll(
    makeAppSql(database),
    IdGenLive,
    Layer.effect(WikiArticlesRepository)(WikiArticlesRepository.make),
    noEnrichment,
    NodeServices.layer,
    Layer.effect(MediaAssetsStorage, MediaAssetsStorage.make).pipe(
      Layer.provide(NodeServices.layer),
      Layer.provide(
        Layer.succeed(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({ MEDIA_ASSETS_DIRECTORY: mediaAssetsDirectory }),
        ),
      ),
    ),
    NodeHttpClient.layerUndici,
  )

  const services = Layer.effect(MediaAssetsService, MediaAssetsService.make).pipe(
    Layer.provideMerge(Layer.effect(MediaAssetsRepository, MediaAssetsRepository.make)),
    Layer.provideMerge(dependencies),
  )

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const importerId = yield* IdGen.make(PersonId)
      const repository = yield* WikiArticlesRepository
      const now = yield* DateTime.now
      const timestamp = DateTime.formatIso(now)
      const mediaAssets: Array<MediaAssetRow> = []
      const service = yield* MediaAssetsService

      for (const [photoIndex, photo] of plant.latest_source.photos.entries()) {
        const match = /^image-([a-f0-9]{40})-(\d+)x(\d+)-([a-z0-9]+)$/.exec(photo.sanity_id)
        if (!match) {
          return yield* Effect.die(new Error(`Invalid Sanity mediaAsset ID: ${photo.sanity_id}`))
        }
        const sourceMediaAsset = yield* filesystem
          .readFileString(resolve(import.meta.dirname, "../debug/images", `${photo.id}.json`))
          .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(SourceMediaAsset))))
        if (sourceMediaAsset.id !== plant.photoIds[photoIndex]) {
          return yield* Effect.die(new Error("Photo ID mapping does not match the plant export"))
        }
        const http = yield* HttpClient.HttpClient

        const response = yield* http
          .get(
            `https://cdn.sanity.io/images/4wdqd7lo/production/${match[1]}-${match[2]}x${match[3]}.${match[4]}`,
          )
          .pipe(
            Effect.flatMap((response) =>
              response.status === 200
                ? Effect.succeed(response)
                : Effect.die(new Error(`Original download failed: ${response.status}`)),
            ),
          )

        const original = yield* response.arrayBuffer

        const stored = yield* service.prepare({
          id: sourceMediaAsset.id,
          file: new Uint8Array(original),
          contentType: `image/${match[4] === "jpg" ? "jpeg" : match[4]}`,
        })

        if (stored.metadata.format !== "IMAGE") return yield* Effect.die("Expected image")

        mediaAssets.push({
          id: sourceMediaAsset.id,
          format: "IMAGE",
          ...stored,
          metadata: stored.metadata,
          label: photo.label ?? null,
          moderationStatus: null,
          ownerProfileId: ProfileId.make(importerId),
          createdAt: now,
          updatedAt: now,
        })
      }

      yield* Effect.gen(function* () {
        yield* sql`INSERT INTO auth_subjects ${sql.insert({ id: importerId, name: "Migration import", email: "migration-preview@example.invalid", isEmailVerified: 0, securityRevision: yield* IdGen.make(AuthSecurityRevision), createdAt: timestamp, updatedAt: timestamp })}`
        yield* sql`INSERT INTO profiles ${sql.insert({ id: importerId, type: "PERSON", handle: "migration-import", name: "Migration import", visibility: "PUBLIC", createdAt: timestamp, updatedAt: timestamp })}`
        yield* sql`INSERT INTO people ${sql.insert({ id: importerId, accessLevel: "COMMUNITY" })}`
        yield* repository.createWikiArticle(
          { wikiArticle: latest.article, createdById: importerId, status: "PUBLISHED" },
          { id: plant.id, enrichment: "skip" },
        )

        for (const [index, mediaAsset] of mediaAssets.entries()) {
          yield* insertMediaAsset(mediaAsset)
          const photo = plant.latest_source.photos[index]

          for (const [orderIndex, source] of (photo.sources ?? []).entries()) {
            yield* insertMediaAssetCredit({
              mediaAssetId: mediaAsset.id,
              orderIndex,
              creditLine: source.credits ?? null,
              creditUrl: source.origin ?? null,
              personId: null,
            })
          }

          yield* sql`INSERT INTO wiki_article_photos ${sql.insert({ wikiArticleId: plant.id, mediaAssetId: mediaAsset.id, orderIndex: index })}`
        }
      }).pipe(sql.withTransaction)

      const article = yield* findDatabaseRowById(plant.id).pipe(Effect.map(Option.getOrThrow))
      const crdt = yield* findCrdtRowById(plant.id).pipe(Effect.map(Option.getOrThrow))
      const parsed = yield* parseWikiArticleCrdtUpdate({
        snapshot: crdt.crdtSnapshot,
        crdtUpdate: loroDocToUpdate(snapshotToLoroDoc(crdt.crdtSnapshot)),
      })
      const translations = yield* findTranslationRows(plant.id)

      const routes = yield* SqlSchema.findAll({
        Request: WikiArticleId,
        Result: Schema.Struct({ handle: Handle, locale: Schema.String }),
        execute: (id) =>
          sql`SELECT handle, locale FROM wiki_article_handles WHERE wiki_article_id = ${id}`,
      })(plant.id)

      const revisions = yield* SqlSchema.findAll({
        Request: WikiArticleId,
        Result: Schema.Struct({ count: Schema.Int }),
        execute: (id) =>
          sql`SELECT COUNT(*) AS count FROM wiki_article_revisions WHERE wiki_article_id = ${id} AND evaluation = 'APPROVED'`,
      })(plant.id)

      const storedMediaAssets = yield* sql`SELECT * FROM media_assets`
      yield* Schema.decodeUnknownEffect(Schema.Array(MediaAssetRow))(storedMediaAssets)
      const violations = yield* sql`PRAGMA foreign_key_check`

      if (
        article.kind !== "PLANT" ||
        translations.length === 0 ||
        routes.length === 0 ||
        revisions[0].count !== 1 ||
        violations.length !== 0
      ) {
        return yield* Effect.die(new Error("Preview persistence validation failed"))
      }

      for (const route of routes) {
        const page = yield* findPageByHandleAndKind({
          handle: Schema.decodeUnknownSync(Handle)(route.handle),
          kind: "PLANT",
          locale: "pt",
        })

        if (Option.isNone(page) || page.value.id !== plant.id) {
          return yield* Effect.die(new Error("Handle lookup failed"))
        }
      }

      if (
        !Schema.toEquivalence(WikiArticleEditableData)(parsed.data, latest.article) ||
        enrichmentRequests !== 0
      ) {
        return yield* Effect.die(new Error("CRDT differs from import or enrichment was submitted"))
      }

      return {
        enrichmentRequests,
        articleId: plant.id,
        mediaAssets: mediaAssets.length,
        translations: translations.map((item) => item.locale),
        routes,
        revisions: revisions[0].count,
        crdtBytes: crdt.crdtSnapshot.byteLength,
      }
    }).pipe(Effect.provide(services)),
  )

  const report = { database, mediaAssetsDirectory, ...result }

  await Effect.runPromise(
    filesystem.writeFileString(
      join(directory, "verification.json"),
      JSON.stringify(report, null, 2),
    ),
  )

  return report
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const result = await importPlantPreview(
    resolve(process.argv[2] ?? join(import.meta.dirname, "../debug/vegetables/abacate.json")),
    resolve(process.argv[3] ?? join(import.meta.dirname, "../debug/sqlite")),
  )
  console.log(JSON.stringify(result, null, 2))
}
