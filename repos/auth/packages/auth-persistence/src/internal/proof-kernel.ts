import {
  coordinateCommit,
  CurrentCommitJournal,
  hasCommitScope,
  LifecycleHooks,
  HookConfigurationError,
} from "@yielded/auth/Hooks";
import { reportPersistenceFailure } from "@yielded/auth/Persistence";
import {
  type ProofCompletionPlan,
  ProofBinding,
  type ProofAttemptDecision,
  type ProofCleanupResult,
  type ProofCompletionDecision,
  type ProofDeliveryOutcome,
  type ProofVersion,
  type ProofBudget,
  type ProofPolicy,
  ProofPersistence,
  type ProofDeliveryClaim,
  ProofRequestConflict,
  ProofUnavailable,
} from "@yielded/auth/Proofs";
import { Cause, Context, DateTime, Effect, Option, Schema } from "effect";
import type * as SqlError from "effect/sql/SqlError";

import { PersistenceMappingError } from "./mapping-error";
import {
  type AnyProofPersistenceMapping,
  requiredProofConstraints,
  type ProofPersistenceMapping,
  type ProofAction,
  type ProofCommandDecision,
  type ProofContinuationRecord,
  type ProofScopeKeys,
  type ProofScopeKind,
} from "./models/proof-model";
import {
  CurrentPasswordPreparedTransaction,
  PasswordPreparedPostconditions,
} from "./PasswordPreparedPostconditions";
/* oxlint-disable no-explicit-any -- existing storage kernels erase foreign table shapes; domain errors remain typed. */
import type { TableModel as Table } from "./query-operations";
import type { QueryFailure } from "./query-operations";
import type { QueryOperations, SqlFragment, SqlColumn } from "./query-operations";
import type { NativeDatabase } from "./transaction-kernel";

type AdapterFailure = QueryFailure | PersistenceMappingError | SqlError.SqlError;

export interface ProofSqlQuery<A = ReadonlyArray<any>> extends Effect.Effect<A, AdapterFailure> {
  readonly getSQL: () => ReturnType<QueryOperations["sql"]>;
  readonly from: (...args: ReadonlyArray<any>) => ProofSqlQuery<A>;
  readonly where: (...args: ReadonlyArray<any>) => ProofSqlQuery<A>;
  readonly limit: (...args: ReadonlyArray<any>) => ProofSqlQuery<A>;
  readonly orderBy: (...args: ReadonlyArray<any>) => ProofSqlQuery<A>;
  readonly for: (...args: ReadonlyArray<any>) => ProofSqlQuery<A>;
  readonly set: (...args: ReadonlyArray<any>) => ProofSqlQuery<A>;
  readonly values: (...args: ReadonlyArray<any>) => ProofSqlQuery<A>;
  readonly onConflictDoNothing: (...args: ReadonlyArray<any>) => ProofSqlQuery<A>;
  readonly onDuplicateKeyUpdate: (...args: ReadonlyArray<any>) => ProofSqlQuery<A>;
}

