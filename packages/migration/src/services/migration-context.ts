/**
 * MigrationContext service for ID mapping and progress tracking.
 * Adapted from the reference Supabase migration context.
 */
import { Context, DateTime, Effect, HashMap, Layer, Option, Ref, Schema } from "effect"
import { SqlClient, SqlError, SqlSchema } from "effect/unstable/sql"

// ============ Types ============

export interface MappingEntry<T extends string = string> {
  gelId: string
  sqliteId: T
  entityType: string
  contentHash: string
  lastSyncedAt: string
}

export type MigrationOp =
  | { op: "skip"; reason: "unchanged" }
  | {
      op: "create"
      execute: <R>(
        createInSqlite: (data: { contentHash: string }) => Effect.Effect<string, R>,
      ) => Effect.Effect<void, R | SqlError.SqlError>
    }
  | {
      op: "update"
      sqliteId: string
      execute: <R>(
        updateInSqlite: (data: { contentHash: string; sqliteId: string }) => Effect.Effect<void, R>,
      ) => Effect.Effect<void, R | SqlError.SqlError>
    }

export type IdMap = HashMap.HashMap<string, MappingEntry>

// ============ Errors ============

export class GelIdNotMappedError extends Schema.TaggedError<GelIdNotMappedError>()(
  "GelIdNotMappedError",
  {
    gelId: Schema.String,
    entityType: Schema.Option(Schema.String),
  },
) {}

// ============ Service Interface ============

export interface MigrationContextService {
  /**
   * Resolve a Gel ID to its SQLite ID.
   */
  readonly resolveId: <T extends string>(
    gelId: string,
    entityType?: string,
  ) => Effect.Effect<T, GelIdNotMappedError>

  /**
   * Determine what migration operation is needed and return a
   * handler that auto-registers the mapping to the context on success.
   */
  readonly planMigrationOp: <GelRecord extends { id: string }>(
    sourceRecord: GelRecord,
    entityType: string,
  ) => Effect.Effect<MigrationOp, Schema.SchemaError | SqlError.SqlError>

  /**
   * Register a new ID mapping.
   */
  readonly registerMapping: (mapping: MappingEntry) => Effect.Effect<void, SqlError.SqlError>
}

// ============ Service Tag ============

export class MigrationContext extends Context.Service<MigrationContext, MigrationContextService>()(
  "MigrationContext",
) {}

// ============ Implementation ============

const makeMigrationContext = ({ initialMap = HashMap.empty() }: { initialMap?: IdMap }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const idMapRef = yield* Ref.make(initialMap)

    // Initialize the id_mappings table if it doesn't exist
    yield* sql`
      CREATE TABLE IF NOT EXISTS id_mappings (
        gel_id TEXT PRIMARY KEY,
        sqlite_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        content_hash TEXT,
        last_synced_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `

    // Load existing mappings from database
    const loadMappings = SqlSchema.findAll({
      execute: () => sql`SELECT * FROM id_mappings`,
      Request: Schema.Void,
      Result: Schema.Struct({
        gelId: Schema.String,
        sqliteId: Schema.String,
        entityType: Schema.String,
        contentHash: Schema.String,
        lastSyncedAt: Schema.String,
      }),
    })

    const existingMappings = yield* loadMappings()
    const loadedMap = HashMap.fromIterable(
      existingMappings.map((m) => [
        m.gelId,
        {
          gelId: m.gelId,
          sqliteId: m.sqliteId as string,
          entityType: m.entityType,
          contentHash: m.contentHash,
          lastSyncedAt: m.lastSyncedAt,
        } as MappingEntry,
      ]),
    )

    yield* Ref.set(idMapRef, loadedMap)

    const registerMapping = (mapping: MappingEntry) =>
      Effect.gen(function* () {
        // Update in-memory map
        yield* Ref.update(idMapRef, HashMap.set(mapping.gelId, mapping))

        // Persist to database
        yield* sql`
          INSERT OR REPLACE INTO id_mappings
          (gel_id, sqlite_id, entity_type, content_hash, last_synced_at, updated_at)
          VALUES (
            ${mapping.gelId},
            ${mapping.sqliteId},
            ${mapping.entityType},
            ${mapping.contentHash},
            ${mapping.lastSyncedAt},
            datetime('now')
          )
        `
      })

    return {
      resolveId: <T extends string>(gelId: string, entityType?: string) =>
        Effect.gen(function* () {
          const map = yield* Ref.get(idMapRef)
          const entry = HashMap.get(map, gelId)

          if (Option.isNone(entry)) {
            return yield* Effect.fail(
              new GelIdNotMappedError({ gelId, entityType: Option.fromUndefinedOr(entityType) }),
            )
          }

          return entry.value.sqliteId as T
        }),

      planMigrationOp: <GelRecord extends { id: string }>(
        sourceRecord: GelRecord,
        entityType: string,
      ) =>
        Effect.gen(function* () {
          const map = yield* Ref.get(idMapRef)
          const { id: gelId } = sourceRecord
          const existing = HashMap.get(map, gelId)

          // Simple hash for now - can be improved with proper content hashing
          const newHash = yield* Effect.succeed(JSON.stringify(sourceRecord))
          const now = (yield* DateTime.nowAsDate).toISOString()

          if (Option.isSome(existing)) {
            if (existing.value.contentHash === newHash) {
              return { op: "skip", reason: "unchanged" } as const
            }

            const mappingEntry = existing.value
            return {
              op: "update",
              sqliteId: mappingEntry.sqliteId,
              execute: <R>(
                updateInSqlite: (data: {
                  contentHash: string
                  sqliteId: string
                }) => Effect.Effect<void, R>,
              ) =>
                Effect.gen(function* () {
                  yield* updateInSqlite({
                    contentHash: newHash,
                    sqliteId: mappingEntry.sqliteId,
                  })
                  yield* registerMapping({
                    ...mappingEntry,
                    contentHash: newHash,
                    lastSyncedAt: now,
                  })
                }),
            } as const
          }

          return {
            op: "create",
            execute: <R>(
              createInSqlite: (data: { contentHash: string }) => Effect.Effect<string, R>,
            ) =>
              Effect.gen(function* () {
                const sqliteId = yield* createInSqlite({ contentHash: newHash })
                yield* registerMapping({
                  gelId,
                  sqliteId,
                  entityType,
                  contentHash: newHash,
                  lastSyncedAt: now,
                })
              }),
          } as const
        }),

      registerMapping,
    }
  })

// ============ Layer ============

export const MigrationContextLive = Layer.effect(MigrationContext, makeMigrationContext({}))
