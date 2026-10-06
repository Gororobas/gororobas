import { SqliteClient } from "@effect/sql-sqlite-node"
import { Config, Effect, Layer } from "effect"
/**
 * Shared Effect Cluster infrastructure for all durable workflows.
 *
 * Uses SingleRunner (single-node, SQL-backed) so that workflow state
 * (activity results, execution status) is persisted in a separate SQLite
 * database from application data. The cluster tables are auto-created
 * by Effect cluster's SqlMessageStorage.
 *
 * All workflow layers (translation, notifications, etc.) compose on top
 * of this shared layer — they only need WorkflowEngine in their requirements.
 */
import { ClusterWorkflowEngine, SingleRunner } from "effect/cluster"

// SingleRunner creates its own message and runner tables through SqlMessageStorage.
const makeWorkflowsSqlLive = (filename: string) => SqliteClient.layer({ filename })

/** SQLite database for production workflows state */
const WorkflowsSqlLive = Layer.unwrap(
  Effect.gen(function* () {
    const filename = yield* Config.String("WORKFLOWS_DB_FILENAME").pipe(
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
