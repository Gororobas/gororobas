import { NodePath, NodeRuntime, NodeServices } from "@effect/platform-node"
import { WikiArticleCrdt } from "@gororobas/domain"
import {
  MediaAssetId,
  MediaAssetRow,
  EMPTY_LORO_DOC_FRONTIER,
  IdGen,
  AuthSecurityRevision,
  LoroDocFrontier,
  LoroDocSnapshot,
  LoroDocUpdate,
  PersonId,
  PostSourceData,
  ProfileId,
  PublicationId,
  TagRow,
  WikiArticleEditableData,
  WikiArticleId,
  WikiArticleRevisionId,
  WikiArticleRevisionRow,
  loroDocToUpdate,
  snapshotToLoroDoc,
} from "@gororobas/domain"
import { IdGenLive } from "@gororobas/server/id-gen-live"
import { insertMediaAsset, insertMediaAssetCredit } from "@gororobas/server/media-assets/mutations"
import { PublicationsRepository } from "@gororobas/server/publications/repository"
import { makeAppSqlClient } from "@gororobas/server/sql"
import { updateCrdtRow } from "@gororobas/server/wiki/mutations"
import { WikiArticlesRepository } from "@gororobas/server/wiki/repository"
import {
  Array as EffectArray,
  DateTime,
  Effect,
  FileSystem,
  Path,
  Layer,
  Option,
  Order,
  Schema,
} from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"

import { PreviewRecord, readPreviewExports } from "./preview-exports.js"
import {
  NoteDataForMigration,
  TagDataForMigration,
  UserDataForMigration,
} from "./schemas/gel/entities.js"
import { WikiMigrationVersion } from "./wiki-migration-history.js"

const { join, resolve } = Effect.runSync(Effect.provide(Path.Path, NodePath.layer))

const ArticleExport = Schema.Struct({
  id: WikiArticleId,
  article: Schema.optional(WikiArticleEditableData),
  versions: Schema.optional(Schema.Array(WikiMigrationVersion)),
  photoIds: Schema.optional(Schema.Array(MediaAssetId)),
  thumbnailId: Schema.optional(Schema.NullOr(MediaAssetId)),
})

const ImageExport = Schema.Struct({
  id: MediaAssetId,
  latest_source: Schema.Struct({
    sanity_id: Schema.String,
    label: Schema.NullOr(Schema.String),
    sources: Schema.Array(
      Schema.Struct({
        credits: Schema.NullOr(Schema.String),
        origin: Schema.NullOr(Schema.String),
      }),
    ),
  }),
})

