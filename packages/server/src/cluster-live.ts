import { BunContext } from "@effect/platform-bun"
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun"
import { Config, Effect, Layer } from "effect"
/**
 * Shared Effect Cluster infrastructure for all durable workflows.
 *
 * Uses SingleRunner (single-node, SQL-backed) so that workflow state
 * (activity results, execution status) is persisted in the same SQLite
 * database as the rest of the app. The cluster tables are auto-created
 * by @effect/cluster's SqlMessageStorage.
 *
 * All workflow layers (translation, notifications, etc.) compose on top
 * of this shared layer — they only need WorkflowEngine in their requirements.
 */
import { ClusterWorkflowEngine, SingleRunner } from "effect/unstable/cluster"
import { SqlClient } from "effect/unstable/sql"

// @TODO I need to figure out the proper schema needed by SingleRunner
const MIGRATIONS = {
  initial: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
  CREATE TABLE \`activities\` (
    \`id\` text NOT NULL,
    \`data\` text NOT NULL
    PRIMARY KEY (\`id\`)
  )`
  }),
}

const makeWorkflowsSqlLive = (filename: string) => {
  const client = SqliteClient.layer({ filename })
  const migrator = SqliteMigrator.layer({
    loader: SqliteMigrator.fromRecord(MIGRATIONS),
  }).pipe(Layer.provide(BunContext.layer))
  return migrator.pipe(Layer.provideMerge(client))
}

/** SQLite database for production workflows state */
const WorkflowsSqlLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const filename = yield* Config.string("WORKFLOWS_DB_FILENAME").pipe(
      Config.withDefault("workflows.db"),
    )
    return makeWorkflowsSqlLive(filename)
  }),
)

/** SQLite database for testing (in-memory) */
const WorkflowsSqlTest = makeWorkflowsSqlLive(":memory:")

/** SingleRunner → ClusterWorkflowEngine, backed by file-based SQL */
export const ClusterLive = ClusterWorkflowEngine.layer.pipe(
  Layer.provideMerge(SingleRunner.layer()),
  Layer.provide(WorkflowsSqlLive),
)

/** SingleRunner → ClusterWorkflowEngine, backed by in-memory SQL */
export const ClusterTest = ClusterWorkflowEngine.layer.pipe(
  Layer.provideMerge(SingleRunner.layer()),
  Layer.provide(WorkflowsSqlTest),
)