export interface ProofSqlDatabase {
  readonly select: (...args: ReadonlyArray<any>) => ProofSqlQuery;
  readonly insert: (...args: ReadonlyArray<any>) => ProofSqlQuery;
  readonly update: (...args: ReadonlyArray<any>) => ProofSqlQuery;
  readonly delete: (...args: ReadonlyArray<any>) => ProofSqlQuery;
  readonly transaction: <A, E, R>(
    body: (transaction: ProofSqlDatabase) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | SqlError.SqlError, R>;
}

export class CurrentProofSql extends Context.Service<CurrentProofSql, ProofSqlDatabase>()(
  "effect-auth/CurrentProofSql",
) {}

export interface ProofSqlConfiguration {
  readonly mode: "interactive" | "synchronous";
  readonly locking: boolean;
  readonly standaloneGuard: Effect.Effect<void, ProofUnavailable>;
  readonly coordinated?: boolean;
  /** Dialect-native insert-if-absent used to create serialization anchors. */
  readonly insertIfAbsent: (
    query: ProofSqlQuery,
    selfKey: string,
    selfValue: unknown,
  ) => ProofSqlQuery;
}

type Database = ProofSqlDatabase;

interface ScopeEntry {
  readonly kind: ProofScopeKind;
  readonly key: string;
  readonly budget: ProofBudget;
}

export const makeProofKernel = <
  Fragment extends SqlFragment = SqlFragment,
  Column extends SqlColumn = SqlColumn,
>(
  operations: QueryOperations<Fragment, Column>,
) => {
  type Mapping = AnyProofPersistenceMapping<Fragment>;

  const { and, eq, gte, inArray, isNull, lte, notExists, sql, column, updateValues } = operations;
  const unavailable = () => ProofUnavailable.make({});

  const translateFailure = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, ProofUnavailable, R> =>
    reportPersistenceFailure(
      effect,
      (error) => Schema.is(ProofUnavailable)(error) || Schema.is(HookConfigurationError)(error),
    ).pipe(Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, () => unavailable()))));

  const translateIssueFailure = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, ProofUnavailable | ProofRequestConflict, R> =>
    reportPersistenceFailure(
      effect,
      (error) =>
        Schema.is(ProofUnavailable)(error) ||
        Schema.is(ProofRequestConflict)(error) ||
        Schema.is(HookConfigurationError)(error),
    ).pipe(
      Effect.catchCause((cause) =>
        Effect.failCause(
          Cause.map(cause, (error) =>
            Schema.is(ProofRequestConflict)(error) ? error : unavailable(),
          ),
        ),
      ),
    );

  const conflict = () => ProofRequestConflict.make({});

  const validConstraints = (mapping: Mapping) =>
    Object.entries(requiredProofConstraints).every(
      ([key, value]) => mapping.constraints[key as keyof typeof requiredProofConstraints] === value,
    );

  const selectRows = (query: ProofSqlQuery, locking: boolean) =>
    locking && typeof query.for === "function" ? query.for("update") : query;

  const allocateVersion = (
    mapping: Mapping,
    mode: ProofSqlConfiguration["mode"],
  ): Effect.Effect<ProofVersion, ProofUnavailable | PersistenceMappingError> => {
    if (mode === "synchronous")
      return mapping.allocateVersionSync === undefined
        ? Effect.fail(unavailable())
        : Effect.try({
            try: mapping.allocateVersionSync,
            catch: (cause) => new PersistenceMappingError({ operation: "mapping", cause }),
          });
    if (mapping.allocateVersion !== undefined) return mapping.allocateVersion;

    return mapping.allocateVersionSync === undefined
      ? Effect.fail(unavailable())
      : Effect.try({
          try: mapping.allocateVersionSync,
          catch: (cause) => new PersistenceMappingError({ operation: "mapping", cause }),
        });
  };

  const canonicalBinding = Schema.encodeSync(Schema.fromJsonString(ProofBinding));

  const sameBinding = (left: ProofBinding, right: ProofBinding): boolean =>
    canonicalBinding(left) === canonicalBinding(right);

  const requestColumns = (mapping: Mapping) => ({
    moduleId: column(mapping.request.table, mapping.request.moduleId),
    requestId: column(mapping.request.table, mapping.request.requestId),
    fingerprint: column(mapping.request.table, mapping.request.fingerprint),
    proofId: column(mapping.request.table, mapping.request.proofId),
    retentionUntil: column(mapping.request.table, mapping.request.retentionUntil),
  });

  const seriesColumns = (mapping: Mapping) => ({
    moduleId: column(mapping.series.table, mapping.series.moduleId),
    purpose: column(mapping.series.table, mapping.series.purpose),
    scopeKey: column(mapping.series.table, mapping.series.scopeKey),
    activeProofId: column(mapping.series.table, mapping.series.activeProofId),
    lastIssueAt: column(mapping.series.table, mapping.series.lastIssueAt),
    version: column(mapping.series.table, mapping.series.version),
  });

  const generationColumns = (mapping: Mapping) => ({
    moduleId: column(mapping.generation.table, mapping.generation.moduleId),
    purpose: column(mapping.generation.table, mapping.generation.purpose),
    proofId: column(mapping.generation.table, mapping.generation.proofId),
    requestId: column(mapping.generation.table, mapping.generation.requestId),
    seriesKey: column(mapping.generation.table, mapping.generation.seriesKey),
    deliveryId: column(mapping.generation.table, mapping.generation.deliveryId),
    verifierKeyId: column(mapping.generation.table, mapping.generation.verifierKeyId),
    verifierDigest: column(mapping.generation.table, mapping.generation.verifierDigest),
    issuedAt: column(mapping.generation.table, mapping.generation.issuedAt),
    expiresAt: column(mapping.generation.table, mapping.generation.expiresAt),
    version: column(mapping.generation.table, mapping.generation.version),
    state: column(mapping.generation.table, mapping.generation.state),
    sendCount: column(mapping.generation.table, mapping.generation.sendCount),
    deliveryState: column(mapping.generation.table, mapping.generation.deliveryState),
    claimVersion: column(mapping.generation.table, mapping.generation.claimVersion),
    claimDeadline: column(mapping.generation.table, mapping.generation.claimDeadline),
    retryAt: column(mapping.generation.table, mapping.generation.retryAt),
    deliveryRetryMillis: column(mapping.generation.table, mapping.generation.deliveryRetryMillis),
    retentionUntil: column(mapping.generation.table, mapping.generation.retentionUntil),
  });

  const continuationColumns = (mapping: Mapping) => ({
    moduleId: column(mapping.continuation.table, mapping.continuation.moduleId),
    purpose: column(mapping.continuation.table, mapping.continuation.purpose),
    continuationId: column(mapping.continuation.table, mapping.continuation.continuationId),
    digest: column(mapping.continuation.table, mapping.continuation.digest),
    proofId: column(mapping.continuation.table, mapping.continuation.proofId),
    seriesKey: column(mapping.continuation.table, mapping.continuation.seriesKey),
    expiresAt: column(mapping.continuation.table, mapping.continuation.expiresAt),
    consumed: column(mapping.continuation.table, mapping.continuation.consumed),
    version: column(mapping.continuation.table, mapping.continuation.version),
    retentionUntil: column(mapping.continuation.table, mapping.continuation.retentionUntil),
  });

  const scopeColumns = (mapping: Mapping) => ({
    moduleId: column(mapping.rateScope.table, mapping.rateScope.moduleId),
    purpose: column(mapping.rateScope.table, mapping.rateScope.purpose),
    action: column(mapping.rateScope.table, mapping.rateScope.action),
    scopeKind: column(mapping.rateScope.table, mapping.rateScope.scopeKind),
    scopeKey: column(mapping.rateScope.table, mapping.rateScope.scopeKey),
  });

  const abuseColumns = (mapping: Mapping) => ({
    moduleId: column(mapping.abuseEvent.table, mapping.abuseEvent.moduleId),
    purpose: column(mapping.abuseEvent.table, mapping.abuseEvent.purpose),
    action: column(mapping.abuseEvent.table, mapping.abuseEvent.action),
    scopeKind: column(mapping.abuseEvent.table, mapping.abuseEvent.scopeKind),
    scopeKey: column(mapping.abuseEvent.table, mapping.abuseEvent.scopeKey),
    commandId: column(mapping.abuseEvent.table, mapping.abuseEvent.commandId),
    occurredAt: column(mapping.abuseEvent.table, mapping.abuseEvent.occurredAt),
    retentionUntil: column(mapping.abuseEvent.table, mapping.abuseEvent.retentionUntil),
  });

  const failureColumns = (mapping: Mapping) => ({
    moduleId: column(mapping.failureEvent.table, mapping.failureEvent.moduleId),
    purpose: column(mapping.failureEvent.table, mapping.failureEvent.purpose),
    seriesKey: column(mapping.failureEvent.table, mapping.failureEvent.seriesKey),
    commandId: column(mapping.failureEvent.table, mapping.failureEvent.commandId),
    occurredAt: column(mapping.failureEvent.table, mapping.failureEvent.occurredAt),
    retentionUntil: column(mapping.failureEvent.table, mapping.failureEvent.retentionUntil),
  });

  const commandColumns = (mapping: Mapping) => ({
    moduleId: column(mapping.command.table, mapping.command.moduleId),
    commandId: column(mapping.command.table, mapping.command.commandId),
    kind: column(mapping.command.table, mapping.command.kind),
    decision: column(mapping.command.table, mapping.command.decision),
    retentionUntil: column(mapping.command.table, mapping.command.retentionUntil),
  });

  const nowMillis = DateTime.now.pipe(Effect.map(DateTime.toEpochMillis));

  const lockAuthority = Effect.fn("DrizzleProof.lockAuthority")(function* (
    mapping: Mapping,
    moduleId: string,
    purpose: any,
    binding: ProofBinding,
    locking: boolean,
  ) {
    const database = yield* CurrentProofSql;

    const authority = mapping.authority;
    let nativeSubjectId: unknown | undefined;

    // Canonical order: subject, identifier rows, credentials sorted by ID.
    if (binding._tag !== "Identifier") {
      if (
        authority.subject === undefined ||
        authority.credential === undefined ||
        authority.subjectId === undefined
      )
        return yield* unavailable();
      nativeSubjectId = yield* authority.subjectId.toNative(binding.revision.subjectId);
      const subject = authority.subject;

      const rows = yield* selectRows(
        database
          .select()
          .from(subject.table)
          .where(eq(column(subject.table, subject.id), nativeSubjectId))
          .limit(1),
        locking,
      );

      const row = rows[0];

      if (
        row === undefined ||
        !subject.isActiveStatus(row[subject.status]) ||
        row[subject.securityRevision] !== binding.revision.securityRevision
      )
        return false;
    }
    const identifier = authority.identifier;

    const identifierRows = yield* selectRows(
      database
        .select()
        .from(identifier.table)
        .where(
          and(
            eq(column(identifier.table, identifier.namespace), binding.identifier.namespace),
            eq(column(identifier.table, identifier.value), binding.identifier.value),
          ),
        ),
      locking,
    );

    if (
      !identifier.isCurrent(
        {
          moduleId,
          purpose,
          binding,
          ...(nativeSubjectId === undefined ? {} : { nativeSubjectId }),
        },
        identifierRows,
      )
    )
      return false;
    if (binding._tag === "Identifier") return true;
    const credential = authority.credential!;

    const expected = [...binding.revision.credentials].sort((a, b) =>
      a.credentialId.localeCompare(b.credentialId),
    );

    const rows =
      expected.length === 0
        ? []
        : yield* selectRows(
            database
              .select()
              .from(credential.table)
              .where(
                and(
                  eq(column(credential.table, credential.subjectId), nativeSubjectId),
                  inArray(
                    column(credential.table, credential.credentialId),
                    expected.map((item) => item.credentialId),
                  ),
                ),
              ),
            locking,
          );

    if (rows.length !== expected.length) return false;

    const actual = rows
      .map((row: any) => ({
        credentialId: row[credential.credentialId] as string,
        revision: row[credential.revision],
        active:
          credential.status === undefined ||
          credential.isActiveStatus?.(row[credential.status]) === true,
      }))
      .sort((a: any, b: any) => a.credentialId.localeCompare(b.credentialId));

    return actual.every(
      (item: any, index: number) =>
        item.active &&
        item.credentialId === expected[index]?.credentialId &&
        item.revision === expected[index]?.revision,
    );
  });

  const scopeEntries = (
    keys: ProofScopeKeys,
    binding: ProofBinding,
    action: ProofAction,
    policy: ProofPolicy,
  ): ReadonlyArray<ScopeEntry> => {
    const suffix = action === "issue" ? "Issues" : "Attempts";
    const simple = action === "issue" ? "issues" : "attempts";

    const entries: ScopeEntry[] = [
      { kind: "action", key: "*", budget: policy.abuse[`action${suffix}`] },
      { kind: "identifier", key: keys.identifier, budget: policy.abuse[simple] },
    ];

    if (binding._tag !== "Identifier")
      entries.push({
        kind: "subject",
        key: keys.subject,
        budget: policy.abuse[`subject${suffix}`],
      });

    return entries;
  };

  const lockScopes = Effect.fn("DrizzleProof.lockScopes")(function* (
    mapping: Mapping,
    configuration: ProofSqlConfiguration,
    moduleId: string,
    purpose: any,
    action: ProofAction,
    entries: ReadonlyArray<ScopeEntry>,
  ) {
    const database = yield* CurrentProofSql;

    const c = scopeColumns(mapping);

    for (const entry of entries) {
      const values = mapping.rateScope.encodeInsert({
        moduleId,
        purpose,
        action,
        scopeKind: entry.kind,
        scopeKey: entry.key,
      });

      const query = database.insert(mapping.rateScope.table).values(values);

      yield* configuration.insertIfAbsent(query, mapping.rateScope.scopeKey, entry.key);
      yield* selectRows(
        database
          .select()
          .from(mapping.rateScope.table)
          .where(
            and(
              eq(c.moduleId, moduleId),
              eq(c.purpose, purpose),
              eq(c.action, action),
              eq(c.scopeKind, entry.kind),
              eq(c.scopeKey, entry.key),
            ),
          )
          .limit(1),
        configuration.locking,
      );
    }
  });

  const admittedScopes = Effect.fn("DrizzleProof.admittedScopes")(function* (
    mapping: Mapping,
    moduleId: string,
    purpose: any,
    action: ProofAction,
    entries: ReadonlyArray<ScopeEntry>,
    now: number,
  ) {
    const database = yield* CurrentProofSql;

    const c = abuseColumns(mapping);
    const admitted: ScopeEntry[] = [];

    for (const entry of entries) {
      const rows = yield* selectRows(
        database
          .select({ commandId: c.commandId })
          .from(mapping.abuseEvent.table)
          .where(
            and(
              eq(c.moduleId, moduleId),
              eq(c.purpose, purpose),
              eq(c.action, action),
              eq(c.scopeKind, entry.kind),
              eq(c.scopeKey, entry.key),
              gte(c.occurredAt, mapping.encodeInstant(now - entry.budget.windowMillis)),
            ),
          )
          .limit(entry.budget.limit),
        true,
      );

      if (rows.length < entry.budget.limit) admitted.push(entry);
    }

    return admitted;
  });

  const insertScopeEvents = Effect.fn("Drizzle.insertScopeEvents")(function* (
    mapping: Mapping,
    moduleId: string,
    purpose: any,
    action: ProofAction,
    commandId: string,
    entries: ReadonlyArray<ScopeEntry>,
    now: number,
    retentionUntil: number,
  ) {
    const database = yield* CurrentProofSql;

    return yield* Effect.forEach(
      entries,
      (entry) =>
        database.insert(mapping.abuseEvent.table).values(
          mapping.abuseEvent.encodeInsert({
            moduleId,
            purpose,
            action,
            scopeKind: entry.kind,
            scopeKey: entry.key,
            commandId,
            occurredAtMillis: now,
            retentionUntilMillis: retentionUntil,
          }),
        ),
      { discard: true },
    );
  });

  const ensureSeries = Effect.fn("DrizzleProof.ensureSeries")(function* (
    mapping: Mapping,
    configuration: ProofSqlConfiguration,
    moduleId: string,
    purpose: any,
    scopeKey: string,
  ) {
    const database = yield* CurrentProofSql;

    const c = seriesColumns(mapping);
    const initialVersion = yield* allocateVersion(mapping, configuration.mode);

    const query = database
      .insert(mapping.series.table)
      .values(
        mapping.series.encodeInsert({ moduleId, purpose, scopeKey, version: initialVersion }),
      );

    yield* configuration.insertIfAbsent(query, mapping.series.scopeKey, scopeKey);

    const rows = yield* selectRows(
      database
        .select()
        .from(mapping.series.table)
        .where(and(eq(c.moduleId, moduleId), eq(c.purpose, purpose), eq(c.scopeKey, scopeKey)))
        .limit(1),
      configuration.locking,
    );

    return rows[0] ?? (yield* unavailable());
  });

  const readGeneration = Effect.fn("Drizzle.readGeneration")(function* (
    mapping: Mapping,
    moduleId: string,
    proofId: string,
    locking: boolean,
  ) {
    const database = yield* CurrentProofSql;

    const c = generationColumns(mapping);

    return yield* selectRows(
      database
        .select()
        .from(mapping.generation.table)
        .where(and(eq(c.moduleId, moduleId), eq(c.proofId, proofId)))
        .limit(1),
      locking,
    );
  });

  const failureCount = Effect.fn("DrizzleProof.failureCount")(function* (
    mapping: Mapping,
    moduleId: string,
    purpose: any,
    seriesKey: string,
    now: number,
    policy: ProofPolicy,
  ) {
    const database = yield* CurrentProofSql;

    const c = failureColumns(mapping);

    const rows = yield* selectRows(
      database
        .select({ commandId: c.commandId })
        .from(mapping.failureEvent.table)
        .where(
          and(
            eq(c.moduleId, moduleId),
            eq(c.purpose, purpose),
            eq(c.seriesKey, seriesKey),
            gte(c.occurredAt, mapping.encodeInstant(now - policy.abuse.attempts.windowMillis)),
          ),
        )
        .limit(policy.maximumFailedAttempts),
      true,
    );

    return rows.length;
  });

  const commandRow = Effect.fn("Drizzle.commandRow")(function* (
    mapping: Mapping,
    moduleId: string,
    commandId: string,
    locking: boolean,
  ) {
    const database = yield* CurrentProofSql;

    const c = commandColumns(mapping);

    return yield* selectRows(
      database
        .select()
        .from(mapping.command.table)
        .where(and(eq(c.moduleId, moduleId), eq(c.commandId, commandId)))
        .limit(1),
      locking,
    );
  });

  const insertCommand = Effect.fn("Drizzle.insertCommand")(function* (
    mapping: Mapping,
    moduleId: string,
    commandId: string,
    kind: "attempt" | "complete",
    decision: ProofCommandDecision,
    retentionUntil: number,
  ) {
    const database = yield* CurrentProofSql;

    return yield* database.insert(mapping.command.table).values(
      mapping.command.encodeInsert({
        moduleId,
        commandId,
        kind,
        decision,
        retentionUntilMillis: retentionUntil,
      }),
    );
  });

  const owned = <A, E, R>(
    database: Database,
    mapping: Mapping,
    configuration: ProofSqlConfiguration,
    body: Effect.Effect<A, E, R>,
  ) => {
    if (!validConstraints(mapping)) return Effect.fail(unavailable());

    const run = coordinateCommit(
      () =>
        database.transaction((transaction) =>
          body.pipe(Effect.provideService(CurrentProofSql, transaction)),
        ),
      { mode: configuration.mode },
    ).pipe(Effect.map((result) => result.value));

    return configuration.coordinated !== true
      ? Effect.gen(function* () {
          if (yield* hasCommitScope) return yield* unavailable();
          yield* configuration.standaloneGuard;

          return yield* run;
        })
      : run;
  };

  const makeSqlProofPersistence = Effect.fn("makeSqlProofPersistence")(function* (
    mapping: Mapping,
    configuration: ProofSqlConfiguration,
  ): Effect.fn.Return<
    ProofPersistence["Service"],
    ProofUnavailable,
    LifecycleHooks | CurrentProofSql | NativeDatabase
  > {
    const database = yield* CurrentProofSql;

    if (!configuration.coordinated)
      yield* (operations.validateStorage?.(mapping) ?? Effect.void).pipe(
        Effect.mapError(unavailable),
      );
    const hooks = yield* LifecycleHooks;

    return ProofPersistence.of({
      issue: (input, prepare) =>
        owned(
          database,
          mapping,
          configuration,
          Effect.gen(function* () {
            const transaction = yield* CurrentProofSql;
            const journal = yield* CurrentCommitJournal;

            const keys = mapping.scopeKeys({
              moduleId: input.record.moduleId,
              purpose: input.record.purpose,
              binding: input.record.binding,
            });

            const authorityCurrent = yield* lockAuthority(
              mapping,
              input.record.moduleId,
              input.record.purpose,
              input.record.binding,
              configuration.locking,
            );

            const scopes = scopeEntries(keys, input.record.binding, "issue", input.policy);

            yield* lockScopes(
              mapping,
              configuration,
              input.record.moduleId,
              input.record.purpose,
              "issue",
              scopes.slice(0, 1),
            );
            const actionNow = yield* nowMillis;

            const actionOpen =
              (yield* admittedScopes(
                mapping,
                input.record.moduleId,
                input.record.purpose,
                "issue",
                scopes.slice(0, 1),
                actionNow,
              )).length === 1;

            if (actionOpen)
              yield* lockScopes(
                mapping,
                configuration,
                input.record.moduleId,
                input.record.purpose,
                "issue",
                scopes.slice(1),
              );

            const series = actionOpen
              ? yield* ensureSeries(
                  mapping,
                  configuration,
                  input.record.moduleId,
                  input.record.purpose,
                  keys.series,
                )
              : undefined;

            const now = yield* nowMillis;
            const retentionUntil = now + input.policy.requestRetentionMillis;
            const rc = requestColumns(mapping);

            let requestRows = yield* selectRows(
              transaction
                .select()
                .from(mapping.request.table)
                .where(
                  and(
                    eq(rc.moduleId, input.record.moduleId),
                    eq(rc.requestId, input.record.requestId),
                  ),
                )
                .limit(1),
              configuration.locking,
            );

            let request = requestRows[0];

            if (request !== undefined) {
              const retainedUntil = yield* mapping.decodeInstant(
                request[mapping.request.retentionUntil],
              );

              if (retainedUntil > now) {
                if (request[mapping.request.fingerprint] !== input.record.fingerprint)
                  return yield* conflict();
                const receipt = yield* mapping.request.decodeReceipt(request);

                return prepare({ _tag: "Existing", receipt }, journal);
              }
              yield* transaction
                .delete(mapping.request.table)
                .where(
                  and(
                    eq(rc.moduleId, input.record.moduleId),
                    eq(rc.requestId, input.record.requestId),
                    lte(rc.retentionUntil, mapping.encodeInstant(now)),
                  ),
                );
            }

            const requestInsert = mapping.request.encodeInsert({
              record: input.record,
              createdAtMillis: now,
              retentionUntilMillis: retentionUntil,
            });

            const requestQuery = transaction.insert(mapping.request.table).values(requestInsert);

            yield* configuration.insertIfAbsent(
              requestQuery,
              mapping.request.requestId,
              input.record.requestId,
            );
            requestRows = yield* selectRows(
              transaction
                .select()
                .from(mapping.request.table)
                .where(
                  and(
                    eq(rc.moduleId, input.record.moduleId),
                    eq(rc.requestId, input.record.requestId),
                  ),
                )
                .limit(1),
              configuration.locking,
            );
            request = requestRows[0];

            if (request === undefined) return yield* unavailable();
            if (request[mapping.request.fingerprint] !== input.record.fingerprint)
              return yield* conflict();
            if (request[mapping.request.proofId] !== input.record.proofId) {
              const receipt = yield* mapping.request.decodeReceipt(request);

              return prepare({ _tag: "Existing", receipt }, journal);
            }

            const admitted = actionOpen
              ? yield* admittedScopes(
                  mapping,
                  input.record.moduleId,
                  input.record.purpose,
                  "issue",
                  scopes,
                  now,
                )
              : [];

            const sc = seriesColumns(mapping);

            const lastIssueAt =
              series?.[mapping.series.lastIssueAt] === null ||
              series?.[mapping.series.lastIssueAt] === undefined
                ? undefined
                : yield* mapping.decodeInstant(series[mapping.series.lastIssueAt]);

            const activeProofId = series?.[mapping.series.activeProofId] as
              | string
              | null
              | undefined;

            const activeGeneration =
              activeProofId === null || activeProofId === undefined
                ? undefined
                : (yield* readGeneration(
                    mapping,
                    input.record.moduleId,
                    activeProofId,
                    configuration.locking,
                  ))[0];

            if (
              activeProofId !== null &&
              activeProofId !== undefined &&
              (activeGeneration === undefined ||
                activeGeneration[mapping.generation.purpose] !== input.record.purpose)
            )
              return yield* unavailable();

            const replacementAuthorized =
              activeGeneration === undefined ||
              activeGeneration[mapping.generation.state] !== "active" ||
              (yield* mapping.decodeInstant(activeGeneration[mapping.generation.expiresAt])) <=
                now ||
              sameBinding(
                yield* mapping.generation.decodeBinding(activeGeneration),
                input.record.binding,
              );

            const supersedesCurrent =
              input.supersedes === undefined || input.supersedes === activeProofId;

            const allowed =
              authorityCurrent &&
              input.eligible &&
              admitted.length === scopes.length &&
              input.record.issuedAtMillis <= now &&
              input.record.expiresAtMillis > now &&
              replacementAuthorized &&
              supersedesCurrent &&
              (lastIssueAt === undefined ||
                now - lastIssueAt >= input.policy.abuse.resendCooldownMillis);

            const receipt = {
              requestId: input.record.requestId,
              reference: {
                proofId: input.record.proofId,
                purpose: input.record.purpose,
                keyId: input.record.verifier.keyId,
              },
            };

            const prepared = prepare(
              allowed
                ? ({ _tag: "Issued", record: input.record } as const)
                : ({ _tag: "Suppressed", receipt } as const),
              journal,
            );

            if (!allowed) return prepared;
            yield* insertScopeEvents(
              mapping,
              input.record.moduleId,
              input.record.purpose,
              "issue",
              input.record.requestId,
              scopes,
              now,
              retentionUntil,
            );
            if (activeProofId !== null && activeProofId !== undefined)
              yield* transaction
                .update(mapping.generation.table)
                .set(updateValues([[mapping.generation.state, "superseded"]]))
                .where(
                  and(
                    eq(generationColumns(mapping).moduleId, input.record.moduleId),
                    eq(generationColumns(mapping).proofId, activeProofId),
                    eq(generationColumns(mapping).state, "active"),
                  ),
                );
            yield* transaction.insert(mapping.generation.table).values(
              mapping.generation.encodeInsert({
                record: input.record,
                seriesKey: keys.series,
                retentionUntilMillis: retentionUntil,
                state: "active",
                deliveryState: "new",
                policy: input.policy,
              }),
            );
            const nextVersion = yield* allocateVersion(mapping, configuration.mode);

            yield* transaction
              .update(mapping.series.table)
              .set(
                updateValues([
                  [mapping.series.activeProofId, input.record.proofId],
                  [mapping.series.lastIssueAt, mapping.encodeInstant(now)],
                  [mapping.series.version, nextVersion],
                ]),
              )
              .where(
                and(
                  eq(sc.moduleId, input.record.moduleId),
                  eq(sc.purpose, input.record.purpose),
                  eq(sc.scopeKey, keys.series),
                ),
              );

            return prepared;
          }),
        ).pipe(
          Effect.provideService(CurrentProofSql, database),
          Effect.provideService(LifecycleHooks, hooks),
          translateIssueFailure,
        ),
      attempt: (input, prepare) =>
        owned(
          database,
          mapping,
          configuration,
          Effect.gen(function* () {
            const transaction = yield* CurrentProofSql;
            const journal = yield* CurrentCommitJournal;

            const keys = mapping.scopeKeys({
              moduleId: input.moduleId,
              purpose: input.purpose,
              binding: input.binding,
            });

            const authorityCurrent = yield* lockAuthority(
              mapping,
              input.moduleId,
              input.purpose,
              input.binding,
              configuration.locking,
            );

            const scopes = scopeEntries(keys, input.binding, "attempt", input.policy);

            yield* lockScopes(
              mapping,
              configuration,
              input.moduleId,
              input.purpose,
              "attempt",
              scopes.slice(0, 1),
            );
            const actionNow = yield* nowMillis;

            const actionOpen =
              (yield* admittedScopes(
                mapping,
                input.moduleId,
                input.purpose,
                "attempt",
                scopes.slice(0, 1),
                actionNow,
              )).length === 1;

            if (actionOpen)
              yield* lockScopes(
                mapping,
                configuration,
                input.moduleId,
                input.purpose,
                "attempt",
                scopes.slice(1),
              );

            const series = actionOpen
              ? yield* ensureSeries(
                  mapping,
                  configuration,
                  input.moduleId,
                  input.purpose,
                  keys.series,
                )
              : undefined;

            const generation = (yield* readGeneration(
              mapping,
              input.moduleId,
              input.proofId,
              configuration.locking,
            ))[0];

            const existingCommand = (yield* commandRow(
              mapping,
              input.moduleId,
              input.continuationId,
              configuration.locking,
            ))[0];

            if (existingCommand !== undefined) {
              if (existingCommand[mapping.command.decision] === "rejected")
                return prepare({ _tag: "Rejected" }, journal);

              return yield* unavailable();
            }
            const now = yield* nowMillis;

            const admitted = actionOpen
              ? yield* admittedScopes(
                  mapping,
                  input.moduleId,
                  input.purpose,
                  "attempt",
                  scopes,
                  now,
                )
              : [];

            const failures = yield* failureCount(
              mapping,
              input.moduleId,
              input.purpose,
              keys.series,
              now,
              input.policy,
            );

            const gc = generationColumns(mapping);
            const activeProofId = series?.[mapping.series.activeProofId];

            const storedBinding =
              generation === undefined
                ? undefined
                : yield* mapping.generation.decodeBinding(generation);

            const candidateMatches =
              generation !== undefined &&
              input.candidate !== undefined &&
              generation[mapping.generation.verifierKeyId] === input.candidate.keyId &&
              generation[mapping.generation.verifierDigest] === input.candidate.digest;

            const currentGeneration =
              generation !== undefined &&
              generation[mapping.generation.purpose] === input.purpose &&
              generation[mapping.generation.state] === "active" &&
              activeProofId === input.proofId &&
              storedBinding !== undefined &&
              sameBinding(storedBinding, input.binding) &&
              Number(yield* mapping.decodeInstant(generation[mapping.generation.expiresAt])) > now;

            const accepted =
              authorityCurrent &&
              currentGeneration &&
              candidateMatches &&
              admitted.length === scopes.length &&
              failures < input.policy.maximumFailedAttempts;

            const retentionUntil = now + input.policy.requestRetentionMillis;

            if (!accepted) {
              const prepared = prepare({ _tag: "Rejected" }, journal);

              yield* insertCommand(
                mapping,
                input.moduleId,
                input.continuationId,
                "attempt",
                "rejected",
                retentionUntil,
              );
              yield* insertScopeEvents(
                mapping,
                input.moduleId,
                input.purpose,
                "attempt",
                input.continuationId,
                admitted,
                now,
                retentionUntil,
              );
              if (
                admitted.length === scopes.length &&
                currentGeneration &&
                !candidateMatches &&
                failures < input.policy.maximumFailedAttempts
              )
                yield* transaction.insert(mapping.failureEvent.table).values(
                  mapping.failureEvent.encodeInsert({
                    moduleId: input.moduleId,
                    purpose: input.purpose,
                    seriesKey: keys.series,
                    commandId: input.continuationId,
                    occurredAtMillis: now,
                    retentionUntilMillis: retentionUntil,
                  }),
                );

              return prepared;
            }
            const version = yield* allocateVersion(mapping, configuration.mode);

            const expiresAt = Math.min(
              Number(yield* mapping.decodeInstant(generation![mapping.generation.expiresAt])),
              now + input.policy.continuationLifetimeMillis,
            );

            const continuation: ProofContinuationRecord = {
              moduleId: input.moduleId,
              purpose: input.purpose,
              continuationId: input.continuationId,
              digest: input.continuationDigest,
              proofId: input.proofId,
              seriesKey: keys.series,
              binding: input.binding,
              expiresAtMillis: expiresAt,
              version,
            };

            const decision: ProofAttemptDecision = {
              _tag: "Accepted",
              continuation: {
                continuationId: input.continuationId,
                purpose: input.purpose,
                expiresAtMillis: expiresAt,
              },
            };

            const prepared = prepare(decision, journal);

            yield* insertCommand(
              mapping,
              input.moduleId,
              input.continuationId,
              "attempt",
              "accepted",
              retentionUntil,
            );
            yield* insertScopeEvents(
              mapping,
              input.moduleId,
              input.purpose,
              "attempt",
              input.continuationId,
              scopes,
              now,
              retentionUntil,
            );
            yield* transaction
              .update(mapping.generation.table)
              .set(updateValues([[mapping.generation.state, "consumed"]]))
              .where(
                and(
                  eq(gc.moduleId, input.moduleId),
                  eq(gc.proofId, input.proofId),
                  eq(gc.state, "active"),
                ),
              );
            yield* transaction.insert(mapping.continuation.table).values(
              mapping.continuation.encodeInsert({
                ...continuation,
                retentionUntilMillis: retentionUntil,
              }),
            );

            return prepared;
          }),
        ).pipe(
          Effect.provideService(CurrentProofSql, database),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
      complete: (input, prepare) =>
        owned(
          database,
          mapping,
          configuration,
          Effect.gen(function* () {
            const journal = yield* CurrentCommitJournal;

            return yield* completeIn(mapping, configuration, input, (decision) =>
              prepare(decision, journal),
            );
          }),
        ).pipe(
          Effect.provideService(CurrentProofSql, database),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
      claimDelivery: (input, prepare) =>
        owned(
          database,
          mapping,
          configuration,
          Effect.gen(function* () {
            const transaction = yield* CurrentProofSql;
            const journal = yield* CurrentCommitJournal;

            const rows = yield* readGeneration(
              mapping,
              input.moduleId,
              input.proofId,
              configuration.locking,
            );

            const row = rows[0];
            const now = yield* nowMillis;

            if (row === undefined) return prepare({ _tag: "Declined" }, journal);
            const c = generationColumns(mapping);
            const expiresAt = yield* mapping.decodeInstant(row[mapping.generation.expiresAt]);

            const claimDeadline =
              row[mapping.generation.claimDeadline] === null ||
              row[mapping.generation.claimDeadline] === undefined
                ? undefined
                : yield* mapping.decodeInstant(row[mapping.generation.claimDeadline]);

            const retryAt =
              row[mapping.generation.retryAt] === null ||
              row[mapping.generation.retryAt] === undefined
                ? undefined
                : yield* mapping.decodeInstant(row[mapping.generation.retryAt]);

            let state = row[mapping.generation.deliveryState] as string;

            if (state === "claimed" && claimDeadline !== undefined && claimDeadline <= now) {
              state = "ambiguous";
              yield* transaction
                .update(mapping.generation.table)
                .set(updateValues([[mapping.generation.deliveryState, "ambiguous"]]))
                .where(and(eq(c.moduleId, input.moduleId), eq(c.proofId, input.proofId)));
            }

            const canClaim =
              row[mapping.generation.version] === input.version &&
              row[mapping.generation.deliveryId] === input.deliveryId &&
              row[mapping.generation.state] === "active" &&
              expiresAt > now &&
              Number(row[mapping.generation.sendCount]) < input.policy.maximumDeliveryAttempts &&
              (state === "new" ||
                (state === "ambiguous" &&
                  input.allowAmbiguousRetry &&
                  (retryAt === undefined || retryAt <= now)));

            if (!canClaim) return prepare({ _tag: "Declined" }, journal);
            const claimVersion = yield* allocateVersion(mapping, configuration.mode);
            const decision: ProofDeliveryClaim = { _tag: "Claimed", claimVersion };
            const prepared = prepare(decision, journal);

            yield* transaction
              .update(mapping.generation.table)
              .set(
                updateValues([
                  [mapping.generation.sendCount, Number(row[mapping.generation.sendCount]) + 1],
                  [mapping.generation.deliveryState, "claimed"],
                  [mapping.generation.claimVersion, claimVersion],
                  [
                    mapping.generation.claimDeadline,
                    mapping.encodeInstant(now + input.policy.deliveryClaimMillis),
                  ],
                  [
                    mapping.generation.retryAt,
                    mapping.encodeInstant(now + input.policy.deliveryRetryMillis),
                  ],
                ]),
              )
              .where(and(eq(c.moduleId, input.moduleId), eq(c.proofId, input.proofId)));

            return prepared;
          }),
        ).pipe(
          Effect.provideService(CurrentProofSql, database),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
      settleDelivery: (input, prepare) =>
        owned(
          database,
          mapping,
          configuration,
          Effect.gen(function* () {
            const transaction = yield* CurrentProofSql;
            const journal = yield* CurrentCommitJournal;

            const initial = (yield* readGeneration(
              mapping,
              input.moduleId,
              input.proofId,
              false,
            ))[0];

            if (initial === undefined) return prepare(undefined, journal);
            const keys = initial[mapping.generation.seriesKey] as string;

            yield* ensureSeries(
              mapping,
              configuration,
              input.moduleId,
              initial[mapping.generation.purpose],
              keys,
            );

            const row = (yield* readGeneration(
              mapping,
              input.moduleId,
              input.proofId,
              configuration.locking,
            ))[0];

            const prepared = prepare(undefined, journal);

            if (
              row === undefined ||
              row[mapping.generation.version] !== input.version ||
              row[mapping.generation.deliveryId] !== input.deliveryId ||
              row[mapping.generation.claimVersion] !== input.claimVersion ||
              row[mapping.generation.deliveryState] !== "claimed"
            )
              return prepared;
            const c = generationColumns(mapping);
            const outcome: ProofDeliveryOutcome = input.outcome;

            const state =
              outcome._tag === "Accepted"
                ? "accepted"
                : outcome._tag === "DefiniteFailure"
                  ? "failed"
                  : "ambiguous";

            const values: Array<readonly [string, unknown]> = [
              [mapping.generation.deliveryState, state],
              [mapping.generation.claimDeadline, null],
            ];

            if (outcome._tag === "Ambiguous")
              values.push([
                mapping.generation.retryAt,
                mapping.encodeInstant(
                  (yield* nowMillis) + Number(row[mapping.generation.deliveryRetryMillis]),
                ),
              ]);
            if (outcome._tag === "DefiniteFailure")
              values.push([mapping.generation.state, "cancelled"]);
            yield* transaction
              .update(mapping.generation.table)
              .set(updateValues(values))
              .where(and(eq(c.moduleId, input.moduleId), eq(c.proofId, input.proofId)));
            if (outcome._tag === "DefiniteFailure") {
              const sc = seriesColumns(mapping);

              yield* transaction
                .update(mapping.series.table)
                .set(updateValues([[mapping.series.activeProofId, null]]))
                .where(
                  and(
                    eq(sc.moduleId, input.moduleId),
                    eq(sc.purpose, row[mapping.generation.purpose]),
                    eq(sc.scopeKey, keys),
                    eq(sc.activeProofId, input.proofId),
                  ),
                );
            }

            return prepared;
          }),
        ).pipe(
          Effect.provideService(CurrentProofSql, database),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
      cancel: (input, prepare) =>
        owned(
          database,
          mapping,
          configuration,
          Effect.gen(function* () {
            const transaction = yield* CurrentProofSql;
            const journal = yield* CurrentCommitJournal;

            const authorityCurrent = yield* lockAuthority(
              mapping,
              input.moduleId,
              input.purpose,
              input.binding,
              configuration.locking,
            );

            const keys = mapping.scopeKeys({
              moduleId: input.moduleId,
              purpose: input.purpose,
              binding: input.binding,
            });

            const series = yield* ensureSeries(
              mapping,
              configuration,
              input.moduleId,
              input.purpose,
              keys.series,
            );

            const active = series[mapping.series.activeProofId] as string | undefined | null;
            const prepared = prepare(undefined, journal);

            if (authorityCurrent && active !== undefined && active !== null) {
              const gc = generationColumns(mapping);
              const sc = seriesColumns(mapping);

              const row = (yield* readGeneration(
                mapping,
                input.moduleId,
                active,
                configuration.locking,
              ))[0];

              const storedBinding =
                row === undefined ? undefined : yield* mapping.generation.decodeBinding(row);

              if (storedBinding === undefined || !sameBinding(storedBinding, input.binding))
                return prepared;

              yield* transaction
                .update(mapping.generation.table)
                .set(updateValues([[mapping.generation.state, "cancelled"]]))
                .where(and(eq(gc.moduleId, input.moduleId), eq(gc.proofId, active)));
              yield* transaction
                .update(mapping.series.table)
                .set(updateValues([[mapping.series.activeProofId, null]]))
                .where(
                  and(
                    eq(sc.moduleId, input.moduleId),
                    eq(sc.purpose, input.purpose),
                    eq(sc.scopeKey, keys.series),
                    eq(sc.activeProofId, active),
                  ),
                );
            }

            return prepared;
          }),
        ).pipe(
          Effect.provideService(CurrentProofSql, database),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
      cleanup: (input, prepare) =>
        owned(
          database,
          mapping,
          configuration,
          Effect.gen(function* () {
            const transaction = yield* CurrentProofSql;
            const journal = yield* CurrentCommitJournal;

            const now = yield* nowMillis;
            const nativeNow = mapping.encodeInstant(now);
            const gc = generationColumns(mapping);
            const cc = continuationColumns(mapping);
            const rc = requestColumns(mapping);
            const ac = abuseColumns(mapping);
            const fc = failureColumns(mapping);
            const mc = commandColumns(mapping);
            const sc = seriesColumns(mapping);
            const rsc = scopeColumns(mapping);
            let remaining = input.limit;
            let hasMore = false;

            const take = <A>(query: ProofSqlQuery<ReadonlyArray<A>>) =>
              selectRows(query.limit(remaining + 1), configuration.locking).pipe(
                Effect.map((rows) => {
                  if (rows.length > remaining) hasMore = true;
                  const selected = rows.slice(0, remaining);

                  remaining -= selected.length;

                  return selected;
                }),
              );

            // Child rows and secret-bearing generations are removed before their
            // retained request/decision records. Every selected row counts toward
            // one caller-wide limit and is locked until this owner commits.
            const continuations = yield* take(
              transaction
                .select({ continuationId: cc.continuationId })
                .from(mapping.continuation.table)
                .where(and(eq(cc.moduleId, input.moduleId), lte(cc.retentionUntil, nativeNow)))
                .orderBy(cc.retentionUntil),
            );

            const generations = yield* take(
              transaction
                .select({ proofId: gc.proofId })
                .from(mapping.generation.table)
                .where(and(eq(gc.moduleId, input.moduleId), lte(gc.retentionUntil, nativeNow)))
                .orderBy(gc.retentionUntil),
            );

            const requests = yield* take(
              transaction
                .select({ requestId: rc.requestId })
                .from(mapping.request.table)
                .where(and(eq(rc.moduleId, input.moduleId), lte(rc.retentionUntil, nativeNow)))
                .orderBy(rc.retentionUntil),
            );

            const abuse = yield* take(
              transaction
                .select({
                  action: ac.action,
                  scopeKind: ac.scopeKind,
                  scopeKey: ac.scopeKey,
                  commandId: ac.commandId,
                })
                .from(mapping.abuseEvent.table)
                .where(and(eq(ac.moduleId, input.moduleId), lte(ac.retentionUntil, nativeNow)))
                .orderBy(ac.retentionUntil),
            );

            const failures = yield* take(
              transaction
                .select({ seriesKey: fc.seriesKey, commandId: fc.commandId })
                .from(mapping.failureEvent.table)
                .where(and(eq(fc.moduleId, input.moduleId), lte(fc.retentionUntil, nativeNow)))
                .orderBy(fc.retentionUntil),
            );

            const commands = yield* take(
              transaction
                .select({ commandId: mc.commandId })
                .from(mapping.command.table)
                .where(and(eq(mc.moduleId, input.moduleId), lte(mc.retentionUntil, nativeNow)))
                .orderBy(mc.retentionUntil),
            );

            const series = yield* take(
              transaction
                .select({ purpose: sc.purpose, scopeKey: sc.scopeKey })
                .from(mapping.series.table)
                .where(
                  and(
                    eq(sc.moduleId, input.moduleId),
                    isNull(sc.activeProofId),
                    notExists(
                      transaction
                        .select({ one: sql`1` })
                        .from(mapping.generation.table)
                        .where(
                          and(
                            eq(gc.moduleId, sc.moduleId),
                            eq(gc.purpose, sc.purpose),
                            eq(gc.seriesKey, sc.scopeKey),
                          ),
                        ),
                    ),
                    notExists(
                      transaction
                        .select({ one: sql`1` })
                        .from(mapping.failureEvent.table)
                        .where(
                          and(
                            eq(fc.moduleId, sc.moduleId),
                            eq(fc.purpose, sc.purpose),
                            eq(fc.seriesKey, sc.scopeKey),
                          ),
                        ),
                    ),
                  ),
                ),
            );

            const rateScopes = yield* take(
              transaction
                .select({
                  purpose: rsc.purpose,
                  action: rsc.action,
                  scopeKind: rsc.scopeKind,
                  scopeKey: rsc.scopeKey,
                })
                .from(mapping.rateScope.table)
                .where(
                  and(
                    eq(rsc.moduleId, input.moduleId),
                    notExists(
                      transaction
                        .select({ one: sql`1` })
                        .from(mapping.abuseEvent.table)
                        .where(
                          and(
                            eq(ac.moduleId, rsc.moduleId),
                            eq(ac.purpose, rsc.purpose),
                            eq(ac.action, rsc.action),
                            eq(ac.scopeKind, rsc.scopeKind),
                            eq(ac.scopeKey, rsc.scopeKey),
                          ),
                        ),
                    ),
                  ),
                ),
            );

            // Removing the final history row can make an anchor eligible only after this
            // transaction/batch commits. One extra page lets the caller reclaim it.
            hasMore ||= generations.length > 0 || failures.length > 0 || abuse.length > 0;
            const removed = input.limit - remaining;
            const prepared = prepare({ removed, hasMore } satisfies ProofCleanupResult, journal);

            if (continuations.length > 0)
              yield* transaction.delete(mapping.continuation.table).where(
                and(
                  eq(cc.moduleId, input.moduleId),
                  inArray(
                    cc.continuationId,
                    continuations.map((row: any) => row.continuationId),
                  ),
                  lte(cc.retentionUntil, nativeNow),
                ),
              );
            if (generations.length > 0)
              yield* transaction
                .update(mapping.series.table)
                .set(updateValues([[mapping.series.activeProofId, null]]))
                .where(
                  and(
                    eq(sc.moduleId, input.moduleId),
                    inArray(
                      sc.activeProofId,
                      generations.map((row: any) => row.proofId),
                    ),
                  ),
                );
            if (generations.length > 0)
              yield* transaction.delete(mapping.generation.table).where(
                and(
                  eq(gc.moduleId, input.moduleId),
                  inArray(
                    gc.proofId,
                    generations.map((row: any) => row.proofId),
                  ),
                  lte(gc.retentionUntil, nativeNow),
                ),
              );
            if (requests.length > 0)
              yield* transaction.delete(mapping.request.table).where(
                and(
                  eq(rc.moduleId, input.moduleId),
                  inArray(
                    rc.requestId,
                    requests.map((row: any) => row.requestId),
                  ),
                  lte(rc.retentionUntil, nativeNow),
                ),
              );
            for (const row of abuse)
              yield* transaction
                .delete(mapping.abuseEvent.table)
                .where(
                  and(
                    eq(ac.moduleId, input.moduleId),
                    eq(ac.action, row.action),
                    eq(ac.scopeKind, row.scopeKind),
                    eq(ac.scopeKey, row.scopeKey),
                    eq(ac.commandId, row.commandId),
                    lte(ac.retentionUntil, nativeNow),
                  ),
                );
            for (const row of failures)
              yield* transaction
                .delete(mapping.failureEvent.table)
                .where(
                  and(
                    eq(fc.moduleId, input.moduleId),
                    eq(fc.seriesKey, row.seriesKey),
                    eq(fc.commandId, row.commandId),
                    lte(fc.retentionUntil, nativeNow),
                  ),
                );
            if (commands.length > 0)
              yield* transaction.delete(mapping.command.table).where(
                and(
                  eq(mc.moduleId, input.moduleId),
                  inArray(
                    mc.commandId,
                    commands.map((row: any) => row.commandId),
                  ),
                  lte(mc.retentionUntil, nativeNow),
                ),
              );
            for (const row of series)
              yield* transaction.delete(mapping.series.table).where(
                and(
                  eq(sc.moduleId, input.moduleId),
                  eq(sc.purpose, row.purpose),
                  eq(sc.scopeKey, row.scopeKey),
                  isNull(sc.activeProofId),
                  notExists(
                    transaction
                      .select({ one: sql`1` })
                      .from(mapping.generation.table)
                      .where(
                        and(
                          eq(gc.moduleId, sc.moduleId),
                          eq(gc.purpose, sc.purpose),
                          eq(gc.seriesKey, sc.scopeKey),
                        ),
                      ),
                  ),
                ),
              );
            for (const row of rateScopes)
              yield* transaction.delete(mapping.rateScope.table).where(
                and(
                  eq(rsc.moduleId, input.moduleId),
                  eq(rsc.purpose, row.purpose),
                  eq(rsc.action, row.action),
                  eq(rsc.scopeKind, row.scopeKind),
                  eq(rsc.scopeKey, row.scopeKey),
                  notExists(
                    transaction
                      .select({ one: sql`1` })
                      .from(mapping.abuseEvent.table)
                      .where(
                        and(
                          eq(ac.moduleId, rsc.moduleId),
                          eq(ac.purpose, rsc.purpose),
                          eq(ac.action, rsc.action),
                          eq(ac.scopeKind, rsc.scopeKind),
                          eq(ac.scopeKey, rsc.scopeKey),
                        ),
                      ),
                  ),
                ),
              );

            return prepared;
          }),
        ).pipe(
          Effect.provideService(CurrentProofSql, database),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
    });
  });

  const inspectCompletionIn = Effect.fn("DrizzleProof.inspectCompletionIn")(function* (
    mapping: Mapping,
    configuration: ProofSqlConfiguration,
    input: ProofCompletionPlan["input"],
    ensure: boolean,
  ) {
    const database = yield* CurrentProofSql;

    const authorityCurrent = yield* lockAuthority(
      mapping,
      input.moduleId,
      input.purpose,
      input.binding,
      configuration.locking,
    );

    const keys = mapping.scopeKeys({
      moduleId: input.moduleId,
      purpose: input.purpose,
      binding: input.binding,
    });

    if (ensure)
      yield* ensureSeries(mapping, configuration, input.moduleId, input.purpose, keys.series);
    const c = continuationColumns(mapping);

    const rows = yield* selectRows(
      database
        .select()
        .from(mapping.continuation.table)
        .where(and(eq(c.moduleId, input.moduleId), eq(c.continuationId, input.continuationId)))
        .limit(1),
      configuration.locking,
    );

    const row = rows[0];
    const now = yield* nowMillis;
    const record = row === undefined ? undefined : yield* mapping.continuation.decode(row);

    const completed =
      authorityCurrent &&
      row !== undefined &&
      record !== undefined &&
      record.moduleId === input.moduleId &&
      record.continuationId === input.continuationId &&
      record.purpose === input.purpose &&
      record.digest === input.continuationDigest &&
      record.seriesKey === keys.series &&
      sameBinding(record.binding, input.binding) &&
      row[mapping.continuation.consumed] === false &&
      record.expiresAtMillis > now;

    return completed ? { record: record!, row, columns: c } : undefined;
  });

  /** Nonconsuming same-owner preflight; it never inserts a series or changes expiry. */
  const checkProofCompletionIn = Effect.fn("Drizzle.checkProofCompletionIn")(function* (
    mapping: Mapping,
    configuration: ProofSqlConfiguration,
    input: ProofCompletionPlan["input"],
  ) {
    return yield* inspectCompletionIn(mapping, configuration, input, false).pipe(
      Effect.map((value) => value !== undefined),
    );
  });

  const completeIn = Effect.fn("DrizzleProof.completeIn")(function* <A, E = never, R = never>(
    mapping: Mapping,
    configuration: ProofSqlConfiguration,
    input: ProofCompletionPlan["input"],
    prepare: (decision: ProofCompletionDecision) => A,
    protectedMutation?: Effect.Effect<boolean, E, R>,
  ) {
    const database = yield* CurrentProofSql;

    const accepted = yield* inspectCompletionIn(mapping, configuration, input, true);

    if (accepted === undefined) return prepare("rejected");
    const { record, row: original, columns: c } = accepted;

    if (protectedMutation !== undefined && !(yield* protectedMutation)) return yield* unavailable();
    const value = prepare("completed");

    yield* database
      .update(mapping.continuation.table)
      .set(updateValues([[mapping.continuation.consumed, true]]))
      .where(
        and(
          eq(c.moduleId, input.moduleId),
          eq(c.continuationId, input.continuationId),
          eq(c.digest, input.continuationDigest),
          eq(c.consumed, false),
        ),
      );
    yield* insertCommand(
      mapping,
      input.moduleId,
      input.continuationDigest,
      "complete",
      "completed",
      record.expiresAtMillis,
    );

    const assertApplied = Effect.flatMap(CurrentPasswordPreparedTransaction, (currentTransaction) =>
      Effect.gen(function* () {
        const persisted = (yield* selectRows(
          currentTransaction
            .select()
            .from(mapping.continuation.table)
            .where(and(eq(c.moduleId, input.moduleId), eq(c.continuationId, input.continuationId)))
            .limit(1),
          false,
        ))[0];

        const command = (yield* commandRow(
          mapping,
          input.moduleId,
          input.continuationDigest,
          false,
        ))[0];

        const decoded =
          persisted === undefined ? undefined : yield* mapping.continuation.decode(persisted);

        const immutable = [
          mapping.continuation.moduleId,
          mapping.continuation.purpose,
          mapping.continuation.continuationId,
          mapping.continuation.digest,
          mapping.continuation.proofId,
          mapping.continuation.seriesKey,
          mapping.continuation.version,
        ];

        if (
          persisted === undefined ||
          decoded === undefined ||
          !sameBinding(decoded.binding, record.binding) ||
          persisted[mapping.continuation.consumed] !== true ||
          immutable.some((key) => persisted[key] !== original[key]) ||
          (yield* mapping.decodeInstant(persisted[mapping.continuation.expiresAt])) !==
            record.expiresAtMillis ||
          (yield* mapping.decodeInstant(persisted[mapping.continuation.retentionUntil])) !==
            (yield* mapping.decodeInstant(original[mapping.continuation.retentionUntil])) ||
          command === undefined ||
          command[mapping.command.kind] !== "complete" ||
          command[mapping.command.decision] !== "completed" ||
          (yield* mapping.decodeInstant(command[mapping.command.retentionUntil])) !==
            record.expiresAtMillis
        )
          return yield* unavailable();

        if (record.expiresAtMillis <= (yield* nowMillis)) return yield* unavailable();
      }).pipe(Effect.provideService(CurrentProofSql, currentTransaction)),
    );

    yield* assertApplied.pipe(Effect.provideService(CurrentPasswordPreparedTransaction, database));
    const postconditions = yield* Effect.serviceOption(PasswordPreparedPostconditions);

    if (
      Option.isSome(postconditions) &&
      !postconditions.value.register(assertApplied.pipe(translateFailure))
    )
      return yield* unavailable();

    return value;
  });

  /** Private same-owner seam for password and identifier mutations. */
  const completeProofPlanIn = Effect.fn("Drizzle.completeProofPlanIn")(function* <
    Rq extends Table,
    S extends Table,
    G extends Table,
    Cn extends Table,
    Rs extends Table,
    Aev extends Table,
    F extends Table,
    C extends Table,
    Sub extends Table,
    I extends Table,
    Cr extends Table,
    NativeId,
    A,
    E,
    R,
  >(
    mapping: ProofPersistenceMapping<Rq, S, G, Cn, Rs, Aev, F, C, Sub, I, Cr, NativeId>,
    configuration: ProofSqlConfiguration,
    plan: ProofCompletionPlan,
    protectedMutation: Effect.Effect<boolean, E, R>,
    project: (decision: ProofCompletionDecision) => A,
  ) {
    const journal = yield* CurrentCommitJournal;

    return yield* completeIn(
      mapping as unknown as Mapping,
      configuration,
      plan.input,
      (decision) => plan.prepare(decision, journal, project),
      protectedMutation,
    );
  });

  return { makeSqlProofPersistence, checkProofCompletionIn, completeProofPlanIn };
};
