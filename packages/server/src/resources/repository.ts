import {
  EMPTY_LORO_DOC_FRONTIER,
  Handle,
  IdGen,
  Locale,
  LoroDocFrontier,
  LoroDocUpdate,
  ResourceId,
  ResourceNotFoundError,
  ResourceRevisionId,
  ResourceRevisionNotFoundError,
  ResourceRevisionRow,
  ResourceRow,
  ResourceTranslationRow,
  SourceResourceData,
  TimestampColumn,
} from "@gororobas/domain"
import { DateTime, Effect, Option, Schema, ServiceMap } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

import {
  persistCrdtAggregateCreation,
  persistCrdtAggregateUpdate,
} from "../common/crdt-aggregate-persistence.js"
import { createResourceSnapshot } from "./resource-crdt-orchestration.js"
import {
  type CreateResourceInput,
  type CreateResourceRevisionInput,
  type EvaluateResourceRevisionInput,
} from "./resource-repository-inputs.js"

export class ResourcesRepository extends ServiceMap.Service<ResourcesRepository>()(
  "ResourcesRepository",
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const findResourceRowById = SqlSchema.findOneOption({
        Request: ResourceId,
        Result: ResourceRow,
        execute: (id) => sql`SELECT * FROM resources WHERE id = ${id}`,
      })

      const findResourceRowByHandle = SqlSchema.findOneOption({
        Request: Schema.Union([Handle, Schema.String]),
        Result: ResourceRow,
        execute: (handle) => sql`SELECT * FROM resources WHERE handle = ${handle}`,
      })

      const listResourceTranslationRowsByResourceId = SqlSchema.findAll({
        Request: ResourceId,
        Result: ResourceTranslationRow,
        execute: (resourceId) =>
          sql`SELECT * FROM resource_translations WHERE resource_id = ${resourceId}`,
      })

      const insertResourceRevisionRow = SqlSchema.void({
        Request: ResourceRevisionRow,
        execute: (row) => sql`INSERT INTO resource_revisions ${sql.insert(row)}`,
      })

      const insertResourceCrdtRow = (input: {
        createdAt: TimestampColumn
        id: ResourceId
        crdtSnapshot: Uint8Array
        updatedAt: TimestampColumn
      }) =>
        sql`INSERT INTO resource_crdts (id, crdt_snapshot, created_at, updated_at) VALUES (${input.id}, ${input.crdtSnapshot}, ${DateTime.formatIso(input.createdAt)}, ${DateTime.formatIso(input.updatedAt)})`

      const upsertResourceRow = SqlSchema.void({
        Request: ResourceRow,
        execute: (row) => sql`
          INSERT INTO resources (
            id,
            current_crdt_frontier,
            handle,
            url,
            url_state,
            last_checked_at,
            format,
            thumbnail_image_id,
            created_at,
            updated_at
          ) VALUES (
            ${row.id},
            ${row.currentCrdtFrontier},
            ${row.handle},
            ${row.url},
            ${row.urlState},
            ${row.lastCheckedAt},
            ${row.format},
            ${row.thumbnailImageId},
            ${row.createdAt},
            ${row.updatedAt}
          )
          ON CONFLICT(id) DO UPDATE SET
            current_crdt_frontier = excluded.current_crdt_frontier,
            handle = excluded.handle,
            url = excluded.url,
            url_state = excluded.url_state,
            format = excluded.format,
            thumbnail_image_id = excluded.thumbnail_image_id,
            updated_at = excluded.updated_at
        `,
      })

      const updateResourceSnapshot = (input: {
        id: ResourceId
        crdtSnapshot: Uint8Array
        updatedAt: TimestampColumn
      }) =>
        sql`UPDATE resource_crdts SET crdt_snapshot = ${input.crdtSnapshot}, updated_at = ${DateTime.formatIso(input.updatedAt)} WHERE id = ${input.id}`

      const updateResourceFrontierWithExpected = (input: {
        id: ResourceId
        expectedCurrentCrdtFrontier: LoroDocFrontier
        nextCurrentCrdtFrontier: LoroDocFrontier
      }) =>
        Effect.gen(function* () {
          yield* sql`
            UPDATE resources
            SET current_crdt_frontier = ${JSON.stringify(input.nextCurrentCrdtFrontier)}
            WHERE id = ${input.id} AND current_crdt_frontier = ${JSON.stringify(input.expectedCurrentCrdtFrontier)}
          `

          const { count } = yield* SqlSchema.findOne({
            Request: Schema.Null,
            Result: Schema.Struct({ count: Schema.Number }),
            execute: () => sql`SELECT changes() as count`,
          })(null)

          return count === 1
        })

      const insertResourceTranslationRows = SqlSchema.void({
        Request: Schema.Array(ResourceTranslationRow),
        execute: (rows) => sql`INSERT INTO resource_translations ${sql.insert(rows)}`,
      })

      const materializeTranslations = (input: {
        resourceId: ResourceId
        locales: SourceResourceData["locales"]
      }) =>
        Effect.gen(function* () {
          yield* sql`DELETE FROM resource_translations WHERE resource_id = ${input.resourceId}`

          const translationRows = Object.entries(input.locales).flatMap(([locale, localeData]) => {
            if (!localeData || !Schema.is(Locale)(locale)) return []

            return ResourceTranslationRow.makeUnsafe({
              resourceId: input.resourceId,
              locale,
              title: localeData.title,
              description: localeData.description,
              creditLine: localeData.creditLine,
              originalLocale: localeData.originalLocale,
              translatedAtCrdtFrontier:
                localeData.translationSource === "ORIGINAL" ? null : EMPTY_LORO_DOC_FRONTIER,
              translationSource: localeData.translationSource,
            })
          })

          if (translationRows.length === 0) return
          yield* insertResourceTranslationRows(translationRows)
        })

      const materializeResource = (input: {
        resourceId: ResourceId
        currentCrdtFrontier: LoroDocFrontier
        sourceData: SourceResourceData
      }) =>
        Effect.gen(function* () {
          const now = yield* DateTime.now

          yield* upsertResourceRow(
            ResourceRow.makeUnsafe({
              id: input.resourceId,
              currentCrdtFrontier: input.currentCrdtFrontier,
              handle: input.sourceData.metadata.handle,
              url: input.sourceData.metadata.url,
              urlState: input.sourceData.metadata.urlState,
              lastCheckedAt: null,
              format: input.sourceData.metadata.format,
              thumbnailImageId: input.sourceData.metadata.thumbnailImageId,
              createdAt: now,
              updatedAt: now,
            }),
          )

          yield* materializeTranslations({
            resourceId: input.resourceId,
            locales: input.sourceData.locales,
          })
        })

      const buildSourceDataFromMaterializedRows = (input: {
        resourceRow: ResourceRow
        translationRows: Array<ResourceTranslationRow>
      }): SourceResourceData => {
        const toLocalizedData = (row: ResourceTranslationRow) => ({
          title: row.title,
          description: row.description,
          creditLine: row.creditLine,
          originalLocale: row.originalLocale,
          translationSource: row.translationSource,
        })

        const enRow = input.translationRows.find((row) => row.locale === "en")
        const esRow = input.translationRows.find((row) => row.locale === "es")
        const ptRow = input.translationRows.find((row) => row.locale === "pt")

        return SourceResourceData.makeUnsafe({
          locales: {
            en: enRow ? toLocalizedData(enRow) : undefined,
            es: esRow ? toLocalizedData(esRow) : undefined,
            pt: ptRow ? toLocalizedData(ptRow) : undefined,
          },
          metadata: {
            format: input.resourceRow.format,
            handle: input.resourceRow.handle,
            thumbnailImageId: input.resourceRow.thumbnailImageId,
            url: input.resourceRow.url,
            urlState: input.resourceRow.urlState,
          },
        })
      }

      const createResource = (input: CreateResourceInput) =>
        Effect.gen(function* () {
          const resourceId = yield* IdGen.make(ResourceId)
          const now = yield* DateTime.now
          const created = createResourceSnapshot(input.sourceData)

          return yield* persistCrdtAggregateCreation({
            sql,
            insertCrdt: insertResourceCrdtRow({
              createdAt: now,
              crdtSnapshot: created.crdtSnapshot,
              id: resourceId,
              updatedAt: now,
            }),
            insertInitialCommit: Effect.gen(function* () {
              const revisionId = yield* IdGen.make(ResourceRevisionId)
              yield* insertResourceRevisionRow(
                ResourceRevisionRow.makeUnsafe({
                  id: revisionId,
                  resourceId,
                  createdById: input.createdById,
                  crdtUpdate: created.initialCrdtUpdate,
                  fromCrdtFrontier: EMPTY_LORO_DOC_FRONTIER,
                  evaluation: "APPROVED",
                  evaluatedById: input.createdById,
                  evaluatedAt: now,
                  createdAt: now,
                  updatedAt: now,
                }),
              )
            }),
            materialize: materializeResource({
              resourceId,
              currentCrdtFrontier: created.currentCrdtFrontier,
              sourceData: created.sourceData,
            }),
            result: resourceId,
          })
        })

      const createRevision = (input: CreateResourceRevisionInput) =>
        Effect.gen(function* () {
          const resourceRowOption = yield* findResourceRowById(input.resourceId)
          if (Option.isNone(resourceRowOption)) {
            return yield* Effect.fail(new ResourceNotFoundError({ id: input.resourceId }))
          }

          const translations = yield* listResourceTranslationRowsByResourceId(input.resourceId)
          const resourceRow = Option.getOrThrow(resourceRowOption)

          const currentSourceData = buildSourceDataFromMaterializedRows({
            resourceRow,
            translationRows: translations,
          })

          const nextSourceData = SourceResourceData.makeUnsafe({
            ...currentSourceData,
            locales: {
              ...currentSourceData.locales,
              pt: {
                ...(currentSourceData.locales.pt ?? {
                  title: "",
                  description: null,
                  creditLine: null,
                  originalLocale: "pt" as const,
                  translationSource: "ORIGINAL" as const,
                }),
                title: input.title ?? currentSourceData.locales.pt?.title ?? "",
                description:
                  input.description === undefined
                    ? (currentSourceData.locales.pt?.description ?? null)
                    : input.description,
                creditLine:
                  input.creditLine === undefined
                    ? (currentSourceData.locales.pt?.creditLine ?? null)
                    : input.creditLine,
                originalLocale: "pt",
                translationSource: "ORIGINAL",
              },
            },
          })

          const revisionId = yield* IdGen.make(ResourceRevisionId)
          const now = yield* DateTime.now

          yield* insertResourceRevisionRow(
            ResourceRevisionRow.makeUnsafe({
              id: revisionId,
              resourceId: input.resourceId,
              createdById: input.createdById,
              crdtUpdate: Schema.decodeUnknownSync(LoroDocUpdate)(
                new TextEncoder().encode(JSON.stringify(nextSourceData)),
              ),
              fromCrdtFrontier: input.expectedCurrentCrdtFrontier,
              evaluation: "PENDING",
              evaluatedById: null,
              evaluatedAt: null,
              createdAt: now,
              updatedAt: now,
            }),
          )

          return revisionId
        })

      const findRevisionById = SqlSchema.findOneOption({
        Request: ResourceRevisionId,
        Result: ResourceRevisionRow,
        execute: (id) => sql`SELECT * FROM resource_revisions WHERE id = ${id}`,
      })

      const listPendingRevisionsByResourceId = SqlSchema.findAll({
        Request: ResourceId,
        Result: ResourceRevisionRow,
        execute: (resourceId) =>
          sql`SELECT * FROM resource_revisions WHERE resource_id = ${resourceId} AND evaluation = 'PENDING' ORDER BY created_at ASC`,
      })

      const evaluateRevision = (input: EvaluateResourceRevisionInput) =>
        Effect.gen(function* () {
          const revisionOption = yield* findRevisionById(input.revisionId)
          if (Option.isNone(revisionOption)) {
            return yield* Effect.fail(new ResourceRevisionNotFoundError({ id: input.revisionId }))
          }

          const revision = Option.getOrThrow(revisionOption)
          const now = yield* DateTime.now

          const markRevisionAsEvaluated = sql`
            UPDATE resource_revisions
            SET evaluation = ${input.evaluation},
                evaluated_by_id = ${input.evaluatedById},
                evaluated_at = ${DateTime.formatIso(now)},
                updated_at = ${DateTime.formatIso(now)}
            WHERE id = ${input.revisionId}
          `.pipe(Effect.asVoid)

          if (input.evaluation === "REJECTED") {
            yield* sql.withTransaction(markRevisionAsEvaluated)
            return
          }

          const rowOption = yield* findResourceRowById(revision.resourceId)
          if (Option.isNone(rowOption)) {
            return yield* Effect.fail(new ResourceNotFoundError({ id: revision.resourceId }))
          }

          const currentResource = Option.getOrThrow(rowOption)
          const sourceData = Schema.decodeUnknownSync(SourceResourceData)(
            JSON.parse(new TextDecoder().decode(revision.crdtUpdate)),
          )
          const nextSnapshotCreated = createResourceSnapshot(sourceData)

          yield* persistCrdtAggregateUpdate({
            sql,
            ensureSnapshotUpdated: updateResourceSnapshot({
              id: revision.resourceId,
              crdtSnapshot: nextSnapshotCreated.crdtSnapshot,
              updatedAt: now,
            }).pipe(
              Effect.flatMap(() =>
                updateResourceFrontierWithExpected({
                  id: revision.resourceId,
                  expectedCurrentCrdtFrontier: currentResource.currentCrdtFrontier,
                  nextCurrentCrdtFrontier: nextSnapshotCreated.currentCrdtFrontier,
                }),
              ),
            ),
            insertCommit: markRevisionAsEvaluated,
            materialize: materializeResource({
              resourceId: revision.resourceId,
              currentCrdtFrontier: nextSnapshotCreated.currentCrdtFrontier,
              sourceData,
            }),
            onConflict: Effect.fail(new ResourceNotFoundError({ id: revision.resourceId })),
          })
        })

      return {
        createResource,
        createRevision,
        evaluateRevision,
        findResourceRowById,
        findResourceRowByHandle,
        findRevisionById,
        listPendingRevisionsByResourceId,
        listResourceTranslationRowsByResourceId,
      }
    }),
  },
) {}
