import {
  Locale,
  ResourceId,
  ResourceNotFoundError,
  ResourceRevisionId,
  type SourceResourceData,
} from "@gororobas/domain"
import { Effect, Schema } from "effect"
/**
 * Resources repository with CRDT-based revision workflow.
 */
import { SqlClient, SqlSchema } from "effect/unstable/sql"

import {
  makeFetchCrdt,
  makeFetchRevision,
  makeInsertCrdt,
  makeInsertRevision,
  makeUpdateCrdt,
  makeUpdateRevision,
  requireFound,
} from "../common/revision-helpers.js"

/** Queried resource row from the materialized table */
export const ResourceRow = Schema.Struct({
  createdAt: Schema.String,
  format: Schema.String,
  handle: Schema.String,
  id: ResourceId,
  thumbnailImageId: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
  url: Schema.String,
  urlState: Schema.String,
})
export type ResourceRow = typeof ResourceRow.Type

export const ResourceTranslationRow = Schema.Struct({
  creditLine: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  locale: Locale,
  originalLocale: Locale,
  resourceId: ResourceId,
  title: Schema.String,
  translationSource: Schema.String,
})
export type ResourceTranslationRow = typeof ResourceTranslationRow.Type

const REVISION_CONFIG = {
  crdtTableName: "resource_crdts",
  entityIdColumn: "resource_id",
  revisionsTableName: "resource_revisions",
}

export class ResourcesRepository extends Effect.Service<ResourcesRepository>()(
  "ResourcesRepository",
  {
    effect: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      // Query helpers
      const fetchCrdt = yield* makeFetchCrdt({
        crdtTableName: REVISION_CONFIG.crdtTableName,
        entityIdSchema: ResourceId,
      })

      const insertCrdt = yield* makeInsertCrdt({
        crdtTableName: REVISION_CONFIG.crdtTableName,
        entityIdSchema: ResourceId,
      })

      const updateCrdt = yield* makeUpdateCrdt({
        crdtTableName: REVISION_CONFIG.crdtTableName,
        entityIdSchema: ResourceId,
      })

      const insertRevision = yield* makeInsertRevision({
        entityIdColumn: REVISION_CONFIG.entityIdColumn,
        entityIdSchema: ResourceId,
        revisionIdSchema: ResourceRevisionId,
        revisionsTableName: REVISION_CONFIG.revisionsTableName,
      })

      const fetchRevision = yield* makeFetchRevision({
        entityIdColumn: REVISION_CONFIG.entityIdColumn,
        entityIdSchema: ResourceId,
        revisionIdSchema: ResourceRevisionId,
        revisionsTableName: REVISION_CONFIG.revisionsTableName,
      })

      const updateRevision = yield* makeUpdateRevision({
        revisionIdSchema: ResourceRevisionId,
        revisionsTableName: REVISION_CONFIG.revisionsTableName,
      })

      // Materialized data queries
      const findById = SqlSchema.findOne({
        execute: (id) => sql`SELECT * FROM resources WHERE id = ${id}`,
        Request: ResourceId,
        Result: ResourceRow,
      })

      const findByHandle = SqlSchema.findOne({
        execute: (handle) => sql`SELECT * FROM resources WHERE handle = ${handle}`,
        Request: Schema.String,
        Result: ResourceRow,
      })

      const findAll = SqlSchema.findAll({
        execute: () => sql`SELECT * FROM resources ORDER BY handle`,
        Request: Schema.Void,
        Result: ResourceRow,
      })

      const findTranslations = SqlSchema.findAll({
        execute: (resource_id) =>
          sql`SELECT * FROM resource_translations WHERE resource_id = ${resource_id}`,
        Request: ResourceId,
        Result: ResourceTranslationRow,
      })

      // CRDT operations
      const getCrdt = (id: ResourceId) =>
        fetchCrdt({ id }).pipe(
          Effect.flatMap((opt) => requireFound(opt, id)),
          Effect.mapError(() => new ResourceNotFoundError({ id })),
        )

      // Materialization helpers
      const materializeMain = (data: {
        resourceId: ResourceId
        sourceData: SourceResourceData
        currentCrdtFrontier: string
        now: string
      }) => {
        const { metadata } = data.sourceData

        return sql`
          INSERT INTO resources (
            id, current_crdt_frontier, handle, url, url_state, format,
            thumbnail_image_id, created_at, updated_at
          ) VALUES (
            ${data.resourceId}, ${data.currentCrdtFrontier}, ${metadata.handle},
            ${metadata.url}, ${metadata.urlState}, ${metadata.format},
            ${metadata.thumbnailImageId ?? null}, ${data.now}, ${data.now}
          )
          ON CONFLICT(id) DO UPDATE SET
            current_crdt_frontier = excluded.current_crdt_frontier,
            handle = excluded.handle,
            url = excluded.url,
            url_state = excluded.url_state,
            format = excluded.format,
            thumbnail_image_id = excluded.thumbnail_image_id,
            updated_at = excluded.updated_at
        `
      }

      const materializeTranslations = (data: {
        resourceId: ResourceId
        sourceData: SourceResourceData
        currentCrdtFrontier: string
      }) =>
        Effect.gen(function* () {
          const { currentCrdtFrontier, resourceId, sourceData } = data
          const { locales } = sourceData

          yield* sql`DELETE FROM resource_translations WHERE resource_id = ${resourceId}`

          for (const [locale, localeData] of Object.entries(locales)) {
            if (!localeData) continue

            yield* sql`
              INSERT INTO resource_translations (
                resource_id, locale, title, description, credit_line,
                translated_at_crdt_frontier, translation_source, original_locale
              ) VALUES (
                ${resourceId}, ${locale}, ${localeData.title},
                ${localeData.description ? JSON.stringify(localeData.description) : null},
                ${localeData.creditLine ?? null},
                ${currentCrdtFrontier}, ${localeData.translationSource}, ${localeData.originalLocale}
              )
            `
          }
        })

      const materialize = (data: {
        resourceId: ResourceId
        loroCrdt: Uint8Array
        sourceData: SourceResourceData
        currentCrdtFrontier: string
        now: string
      }) =>
        Effect.all(
          [
            materializeMain({
              currentCrdtFrontier: data.currentCrdtFrontier,
              now: data.now,
              resourceId: data.resourceId,
              sourceData: data.sourceData,
            }),
            materializeTranslations({
              currentCrdtFrontier: data.currentCrdtFrontier,
              resourceId: data.resourceId,
              sourceData: data.sourceData,
            }),
          ],
          { concurrency: "unbounded" },
        )

      return {
        // Query operations
        findById,
        findByHandle,
        findAll,
        findTranslations,
        getCrdt,

        // Revision operations
        insertCrdt,
        updateCrdt,
        insertRevision,
        fetchRevision,
        updateRevision,

        // Materialization
        materialize,
      } as const
    }),
  },
) {}
