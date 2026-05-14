import {
  applyCrdtUpdateWithCommit,
  EMPTY_LORO_DOC_FRONTIER,
  Handle,
  HumanCommit,
  IdGen,
  Locale,
  LoroDocFrontier,
  loroDocToSnapshot,
  parseCrdtUpdate,
  ResourceCrdtRow,
  ResourceId,
  ResourceNotFoundError,
  ResourceRevisionEvaluationWindowExpiredError,
  ResourceRevisionId,
  ResourceRevisionNotFoundError,
  ResourceRevisionRow,
  ResourceRow,
  ResourceTranslationRow,
  ResourceTagRow,
  ResourceVegetableRow,
  snapshotToLoroDoc,
  SourceResourceData,
} from "@gororobas/domain"
import { Context, DateTime, Duration, Effect, Option, Schema, Struct } from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

import {
  persistCrdtDocumentCreation,
  persistCrdtDocumentUpdate,
} from "../common/crdt-aggregate-persistence.js"
import { materializeJunctionTable } from "../common/table-materialization.js"
import {
  createResourceSnapshot,
  type CreateResourceInput,
  type CreateResourceRevisionInput,
  type EvaluateResourceRevisionInput,
} from "./resource-repository-helpers.js"

const RESOURCE_REVISION_REEVALUATION_WINDOW = {
  weeks: 2,
} as const satisfies Duration.DurationObject

