import { ImageId, ProfileId, WikiArticleEditableData, WikiArticleId } from "@gororobas/domain"
import { Array as EffectArray, Effect, FileSystem, Option, Path, Predicate, Schema } from "effect"

import { GelClient } from "../gel-client.js"
import { GelResourceWithRelations } from "../schemas/gel/entities.js"
import { MigrationContext } from "../services/migration-context.js"
import { buildWikiMigrationHistory, type WikiMigrationVersion } from "../wiki-migration-history.js"
import {
  gelResourceToWikiArticle,
  ResourceDataForMigration,
  ResourceAuditLog,
} from "./gel-resource-to-wiki-article.js"

const resourcesQuery = `
  select Resource {
    *,
    created_by: { id },
    audit_logs := (select .<target[is HistoryLog] order by .timestamp asc) { id, timestamp, action, old, new, performed_by: { id } },
    thumbnail: { *, sources := (select .sources order by @order_index asc empty last) { * } },
    related_vegetables := (select .related_vegetables order by @order_index asc empty last) {
      id,
    },
    tags := (select .tags order by @order_index asc empty last) {
      id,
    },
  }
`

export const sourceGelResources = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const context = yield* MigrationContext
  const gelClient = yield* GelClient
  const resourceResults = yield* gelClient
    .use((client) => client.query(resourcesQuery))
    .pipe(
      Effect.flatMap((resources) =>
        Effect.all(
          resources.map((resource) =>
            Schema.decodeUnknownEffect(
              Schema.Struct({
                ...GelResourceWithRelations.fields,
                audit_logs: Schema.Array(ResourceAuditLog),
              }),
            )(resource),
          ),
          { concurrency: "unbounded", mode: "result" },
        ),
      ),
    )

  yield* Option.match(EffectArray.head(EffectArray.getFailures(resourceResults)), {
    onNone: () => Effect.void,
    onSome: (failure) => Effect.logError("Failed parsing a resource: ", failure.message),
  })

  const resources = EffectArray.getSuccesses(resourceResults)
  const articleResults = yield* Effect.all(
    resources.map((source) =>
      gelResourceToWikiArticle(source).pipe(Effect.map((article) => ({ article, source }))),
    ),
    { concurrency: "unbounded", mode: "result" },
  )

  yield* Option.match(EffectArray.head(EffectArray.getFailures(articleResults)), {
    onNone: () => Effect.void,
    onSome: (failure) => Effect.logError("Failed converting a resource: ", failure.message),
  })

  const resourcesDirectory = path.join(import.meta.dirname, "..", "..", "debug", "resources")
  yield* fs.makeDirectory(resourcesDirectory, { recursive: true })

  yield* Effect.forEach(
    EffectArray.getSuccesses(articleResults),
    ({ article, source }) =>
      Effect.gen(function* () {
        const id = yield* context
          .resolveId(source.id, "WikiArticle")
          .pipe(Effect.flatMap(Schema.decodeUnknownEffect(WikiArticleId)))
        const thumbnailId = source.thumbnail
          ? yield* context
              .resolveId(source.thumbnail.id, "Image")
              .pipe(Effect.flatMap(Schema.decodeUnknownEffect(ImageId)))
          : null
        const versionInputs: Array<
          Pick<
            WikiMigrationVersion,
            "article" | "sourceEditId" | "actorId" | "reviewerId" | "timestamp"
          >
        > = []
        yield* Effect.forEach(
          source.audit_logs.filter((log) => log.new && log.action !== "DELETE"),
          (log) =>
            Effect.gen(function* () {
              const fields = yield* Schema.decodeUnknownEffect(
                Schema.Record(Schema.String, Schema.Unknown),
              )(log.new)
              const state = yield* Schema.decodeUnknownEffect(GelResourceWithRelations)({
                ...source,
                ...fields,
                created_at: Predicate.isString(fields.created_at)
                  ? Schema.decodeUnknownSync(Schema.DateFromString)(fields.created_at)
                  : source.created_at,
                updated_at: Predicate.isString(fields.updated_at)
                  ? Schema.decodeUnknownSync(Schema.DateFromString)(fields.updated_at)
                  : source.updated_at,
              })
              const historicalArticle = yield* gelResourceToWikiArticle(state)
              const actorId = log.performed_by
                ? yield* context
                    .resolveId(log.performed_by.id, "Profile")
                    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(ProfileId)))
                : null
              versionInputs.push({
                article: historicalArticle,
                sourceEditId: log.id,
                actorId,
                reviewerId: null,
                timestamp: log.timestamp.toISOString(),
              })
            }),
          { concurrency: 1 },
        )
        if (EffectArray.isReadonlyArrayEmpty(versionInputs))
          versionInputs.push({
            article,
            sourceEditId: null,
            actorId: source.created_by
              ? yield* context
                  .resolveId(source.created_by.id, "Profile")
                  .pipe(Effect.flatMap(Schema.decodeUnknownEffect(ProfileId)))
              : null,
            reviewerId: null,
            timestamp: (source.updated_at ?? source.created_at).toISOString(),
          })
        const last = versionInputs.at(-1)
        if (
          last &&
          Schema.encodeSync(Schema.fromJsonString(WikiArticleEditableData))(last.article) !==
            Schema.encodeSync(Schema.fromJsonString(WikiArticleEditableData))(article)
        )
          versionInputs.push({
            article,
            sourceEditId: null,
            actorId: null,
            reviewerId: null,
            timestamp: (source.updated_at ?? source.created_at).toISOString(),
          })
        const versions = yield* buildWikiMigrationHistory(versionInputs)
        const encoded = yield* Schema.encodeEffect(
          Schema.fromJsonString(ResourceDataForMigration, { space: 2 }),
        )({
          id,
          thumbnailId,
          versions,
          auditLogs: source.audit_logs,
          article,
          latest_source: source,
        })
        yield* fs.writeFileString(path.join(resourcesDirectory, `${source.handle}.json`), encoded)
      }),
    { concurrency: 1 },
  )
})
