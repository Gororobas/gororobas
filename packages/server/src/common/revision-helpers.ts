import { type PersonId, RevisionEvaluation } from "@gororobas/domain"
import { Data, DateTime, Effect, Option, Schema } from "effect"
/**
 * Shared helpers for CRDT-based revision workflows.
 * Used by Vegetables and Resources repositories.
 */
import { SqlClient, SqlSchema } from "effect/unstable/sql"

/** Error for revision workflow operations */
export class RevisionWorkflowError extends Data.TaggedError("RevisionWorkflowError")<{
  reason:
    | "NOT_FOUND"
    | "INVALID_CRDT"
    | "ALREADY_EVALUATED"
    | "INVALID_EVALUATION"
    | "VALIDATION_FAILED"
  message?: string
  context?: Record<string, unknown>
}> {}

/** Create a CRDT fetch function for an entity */
export const makeFetchCrdt = <EntityId extends string>(config: {
  crdtTableName: string
  entityIdSchema: Schema.Schema<EntityId, string>
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const CrdtRow = Schema.Struct({
      id: config.entityIdSchema,
      loroCrdt: Schema.Uint8ArrayFromSelf,
    })

    return SqlSchema.findOne({
      execute: ({ id }) =>
        sql`
          SELECT id, loro_crdt
          FROM ${sql.unsafe(config.crdtTableName)}
          WHERE id = ${id}
        `,
      Request: Schema.Struct({ id: config.entityIdSchema }),
      Result: CrdtRow,
    })
  })

/** Create a CRDT insert function for an entity */
export const makeInsertCrdt = <EntityId extends string>(config: {
  crdtTableName: string
  entityIdSchema: Schema.Schema<EntityId, string>
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return (input: { id: EntityId; loroCrdt: Uint8Array; createdAt: string; updatedAt: string }) =>
      sql`
        INSERT INTO ${sql.unsafe(config.crdtTableName)} (id, loro_crdt, created_at, updated_at)
        VALUES (${input.id}, ${input.loroCrdt}, ${input.createdAt}, ${input.updatedAt})
      `
  })

/** Create a CRDT update function for an entity */
export const makeUpdateCrdt = <EntityId extends string>(config: {
  crdtTableName: string
  entityIdSchema: Schema.Schema<EntityId, string>
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return (input: { id: EntityId; loroCrdt: Uint8Array; updatedAt: string }) =>
      sql`
        UPDATE ${sql.unsafe(config.crdtTableName)}
        SET loro_crdt = ${input.loroCrdt}, updated_at = ${input.updatedAt}
        WHERE id = ${input.id}
      `
  })

/** Create a revision insert function for an entity */
export const makeInsertRevision = <EntityId extends string, RevisionId extends string>(config: {
  revisionsTableName: string
  entityIdColumn: string
  entityIdSchema: Schema.Schema<EntityId, string>
  revisionIdSchema: Schema.Schema<RevisionId, string>
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return (input: {
      id: RevisionId
      entityId: EntityId
      createdById: PersonId
      crdtUpdate: Uint8Array
      evaluation: typeof RevisionEvaluation.Type
      evaluatedById?: PersonId
      createdAt: string
      updatedAt: string
    }) =>
      sql`
        INSERT INTO ${sql.unsafe(config.revisionsTableName)} (
          id, ${sql.unsafe(config.entityIdColumn)}, created_by_id, crdt_update,
          evaluation, evaluated_by_id, created_at, updated_at
        ) VALUES (
          ${input.id}, ${input.entityId}, ${input.createdById}, ${input.crdtUpdate},
          ${input.evaluation}, ${input.evaluatedById ?? null}, ${input.createdAt}, ${input.updatedAt}
        )
        RETURNING id
      `
  })

/** Create a revision fetch function */
export const makeFetchRevision = <EntityId extends string, RevisionId extends string>(config: {
  revisionsTableName: string
  entityIdColumn: string
  entityIdSchema: Schema.Schema<EntityId, string>
  revisionIdSchema: Schema.Schema<RevisionId, string>
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const RevisionRow = Schema.Struct({
      crdtUpdate: Schema.Uint8ArrayFromSelf,
      entityId: config.entityIdSchema,
      evaluation: Schema.NullOr(RevisionEvaluation),
      id: config.revisionIdSchema,
    })

    return SqlSchema.findOne({
      execute: ({ revisionId }) =>
        sql`
          SELECT id, ${sql.unsafe(config.entityIdColumn)} as entityId, crdt_update, evaluation
          FROM ${sql.unsafe(config.revisionsTableName)}
          WHERE id = ${revisionId}
        `,
      Request: Schema.Struct({ revisionId: config.revisionIdSchema }),
      Result: RevisionRow,
    })
  })

/** Create a revision update function */
export const makeUpdateRevision = <RevisionId extends string>(config: {
  revisionsTableName: string
  revisionIdSchema: Schema.Schema<RevisionId, string>
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return (input: {
      revisionId: RevisionId
      evaluation: typeof RevisionEvaluation.Type
      evaluatedById: PersonId
      evaluatedAt: string
    }) =>
      sql`
        UPDATE ${sql.unsafe(config.revisionsTableName)}
        SET evaluation = ${input.evaluation}, evaluated_by_id = ${input.evaluatedById}, evaluated_at = ${input.evaluatedAt}
        WHERE id = ${input.revisionId}
      `
  })

/** Helper to get current timestamp as ISO string */
export const nowISOString = Effect.gen(function* () {
  const now = yield* DateTime.now
  return DateTime.formatIso(now)
})

/** Helper to require an Option value or fail with NotFound */
export const requireFound = <A, Id>(
  option: Option.Option<A>,
  id: Id,
): Effect.Effect<A, RevisionWorkflowError> =>
  Option.match(option, {
    onNone: () =>
      Effect.fail(
        new RevisionWorkflowError({
          context: { id },
          reason: "NOT_FOUND",
        }),
      ),
    onSome: Effect.succeed,
  })