/** @todo potentially extract sql table names into a `RESOURCE_TABLES` object in `resources/domain.ts`? */
export class ResourcesRepository extends Context.Service<ResourcesRepository>()(
  "ResourcesRepository",
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      /**
       * ======================
       *         READS
       * ======================
       */

      /** */
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

      const findResourceCrdtSnapshotById = SqlSchema.findOneOption({
        Request: ResourceId,
        Result: ResourceCrdtRow.mapFields(Struct.pick(["crdtSnapshot"])),
        execute: (id) => sql`SELECT crdt_snapshot FROM resource_crdts WHERE id = ${id}`,
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

      const listResourceTranslationRowsByResourceId = SqlSchema.findAll({
        Request: ResourceId,
        Result: ResourceTranslationRow,
        execute: (resourceId) =>
          sql`SELECT * FROM resource_translations WHERE resource_id = ${resourceId}`,
      })

      /**
       * ======================
       *        WRITES
       * ======================
       */

      /** */
      const insertResourceRevisionRow = SqlSchema.void({
        Request: ResourceRevisionRow,
        execute: (row) => sql`INSERT INTO resource_revisions ${sql.insert(row)}`,
      })

      const insertResourceCrdtRow = SqlSchema.void({
        Request: ResourceCrdtRow,
        execute: (row) => sql`INSERT INTO resource_crdts ${sql.insert(row)}`,
      })

      const insertResourceTranslationRows = SqlSchema.void({
        Request: Schema.Array(ResourceTranslationRow),
        execute: (rows) => sql`INSERT INTO resource_translations ${sql.insert(rows)}`,
      })

      const insertResourceTagRows = SqlSchema.void({
        Request: Schema.Array(ResourceTagRow),
        execute: (rows) => sql`INSERT INTO resource_tags ${sql.insert(rows)}`,
      })

      const insertResourceVegetableRows = SqlSchema.void({
        Request: Schema.Array(ResourceVegetableRow),
        execute: (rows) => sql`INSERT INTO resource_vegetables ${sql.insert(rows)}`,
      })

      const updateResourceCrdtRow = SqlSchema.void({
        Request: ResourceCrdtRow.mapFields(Struct.omit(["createdAt"])),
        execute: ({ id, ...update }) =>
          sql`UPDATE resource_crdts SET ${sql.update(update)} WHERE id = ${id}`,
      })

      const updateRevisionEvaluationRow = SqlSchema.void({
        Request: ResourceRevisionRow.mapFields(
          Struct.omit(["createdAt", "createdById", "fromCrdtFrontier", "resourceId", "crdtUpdate"]),
        ),
        execute: ({ id, ...update }) =>
          sql`UPDATE resource_revisions SET ${sql.update(update)} WHERE id = ${id}`,
      })

      const upsertResourceRow = SqlSchema.void({
        Request: ResourceRow,
        execute: (row) => sql`
          INSERT INTO resources ${sql.insert(row)}
          ON CONFLICT(id) DO UPDATE SET ${sql.update(row, ["id", "createdAt", "lastCheckedAt"])}
        `,
      })

      /**
       * ======================
       *    MATERIALIZATION
       * ======================
       */

      /** */
      const materializeTranslations = (input: {
        resourceId: ResourceId
        locales: SourceResourceData["locales"]
      }) =>
        materializeJunctionTable({
          deleteRows: sql`DELETE FROM resource_translations WHERE resource_id = ${input.resourceId}`,
          insertRows: insertResourceTranslationRows(
            Object.entries(input.locales).flatMap(([locale, localeData]) => {
              if (!localeData || !Schema.is(Locale)(locale)) return []

              return ResourceTranslationRow.make({
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
            }),
          ),
        })

      const materializeTags = (input: {
        resourceId: ResourceId
        metadata: SourceResourceData["metadata"]
      }) =>
        materializeJunctionTable({
          deleteRows: sql`DELETE FROM resource_tags WHERE resource_id = ${input.resourceId}`,
          insertRows: insertResourceTagRows(
            (input.metadata.relatedTagIds || []).map((tagId) => ({
              tagId,
              resourceId: input.resourceId,
            })),
          ),
        })

      const materializeVegetables = (input: {
        resourceId: ResourceId
        metadata: SourceResourceData["metadata"]
      }) =>
        materializeJunctionTable({
          deleteRows: sql`DELETE FROM resource_vegetables WHERE resource_id = ${input.resourceId}`,
          insertRows: insertResourceVegetableRows(
            (input.metadata.relatedVegetableIds || []).map((vegetableId, index) => ({
              vegetableId,
              resourceId: input.resourceId,
              orderIndex: index,
            })),
          ),
        })

      const materializeResource = (input: {
        resourceId: ResourceId
        currentCrdtFrontier: LoroDocFrontier
        sourceData: SourceResourceData
      }) =>
        Effect.gen(function* () {
          const now = yield* DateTime.now

          yield* upsertResourceRow(
            ResourceRow.make({
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

          yield* materializeTags({
            resourceId: input.resourceId,
            metadata: input.sourceData.metadata,
          })

          yield* materializeVegetables({
            resourceId: input.resourceId,
            metadata: input.sourceData.metadata,
          })
        })

      /**
       * ======================
       *    BUSINESS LOGIC
       *     (PUBLIC API)
       * ======================
       */

      const createResource = (input: CreateResourceInput) =>
        Effect.gen(function* () {
          const resourceId = yield* IdGen.make(ResourceId)
          const revisionId = yield* IdGen.make(ResourceRevisionId)
          const now = yield* DateTime.now
          const created = createResourceSnapshot(input.sourceData)

          yield* persistCrdtDocumentCreation({
            insertCrdt: insertResourceCrdtRow({
              createdAt: now,
              crdtSnapshot: created.crdtSnapshot,
              id: resourceId,
              updatedAt: now,
            }),
            insertCommitOrRevision: insertResourceRevisionRow(
              ResourceRevisionRow.make({
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
            ),
            materialize: materializeResource({
              resourceId,
              currentCrdtFrontier: created.currentCrdtFrontier,
              sourceData: created.sourceData,
            }),
          })

          return resourceId
        }).pipe(sql.withTransaction)

      /**
       * Resources aren't modified directly. Instead, users create revisions, which need to be evaluated
       * by moderators or admins.
       */
      const createRevision = (input: CreateResourceRevisionInput) =>
        Effect.gen(function* () {
          const resourceSnapshot = yield* findResourceCrdtSnapshotById(input.resourceId).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.fail(new ResourceNotFoundError({ id: input.resourceId })),
                onSome: Effect.succeed,
              }),
            ),
          )

          const { crdtUpdate } = yield* applyCrdtUpdateWithCommit({
            commit: HumanCommit.make({
              personId: input.createdById,
            }),
            crdtUpdate: input.crdtUpdate,
            snapshot: resourceSnapshot.crdtSnapshot,
            targetSchema: SourceResourceData,
          })

          const revisionId = yield* IdGen.make(ResourceRevisionId)
          const now = yield* DateTime.now

          yield* insertResourceRevisionRow(
            ResourceRevisionRow.make({
              id: revisionId,
              resourceId: input.resourceId,
              createdById: input.createdById,
              crdtUpdate,
              fromCrdtFrontier: input.expectedCurrentCrdtFrontier,
              evaluation: "PENDING",
              evaluatedById: null,
              evaluatedAt: null,
              createdAt: now,
              updatedAt: now,
            }),
          )

          return revisionId
        }).pipe(sql.withTransaction)

      const evaluateRevision = (input: EvaluateResourceRevisionInput) =>
        Effect.gen(function* () {
          const now = yield* DateTime.now

          const revision = yield* findRevisionById(input.revisionId).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(new ResourceRevisionNotFoundError({ id: input.revisionId })),
                onSome: Effect.succeed,
              }),
            ),
          )

          // Revisions that have already been evaluated can't be re-evaluated after `RESOURCE_REVISION_REEVALUATION_WINDOW` */
          if (
            revision.evaluation !== "PENDING" &&
            (!revision.evaluatedAt ||
              // Is the window of reevaluation is in the past?
              revision.evaluatedAt.pipe(
                DateTime.add(RESOURCE_REVISION_REEVALUATION_WINDOW),
                DateTime.isPast,
              ))
          ) {
            return yield* new ResourceRevisionEvaluationWindowExpiredError({ id: revision.id })
          }

          const resource = yield* findResourceCrdtSnapshotById(revision.resourceId).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.fail(new ResourceNotFoundError({ id: revision.resourceId })),
                onSome: Effect.succeed,
              }),
            ),
          )

          const currentDoc = snapshotToLoroDoc(resource.crdtSnapshot)

          const { data: updatedResourceData, loroDoc: updatedDoc } = yield* parseCrdtUpdate({
            crdtUpdate: revision.crdtUpdate,
            sourceDocument: currentDoc,
            targetSchema: SourceResourceData,
          })

          yield* persistCrdtDocumentUpdate({
            updateCrdtRow: updateResourceCrdtRow({
              crdtSnapshot: loroDocToSnapshot(updatedDoc),
              id: revision.resourceId,
              updatedAt: now,
            }),
            insertCommitOrUpdateRevision: updateRevisionEvaluationRow({
              id: revision.id,
              updatedAt: now,
              evaluatedAt: now,
              evaluatedById: input.evaluatedById,
              evaluation: input.evaluation,
            }),
            materialize: materializeResource({
              resourceId: revision.resourceId,
              currentCrdtFrontier: updatedDoc.frontiers(),
              sourceData: updatedResourceData,
            }),
          })
        }).pipe(sql.withTransaction)

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
