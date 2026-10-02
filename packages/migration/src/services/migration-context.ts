/** MigrationContext service for persistent ID mapping and progress tracking. */
import { IdGen } from "@gororobas/domain"
import { Context, DateTime, Effect, Layer, Option, Schema, SchemaIssue } from "effect"
import { KeyValueStore } from "effect/unstable/persistence"

const MappingEntry = Schema.Struct({
  gelId: Schema.String,
  sqliteId: Schema.String,
  entityType: Schema.String,
  contentHash: Schema.String,
  lastSyncedAt: Schema.String,
})
export type MappingEntry = typeof MappingEntry.Type

type MappingError = Schema.SchemaError | KeyValueStore.KeyValueStoreError

export type MigrationOp =
  | { op: "skip"; reason: "unchanged" }
  | {
      op: "create"
      execute: <E>(
        create: (data: { contentHash: string }) => Effect.Effect<string, E>,
      ) => Effect.Effect<void, E | MappingError>
    }
  | {
      op: "update"
      sqliteId: string
      execute: <E>(
        update: (data: { contentHash: string; sqliteId: string }) => Effect.Effect<void, E>,
      ) => Effect.Effect<void, E | MappingError>
    }

export class GelIdNotMappedError extends Schema.TaggedError<GelIdNotMappedError>()(
  "GelIdNotMappedError",
  { gelId: Schema.String, entityType: Schema.Option(Schema.String) },
) {}

export interface MigrationContextService {
  readonly resolveId: (
    gelId: string,
    entityType?: string,
  ) => Effect.Effect<string, GelIdNotMappedError | MappingError>
  readonly planMigrationOp: <GelRecord extends { id: string }>(
    sourceRecord: GelRecord,
    entityType: string,
  ) => Effect.Effect<MigrationOp, MappingError>
  readonly registerMapping: (mapping: MappingEntry) => Effect.Effect<void, MappingError>
}

export class MigrationContext extends Context.Service<MigrationContext, MigrationContextService>()(
  "MigrationContext",
) {}

export const MigrationContextLive = Layer.effect(
  MigrationContext,
  Effect.gen(function* () {
    const store = KeyValueStore.toSchemaStore(yield* KeyValueStore.KeyValueStore, MappingEntry)
    const registerMapping = (mapping: MappingEntry) => store.set(mapping.gelId, mapping)
    return MigrationContext.of({
      resolveId: (gelId, entityType) =>
        Effect.gen(function* () {
          const entry = yield* store.get(gelId)
          if (
            Option.isNone(entry) ||
            (entityType !== undefined && entry.value.entityType !== entityType)
          ) {
            return yield* Effect.fail(
              new GelIdNotMappedError({ gelId, entityType: Option.fromUndefinedOr(entityType) }),
            )
          }
          return entry.value.sqliteId
        }),
      planMigrationOp: (sourceRecord, entityType) =>
        Effect.gen(function* () {
          const existing = yield* store.get(sourceRecord.id)
          const contentHash = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(
            sourceRecord,
          )
          const lastSyncedAt = (yield* DateTime.nowAsDate).toISOString()
          if (Option.isSome(existing)) {
            if (existing.value.entityType !== entityType) {
              return yield* Effect.fail(
                new Schema.SchemaError(
                  new SchemaIssue.InvalidValue(
                    { message: "ID mapping entity type mismatch" },
                    existing.value,
                  ),
                ),
              )
            }
            if (existing.value.contentHash === contentHash)
              return { op: "skip", reason: "unchanged" } as const
            const entry = existing.value
            return {
              op: "update",
              sqliteId: entry.sqliteId,
              execute: (update) =>
                Effect.gen(function* () {
                  yield* update({ contentHash, sqliteId: entry.sqliteId })
                  yield* registerMapping({ ...entry, contentHash, lastSyncedAt })
                }),
            } satisfies MigrationOp
          }
          return {
            op: "create",
            execute: (create) =>
              Effect.gen(function* () {
                const sqliteId = yield* create({ contentHash })
                yield* registerMapping({
                  gelId: sourceRecord.id,
                  sqliteId,
                  entityType,
                  contentHash,
                  lastSyncedAt,
                })
              }),
          } satisfies MigrationOp
        }),
      registerMapping,
    })
  }),
)

export const ensureMappedId = Effect.fn("ensureMappedId")(function* (
  source: { id: string },
  entityType: string,
) {
  const context = yield* MigrationContext
  const idGen = yield* IdGen
  const operation = yield* context.planMigrationOp(source, entityType)
  if (operation.op === "create") yield* operation.execute(() => Effect.sync(() => idGen.generate()))
  if (operation.op === "update") yield* operation.execute(() => Effect.void)
  return yield* context.resolveId(source.id, entityType)
})