/** Import frozen conversions into a fresh database, preserving each run for comparison. */
export const importPreview = (exportDirectory: string, outputRoot: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const originals = yield* readPreviewExports(exportDirectory)

    const exports: Record<
      string,
      Array<{ file: string; data: typeof PreviewRecord.Type }>
    > = Object.fromEntries(
      Object.entries(originals).map(([name, records]) => [
        name,
        records.map((entry) => ({ ...entry })),
      ]),
    )

    const missingEmailAccounts: Array<string> = []

    // A person is both an account and a profile with the same primary key in the server schema.
    for (const entry of exports.users) {
      const user = yield* Schema.decodeEffect(Schema.toCodecJson(UserDataForMigration))(entry.data)
      if (!user.profile.id) {
        return yield* Effect.fail(new Error(`Missing profile ID: ${entry.file}`))
      }
      if (!user.account.email) missingEmailAccounts.push(user.profile.id)

      entry.data = {
        ...entry.data,
        account: {
          // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Preview account records contain arbitrary JSON.
          ...Schema.decodeUnknownSync(PreviewRecord)(entry.data.account),
          id: user.profile.id,
          email: user.account.email ?? `migration-${user.profile.id}@example.invalid`,
        },
      }
    }

    yield* fs.makeDirectory(outputRoot, { recursive: true })
    const directory = yield* fs.makeTempDirectory({ directory: outputRoot, prefix: "migration-" })
    const schema = yield* fs.readFileString(
      new URL("../../../apps/server/src/db/schema.sql", import.meta.url).pathname,
    )
    yield* fs.writeFileString(join(directory, "schema.sql"), schema)

    yield* fs.writeFileString(
      join(directory, "raw.json"),
      JSON.stringify(
        Object.fromEntries(
          Object.entries(exports).map(([name, records]) => [
            name,
            records.map(({ file, data }) => ({ file, data: data.latest_source })),
          ]),
        ),
        null,
        2,
      ),
    )

    yield* fs.writeFileString(join(directory, "converted.json"), JSON.stringify(exports, null, 2))
    const rawDirectory = join(exportDirectory, "raw-gel")
    if (yield* fs.exists(rawDirectory)) yield* fs.copy(rawDirectory, join(directory, "raw-gel"))
    const journal = join(exportDirectory, "journal", "notes.json")
    if (yield* fs.exists(journal)) yield* fs.copyFile(journal, join(directory, "journal.json"))
    const referencesDirectory = join(exportDirectory, "references")
    const references: Array<Schema.Json> = []

    for (const filename of EffectArray.sort(
      (yield* fs.readDirectory(referencesDirectory)).filter((file) => file.endsWith(".json")),
      Order.String,
    )) {
      const data = yield* fs
        .readFileString(join(referencesDirectory, filename))
        .pipe(Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(Schema.Json))))
      if (Array.isArray(data)) references.push(...data)
      else references.push(data)
    }

    yield* fs.writeFileString(
      join(directory, "references.json"),
      JSON.stringify(references, null, 2),
    )
    const database = join(directory, "preview.sqlite")

    const result = yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`PRAGMA foreign_keys = ON`
      const publications = yield* PublicationsRepository
      const wiki = yield* WikiArticlesRepository
      const now = yield* DateTime.now
      const timestamp = DateTime.formatIso(now)
      const importerId = yield* IdGen.make(PersonId)
      const people = new Set<string>([importerId])
      const unresolvedActors = new Set<string>()
      let revisionCount = 0

      yield* Effect.gen(function* () {
        // schema.sql contains plain DDL, with no triggers or semicolons in literals.
        for (const statement of schema
          .replace(/--[^\n]*/g, "")
          .split(";")
          .filter((part) => part.trim())) {
          yield* sql.unsafe(statement)
        }

        yield* sql`INSERT INTO auth_subjects ${sql.insert({ id: importerId, name: "Migration import", email: "migration-preview@example.invalid", isEmailVerified: 0, securityRevision: yield* IdGen.make(AuthSecurityRevision), createdAt: timestamp, updatedAt: timestamp })}`
        yield* sql`INSERT INTO profiles ${sql.insert({ id: importerId, type: "PERSON", handle: "migration-import", name: "Migration import", visibility: "PUBLIC", createdAt: timestamp, updatedAt: timestamp })}`
        yield* sql`INSERT INTO people ${sql.insert({ id: importerId, accessLevel: "COMMUNITY" })}`

        for (const { data } of exports.users) {
          const user = yield* Schema.decodeEffect(Schema.toCodecJson(UserDataForMigration))(data)
          // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Legacy user profiles may have a missing identifier that must be rejected.
          const id = yield* Schema.decodeUnknownEffect(PersonId)(user.profile.id)
          if (!user.account.email) {
            return yield* Effect.fail(new Error(`Account ${id} has no email`))
          }
          yield* sql`INSERT INTO auth_subjects ${sql.insert({ id, name: user.account.name, email: user.account.email, isEmailVerified: Number(user.account.is_email_verified), securityRevision: yield* IdGen.make(AuthSecurityRevision), image: user.account.image, createdAt: user.account.created_at.toISOString(), updatedAt: user.account.updated_at.toISOString() })}`
          yield* sql`INSERT INTO profiles ${sql.insert({ id, type: user.profile.type, handle: user.profile.handle, name: user.profile.name, bio: user.profile.bio ? JSON.stringify(user.profile.bio) : null, location: user.profile.location, visibility: user.profile.visibility, createdAt: user.profile.created_at.toISOString(), updatedAt: user.profile.updated_at.toISOString() })}`
          yield* sql`INSERT INTO people ${sql.insert({ id, accessLevel: user.person.access_level })}`
          people.add(id)
        }

        for (const { data } of exports.images) {
          // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Legacy image records are unvalidated JSON dictionaries.
          const image = yield* Schema.decodeUnknownEffect(ImageExport)(data)
          const dimensions = /^image-[a-f0-9]{40}-(\d+)x(\d+)-[a-z0-9]+$/.exec(
            image.latest_source.sanity_id,
          )

          if (!dimensions) {
            return yield* Effect.fail(
              new Error(`Invalid Sanity ID: ${image.latest_source.sanity_id}`),
            )
          }

          yield* insertMediaAsset({
            id: image.id,
            format: "IMAGE",
            metadata: {
              format: "IMAGE",
              originalWidth: Number(dimensions[1]),
              originalHeight: Number(dimensions[2]),
            },
            label: image.latest_source.label,
            contentType: null,
            byteSize: null,
            moderationStatus: null,
            ownerProfileId: ProfileId.make(importerId),
            createdAt: now,
            updatedAt: now,
          })

          for (const [orderIndex, credit] of image.latest_source.sources.entries()) {
            yield* insertMediaAssetCredit({
              mediaAssetId: image.id,
              orderIndex,
              creditLine: credit.credits,
              creditUrl: credit.origin,
              personId: null,
            })
          }
        }

        for (const { data } of exports.users) {
          const user = yield* Schema.decodeEffect(Schema.toCodecJson(UserDataForMigration))(data)
          if (user.profile.photoId) {
            yield* sql`UPDATE profiles SET photo_id = ${user.profile.photoId} WHERE id = ${user.profile.id}`
          }
        }

        for (const { data } of exports.tags) {
          const tag = yield* Schema.decodeEffect(Schema.toCodecJson(TagDataForMigration))(data)

          const row = TagRow.make({
            id: tag.id,
            handle: yield* Schema.decodeEffect(TagRow.fields.handle)(tag.latest_source.handle),
            names: {
              pt: tag.latest_source.names.join(" / "),
              en: tag.latest_source.names.join(" / "),
              es: tag.latest_source.names.join(" / "),
            },
            cluster: tag.latest_source.category ?? null,
            description: tag.latest_source.description
              ? // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Legacy descriptions may omit required rich-text document fields.
                yield* Schema.decodeUnknownEffect(TagRow.fields.description)(
                  tag.latest_source.description,
                )
              : null,
            createdById: null,
            createdAt: DateTime.fromDateUnsafe(tag.latest_source.created_at),
            updatedAt: DateTime.fromDateUnsafe(
              tag.latest_source.updated_at ?? tag.latest_source.created_at,
            ),
          })

          yield* SqlSchema.void({
            Request: TagRow,
            execute: (row) => sql`INSERT INTO tags ${sql.insert(row)}`,
          })(row)
        }

        for (const category of ["plants", "cultivars", "resources"] as const) {
          for (const { file, data } of exports[category]) {
            // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Legacy article records are unvalidated JSON dictionaries.
            const article = yield* Schema.decodeUnknownEffect(ArticleExport)(data)
            const latest = article.versions?.at(-1)
            const editable = latest?.article ?? article.article
            if (!editable) {
              return yield* Effect.fail(new Error(`No converted article: ${category}/${file}`))
            }
            yield* wiki.createWikiArticle(
              { wikiArticle: editable, createdById: importerId, status: "PUBLISHED" },
              { id: article.id, enrichment: "skip" },
            )

            if (latest && article.versions) {
              yield* sql`DELETE FROM wiki_article_revisions WHERE wiki_article_id = ${article.id}`
              let previousDocument: ReturnType<typeof snapshotToLoroDoc> | undefined

              for (const version of article.versions) {
                const snapshot = LoroDocSnapshot.make(
                  new Uint8Array(Buffer.from(version.loroSnapshot, "base64")),
                )
                const document = snapshotToLoroDoc(snapshot)

                const parsed = yield* WikiArticleCrdt.parseUpdate({
                  snapshot,
                  crdtUpdate: LoroDocUpdate.make(loroDocToUpdate(document)),
                }).pipe(
                  Effect.tapError((error) =>
                    Effect.logError(`Invalid historical snapshot: ${category}/${file}`, error),
                  ),
                )

                if (!Schema.toEquivalence(WikiArticleEditableData)(parsed.data, version.article)) {
                  return yield* Effect.fail(new Error(`CRDT differs from conversion: ${file}`))
                }
                const createdAt = yield* Schema.decodeEffect(Schema.DateTimeUtcFromString)(
                  version.timestamp,
                )

                const knownPerson = (id: ProfileId | null) => {
                  if (!id) return null
                  if (people.has(id)) return PersonId.make(id)
                  unresolvedActors.add(id)
                  return null
                }

                yield* SqlSchema.void({
                  Request: WikiArticleRevisionRow.mapFields((fields) => ({
                    ...fields,
                    createdById: Schema.NullOr(PersonId),
                  })),
                  execute: (row) => sql`INSERT INTO wiki_article_revisions ${sql.insert(row)}`,
                })({
                  id: yield* IdGen.make(WikiArticleRevisionId),
                  wikiArticleId: article.id,
                  createdById: knownPerson(version.actorId),
                  evaluatedById: Option.fromNullishOr(knownPerson(version.reviewerId)),
                  evaluation: "APPROVED",
                  evaluationReason: Option.none(),
                  evaluatedAt: Option.some(createdAt),
                  createdAt,
                  updatedAt: createdAt,
                  fromCrdtFrontier: previousDocument
                    ? LoroDocFrontier.make(previousDocument.frontiers())
                    : EMPTY_LORO_DOC_FRONTIER,
                  crdtUpdate: LoroDocUpdate.make(
                    document.export({
                      mode: "update",
                      ...(previousDocument ? { from: previousDocument.version() } : {}),
                    }),
                  ),
                })

                previousDocument = document
                revisionCount++
              }

              const snapshot = LoroDocSnapshot.make(
                new Uint8Array(Buffer.from(latest.loroSnapshot, "base64")),
              )
              const frontier = LoroDocFrontier.make(snapshotToLoroDoc(snapshot).frontiers())
              const createdAt = yield* Schema.decodeEffect(Schema.DateTimeUtcFromString)(
                article.versions[0].timestamp,
              )
              const updatedAt = yield* Schema.decodeEffect(Schema.DateTimeUtcFromString)(
                latest.timestamp,
              )

              yield* updateCrdtRow({
                id: article.id,
                crdtSnapshot: snapshot,
                status: "PUBLISHED",
                createdAt,
                updatedAt,
              })

              yield* sql`UPDATE wiki_article_crdts SET created_at = ${DateTime.formatIso(createdAt)} WHERE id = ${article.id}`
              yield* sql`UPDATE wiki_articles SET current_crdt_frontier = ${JSON.stringify(frontier)}, created_at = ${DateTime.formatIso(createdAt)}, updated_at = ${DateTime.formatIso(updatedAt)} WHERE id = ${article.id}`
            } else revisionCount++

            const photoIds = article.photoIds ?? (article.thumbnailId ? [article.thumbnailId] : [])
            for (const [orderIndex, mediaAssetId] of photoIds.entries()) {
              yield* sql`INSERT INTO wiki_article_photos ${sql.insert({ wikiArticleId: article.id, mediaAssetId, orderIndex })}`
            }
          }
        }

        for (const { file, data } of exports.notes) {
          const note = yield* Schema.decodeEffect(Schema.toCodecJson(NoteDataForMigration))(data)

          if (!note.publication) {
            return yield* Effect.fail(
              new Error(`Unconverted note ${file}: ${note.conversion_error}`),
            )
          }

          const sourceData = PostSourceData.make(note.publication)
          const owner = sourceData.metadata.ownerProfileId
          if (!people.has(owner)) {
            return yield* Effect.fail(new Error(`Missing publication owner ${owner}: ${file}`))
          }
          yield* publications.createPublication(
            { sourceData, createdById: PersonId.make(owner) },
            { id: PublicationId.make(note.id) },
          )
          for (const tagId of note.tagIds) {
            yield* sql`INSERT INTO publication_tags ${sql.insert({ publicationId: note.id, tagId, extractionText: null })}`
          }
          for (const wikiArticleId of note.wikiArticleIds) {
            yield* sql`INSERT INTO publication_wiki_articles ${sql.insert({ publicationId: note.id, wikiArticleId, extractionText: null })}`
          }
        }

        // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Raw SQL rows have no statically known selected columns.
        yield* Schema.decodeUnknownEffect(Schema.Array(MediaAssetRow))(
          yield* sql`SELECT * FROM media_assets`,
        )
        const violations = yield* sql`PRAGMA foreign_key_check`

        if (violations.length) {
          return yield* Effect.fail(
            new Error(`Foreign key violations: ${JSON.stringify(violations)}`),
          )
        }

        yield* sql`PRAGMA integrity_check`.pipe(
          Effect.flatMap((rows) =>
            rows[0]?.integrityCheck === "ok"
              ? Effect.void
              : Effect.fail(new Error("SQLite integrity check failed")),
          ),
        )
      }).pipe(sql.withTransaction)

      return {
        counts: Object.fromEntries(
          Object.entries(exports).map(([name, records]) => [name, records.length]),
        ),
        revisions: revisionCount,
        unresolvedActors: [...unresolvedActors],
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.effect(PublicationsRepository)(PublicationsRepository.make),
          Layer.effect(WikiArticlesRepository)(WikiArticlesRepository.make),
        ).pipe(
          Layer.provideMerge(makeAppSqlClient(database)),
          Layer.provideMerge(IdGenLive),
          Layer.provideMerge(WorkflowEngine.layerMemory),
        ),
      ),
    )

    const report = { directory, database, missingEmailAccounts, ...result }
    yield* fs.writeFileString(join(directory, "verification.json"), JSON.stringify(report, null, 2))
    return report
  })

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  importPreview(
    resolve(process.argv[2] ?? new URL("../debug", import.meta.url).pathname),
    resolve(process.argv[3] ?? new URL("../debug/sqlite", import.meta.url).pathname),
  ).pipe(
    Effect.tap((report) => Effect.sync(() => console.log(JSON.stringify(report, null, 2)))),
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  )
}
