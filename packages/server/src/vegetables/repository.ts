import {
  type SourceVegetableData,
  VegetableId,
  VegetableNotFoundError,
  VegetableRevisionId,
  VegetableRow,
  VegetableTranslationRow,
} from "@gororobas/domain"
import { Effect, Schema } from "effect"
/**
 * Vegetables repository with CRDT-based revision workflow.
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

const REVISION_CONFIG = {
  crdtTableName: "vegetable_crdts",
  entityIdColumn: "vegetable_id",
  revisionsTableName: "vegetable_revisions",
}

export class VegetablesRepository extends Effect.Service<VegetablesRepository>()(
  "VegetablesRepository",
  {
    effect: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      // Query helpers
      const fetchCrdt = yield* makeFetchCrdt({
        crdtTableName: REVISION_CONFIG.crdtTableName,
        entityIdSchema: VegetableId,
      })

      const insertCrdt = yield* makeInsertCrdt({
        crdtTableName: REVISION_CONFIG.crdtTableName,
        entityIdSchema: VegetableId,
      })

      const updateCrdt = yield* makeUpdateCrdt({
        crdtTableName: REVISION_CONFIG.crdtTableName,
        entityIdSchema: VegetableId,
      })

      const insertRevision = yield* makeInsertRevision({
        entityIdColumn: REVISION_CONFIG.entityIdColumn,
        entityIdSchema: VegetableId,
        revisionIdSchema: VegetableRevisionId,
        revisionsTableName: REVISION_CONFIG.revisionsTableName,
      })

      const fetchRevision = yield* makeFetchRevision({
        entityIdColumn: REVISION_CONFIG.entityIdColumn,
        entityIdSchema: VegetableId,
        revisionIdSchema: VegetableRevisionId,
        revisionsTableName: REVISION_CONFIG.revisionsTableName,
      })

      const updateRevision = yield* makeUpdateRevision({
        revisionIdSchema: VegetableRevisionId,
        revisionsTableName: REVISION_CONFIG.revisionsTableName,
      })

      // Materialized data queries
      const findById = SqlSchema.findOne({
        execute: (id) => sql`SELECT * FROM vegetables WHERE id = ${id}`,
        Request: VegetableId,
        Result: VegetableRow,
      })

      const findByHandle = SqlSchema.findOne({
        execute: (handle) => sql`SELECT * FROM vegetables WHERE handle = ${handle}`,
        Request: Schema.String,
        Result: VegetableRow,
      })

      const findAll = SqlSchema.findAll({
        execute: () => sql`SELECT * FROM vegetables ORDER BY handle`,
        Request: Schema.Void,
        Result: VegetableRow,
      })

      const findBySearchableName = SqlSchema.findOne({
        execute: (pattern) => sql`
          SELECT vt.vegetableId, v.handle
          FROM vegetable_translations vt
          JOIN vegetables v ON v.id = vt.vegetableId
          WHERE LOWER(vt.searchableNames) LIKE ${pattern}
          LIMIT 1
        `,
        Request: Schema.String,
        Result: Schema.Struct({
          vegetableId: VegetableId,
          handle: Schema.String,
        }),
      })

      const findTranslations = SqlSchema.findAll({
        execute: (vegetable_id) =>
          sql`SELECT * FROM vegetable_translations WHERE vegetable_id = ${vegetable_id}`,
        Request: VegetableId,
        Result: VegetableTranslationRow,
      })

      // CRDT operations
      const getCrdt = (id: VegetableId) =>
        fetchCrdt({ id }).pipe(
          Effect.flatMap((opt) => requireFound(opt, id)),
          Effect.mapError(() => new VegetableNotFoundError({ id })),
        )

      // Materialization helpers
      const materializeMain = (data: {
        vegetableId: VegetableId
        sourceData: SourceVegetableData
        currentCrdtFrontier: string
      }) => {
        const { metadata } = data.sourceData
        const scientificNames = JSON.stringify(
          metadata.scientificNames.map((s: { value: string }) => s.value),
        )

        return sql`
          INSERT INTO vegetables (
            id, current_crdt_frontier, handle, scientific_names,
            development_cycle_min, development_cycle_max,
            height_min, height_max,
            temperature_min, temperature_max,
            main_photo_id
          ) VALUES (
            ${data.vegetableId}, ${data.currentCrdtFrontier}, ${metadata.handle}, ${scientificNames},
            ${metadata.developmentCycleMin ?? null}, ${metadata.developmentCycleMax ?? null},
            ${metadata.heightMin ?? null}, ${metadata.heightMax ?? null},
            ${metadata.temperatureMin ?? null}, ${metadata.temperatureMax ?? null},
            ${metadata.mainPhotoId ?? null}
          )
          ON CONFLICT(id) DO UPDATE SET
            current_crdt_frontier = excluded.current_crdt_frontier,
            handle = excluded.handle,
            scientific_names = excluded.scientific_names,
            development_cycle_min = excluded.development_cycle_min,
            development_cycle_max = excluded.development_cycle_max,
            height_min = excluded.height_min,
            height_max = excluded.height_max,
            temperature_min = excluded.temperature_min,
            temperature_max = excluded.temperature_max,
            main_photo_id = excluded.main_photo_id
        `
      }

      const materializeTranslations = (data: {
        vegetableId: VegetableId
        sourceData: SourceVegetableData
      }) =>
        Effect.gen(function* () {
          const { sourceData, vegetableId } = data
          const { locales, metadata } = sourceData

          yield* sql`DELETE FROM vegetable_translations WHERE vegetable_id = ${vegetableId}`

          for (const [locale, localeData] of Object.entries(locales)) {
            if (!localeData) continue

            const commonNames = JSON.stringify(
              localeData.commonNames.map((n: { value: string }) => n.value),
            )
            const searchableNames = [
              ...localeData.commonNames.map((n: { value: string }) => n.value),
              ...metadata.scientificNames.map((s: { value: string }) => s.value),
            ].join(" ")

            yield* sql`
              INSERT INTO vegetable_translations (
                vegetable_id, locale, common_names, searchable_names,
                grammatical_gender, origin, content
              ) VALUES (
                ${vegetableId}, ${locale}, ${commonNames}, ${searchableNames},
                ${localeData.grammaticalGender ?? null},
                ${localeData.origin ?? null},
                ${localeData.content ? JSON.stringify(localeData.content) : null}
              )
            `
          }
        })

      const materializeJunction =
        <T>(config: {
          tableName: string
          columnName: string
          getData: (v: SourceVegetableData) => ReadonlyArray<T> | null | undefined
        }) =>
        (data: { vegetableId: VegetableId; sourceData: SourceVegetableData }) =>
          Effect.gen(function* () {
            const { sourceData, vegetableId } = data
            const values = config.getData(sourceData)

            yield* sql`DELETE FROM ${sql.unsafe(config.tableName)} WHERE vegetable_id = ${vegetableId}`

            if (values && values.length > 0) {
              for (const value of values) {
                yield* sql`
                  INSERT INTO ${sql.unsafe(config.tableName)} (vegetable_id, ${sql.unsafe(config.columnName)})
                  VALUES (${vegetableId}, ${value})
                `
              }
            }
          })

      const materializeStrata = materializeJunction({
        columnName: "stratum",
        getData: (v) => v.metadata.strata,
        tableName: "vegetable_strata",
      })

      const materializePlantingMethods = materializeJunction({
        columnName: "planting_method",
        getData: (v) => v.metadata.plantingMethods,
        tableName: "vegetable_planting_methods",
      })

      const materializeEdibleParts = materializeJunction({
        columnName: "edible_part",
        getData: (v) => v.metadata.edibleParts,
        tableName: "vegetable_edible_parts",
      })

      const materializeLifecycles = materializeJunction({
        columnName: "lifecycle",
        getData: (v) => v.metadata.lifecycles,
        tableName: "vegetable_lifecycles",
      })

      const materializeUses = materializeJunction({
        columnName: "usage",
        getData: (v) => v.metadata.uses,
        tableName: "vegetable_uses",
      })

      const materialize = (data: {
        vegetableId: VegetableId
        loroCrdt: Uint8Array
        sourceData: SourceVegetableData
        currentCrdtFrontier: string
      }) =>
        Effect.all(
          [
            materializeMain({
              currentCrdtFrontier: data.currentCrdtFrontier,
              sourceData: data.sourceData,
              vegetableId: data.vegetableId,
            }),
            materializeTranslations({
              sourceData: data.sourceData,
              vegetableId: data.vegetableId,
            }),
            materializeStrata({
              sourceData: data.sourceData,
              vegetableId: data.vegetableId,
            }),
            materializePlantingMethods({
              sourceData: data.sourceData,
              vegetableId: data.vegetableId,
            }),
            materializeEdibleParts({
              sourceData: data.sourceData,
              vegetableId: data.vegetableId,
            }),
            materializeLifecycles({
              sourceData: data.sourceData,
              vegetableId: data.vegetableId,
            }),
            materializeUses({
              sourceData: data.sourceData,
              vegetableId: data.vegetableId,
            }),
          ],
          { concurrency: "unbounded" },
        )

      return {
        // Query operations
        findById,
        findByHandle,
        findAll,
        findBySearchableName,
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
