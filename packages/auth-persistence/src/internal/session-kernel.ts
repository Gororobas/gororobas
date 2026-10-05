import {
  coordinateCommit,
  CurrentCommitJournal,
  hasCommitScope,
  LifecycleHooks,
} from "@yielded/auth/Hooks";
import { reportPersistenceFailure } from "@yielded/auth/Persistence";
import type { SubjectId, TokenDigest } from "@yielded/auth/Schema";
import {
  assessAuthentication,
  snapshotSessionAuthenticationProvenance,
  PendingAuthenticationInvalid,
  SessionConflict,
  SessionInvalid,
  SessionStepUpInvalid,
  SessionUnavailable,
  StaleAuthentication,
  type AuthenticationEvidence,
  type AuthenticationRevision,
  type PendingConsumption,
  type SecurityRevision,
  type SessionInspection,
  SessionMetadata,
  pendingAuthenticationContext,
  snapshotPendingAuthenticationContext,
  type PendingAuthentication,
  type PendingAuthenticationRecord,
  type PendingAuthenticationState,
  type AuthenticationAuthority,
  type PrepareSessionCommit,
  type SessionRepository,
  type SignedSessionValidity,
  type StatefulSessionPersistence,
  type StatefulSessionRecord,
  type SessionStepUpIntent,
  type SessionStepUpPersistence,
} from "@yielded/auth/Sessions";
import { Cause, Context, DateTime, Effect, Option, Schema } from "effect";
import type * as SqlError from "effect/sql/SqlError";

import { PersistenceMappingError, isMappedConstraintConflict } from "./mapping-error";
import type {
  AuthenticationAuthorityMapping,
  PendingAuthenticationTables,
  PendingAuthenticationMapping,
  SessionAuthorityTables,
  SessionFlowTables,
  SessionSubjectTables,
  SignedSessionValidityMapping,
  StatefulSessionMapping,
} from "./models/session-model";
import type { SessionStepUpMapping } from "./models/step-up-model";
/* oxlint-disable no-explicit-any -- existing storage kernels erase foreign table shapes; domain errors remain typed. */
import type { QueryFailure } from "./query-operations";
import type { QueryOperations } from "./query-operations";
import {
  decodeStepUpIntent,
  encodeStepUpIntent,
  sameStepUpRevision,
  stepUpIntentLive,
  validateStepUpPlan,
  stepUpRotationMatches,
} from "./step-up-state";
import type { NativeDatabase } from "./transaction-kernel";

type CommitMode = "interactive" | "synchronous";

type AnySubjectMapping = SessionSubjectTables<any, any>;

type AnyAuthorityMapping = SessionAuthorityTables<any, any, any>;

type AnyFlowMapping = SessionFlowTables<any, any>;

type AnyPendingMapping = AnyAuthorityMapping &
  AnyFlowMapping &
  PendingAuthenticationTables<any, any, any, any>;

type AnyStepUpMapping = SessionStepUpMapping<any, any, any, any, any, any, any, any>;

interface SessionSqlQuery<A = ReadonlyArray<any>> extends Effect.Effect<
  A,
  QueryFailure | SqlError.SqlError
> {
  readonly from: (...args: ReadonlyArray<any>) => SessionSqlQuery<A>;
  readonly where: (...args: ReadonlyArray<any>) => SessionSqlQuery<A>;
  readonly limit: (...args: ReadonlyArray<any>) => SessionSqlQuery<A>;
  readonly orderBy: (...args: ReadonlyArray<any>) => SessionSqlQuery<A>;
  readonly for: (...args: ReadonlyArray<any>) => SessionSqlQuery<A>;
  readonly set: (...args: ReadonlyArray<any>) => SessionSqlQuery<A>;
  readonly values: (...args: ReadonlyArray<any>) => SessionSqlQuery<A>;
}

export interface SessionSqlDatabase {
  readonly select: (...args: ReadonlyArray<any>) => SessionSqlQuery;
  readonly insert: (...args: ReadonlyArray<any>) => SessionSqlQuery;
  readonly update: (...args: ReadonlyArray<any>) => SessionSqlQuery;
  readonly delete: (...args: ReadonlyArray<any>) => SessionSqlQuery;
  readonly transaction: <A, E, R>(
    body: (transaction: SessionSqlDatabase) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | SqlError.SqlError, R>;
}

type Database = SessionSqlDatabase;

/** Native SQL authority for the current transaction or savepoint. */
export class CurrentSessionSql extends Context.Service<CurrentSessionSql, SessionSqlDatabase>()(
  "effect-auth/drizzle/CurrentSessionSql",
) {}

type Guard = Effect.Effect<void, SessionUnavailable>;

export interface SessionSqlOptions {
  readonly coordinated?: boolean;
  readonly mode: CommitMode;
  readonly locking: boolean;
  /** Target-specific ambient transaction preflight. It runs before IDs or writes. */
  readonly standaloneGuard: Guard;
}

type SessionDomainError =
  | SessionStepUpInvalid
  | PendingAuthenticationInvalid
  | SessionConflict
  | SessionInvalid
  | SessionUnavailable
  | StaleAuthentication;

type AdapterFailure =
  | QueryFailure
  | PersistenceMappingError
  | Schema.SchemaError
  | SqlError.SqlError;

type NormalizedSessionFailure<E> = E extends SessionDomainError ? E : SessionUnavailable;

type PendingProjection = "record" | "context";

type SqlStepUpRejectAbsence = SessionStepUpInvalid | StaleAuthentication;

type SqlStepUpReadFailure = AdapterFailure | SqlStepUpRejectAbsence | SessionUnavailable;

export const makeSessionKernel = (operations: QueryOperations) => {
  const { and, eq, gt, lte, inArray, or, sql, column, updateValues } = operations;
  const unavailable = () => SessionUnavailable.make({});

  const stale = () => StaleAuthentication.make({});

  const invalidPending = () => PendingAuthenticationInvalid.make({});

  const invalidSession = () => SessionInvalid.make({});

  const mapFailureCause = <A, E, R, E2>(
    effect: Effect.Effect<A, E, R>,
    map: (error: E) => E2,
  ): Effect.Effect<A, E2, R> =>
    Effect.catchCause(effect, (cause) => Effect.failCause(Cause.map(cause, map)));

  const isExpectedMutationError = (error: unknown): error is SessionDomainError => {
    const tag =
      typeof error === "object" && error !== null ? Reflect.get(error, "_tag") : undefined;

    return (
      tag === "SessionStepUpInvalid" ||
      tag === "StaleAuthentication" ||
      tag === "PendingAuthenticationInvalid" ||
      tag === "SessionConflict" ||
      tag === "SessionInvalid" ||
      tag === "SessionUnavailable"
    );
  };

  const normalizeMutation =
    (mapping: any) =>
    <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.catchCause((cause) =>
          Effect.failCause(
            Cause.map(cause, (error) =>
              isMappedConstraintConflict(mapping.isConstraintConflict, error)
                ? SessionConflict.make({})
                : error,
            ),
          ),
        ),
      );

  const safeTransaction = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, NormalizedSessionFailure<E> | SessionUnavailable, R> =>
    reportPersistenceFailure(effect, isExpectedMutationError).pipe(
      Effect.catchCause((cause) =>
        Effect.failCause(
          Cause.map(
            cause,
            (error): NormalizedSessionFailure<E> =>
              (isExpectedMutationError(error)
                ? error
                : unavailable()) as NormalizedSessionFailure<E>,
          ),
        ),
      ),
    );

  const selectRows = (
    query: SessionSqlQuery,
    locking: boolean,
  ): Effect.Effect<ReadonlyArray<any>, AdapterFailure> =>
    locking && typeof query.for === "function" ? query.for("update") : query;

  const inTransaction = <A, E, R>(
    database: Database,
    effect: Effect.Effect<A, E, R | CurrentSessionSql>,
  ): Effect.Effect<A, E | SqlError.SqlError, Exclude<R, CurrentSessionSql>> =>
    Effect.suspend(() =>
      database.transaction((current) =>
        effect.pipe(Effect.provideService(CurrentSessionSql, current)),
      ),
    );

  const owned = <A, E, R>(
    database: Database,
    options: SessionSqlOptions,
    isConstraintConflict: (cause: unknown) => boolean,
    body: Effect.Effect<A, E, R | CurrentSessionSql | CurrentCommitJournal>,
  ): Effect.Effect<
    A,
    NormalizedSessionFailure<E> | SessionUnavailable,
    Exclude<Exclude<R, CurrentSessionSql>, CurrentCommitJournal> | LifecycleHooks
  > => {
    const run = coordinateCommit(
      () =>
        database.transaction((current) =>
          body.pipe(Effect.provideService(CurrentSessionSql, current)),
        ),
      { mode: options.mode },
    ).pipe(
      (effect) =>
        reportPersistenceFailure(
          effect,
          (error) =>
            isExpectedMutationError(error) ||
            isMappedConstraintConflict(isConstraintConflict, error),
        ),
      Effect.map((result) => result.value),
      Effect.catchCause((cause) =>
        Effect.failCause(
          Cause.map(cause, (error): NormalizedSessionFailure<E> | SessionUnavailable =>
            isExpectedMutationError(error) ? (error as NormalizedSessionFailure<E>) : unavailable(),
          ),
        ),
      ),
    );

    return Effect.gen(function* () {
      const current = yield* Effect.serviceOption(CurrentSessionSql);
      const transactionBound = Option.isSome(current) && current.value === database;

      if (!transactionBound) {
        // A root service must never commit one database underneath another owner.
        if (yield* hasCommitScope) return yield* unavailable();
        yield* options.standaloneGuard;
      }

      // A tx-bound service still owns a savepoint and child journal. If the caller
      // catches its failure, both partial writes and prepared values are discarded.
      return yield* run;
    });
  };

  const uniqueStrings = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
    [...new Set(values)].sort();

  const preservesRevision = (
    completed: AuthenticationEvidence,
    original: AuthenticationEvidence,
  ): boolean => {
    const current = new Map(
      completed.revision.credentials.map((item) => [item.credentialId, item.revision]),
    );

    return (
      completed.flowId === original.flowId &&
      completed.bindingDigest === original.bindingDigest &&
      completed.revision.subjectId === original.revision.subjectId &&
      completed.revision.securityRevision === original.revision.securityRevision &&
      original.revision.credentials.every(
        (item) => current.get(item.credentialId) === item.revision,
      ) &&
      original.proofs.every((expected) =>
        completed.proofs.some(
          (proof) =>
            proof.method === expected.method &&
            proof.credentialId === expected.credentialId &&
            proof.userVerified === expected.userVerified &&
            proof.phishingResistant === expected.phishingResistant &&
            DateTime.toEpochMillis(proof.verifiedAt) ===
              DateTime.toEpochMillis(expected.verifiedAt) &&
            proof.factors.length === expected.factors.length &&
            proof.factors.every((factor, index) => factor === expected.factors[index]),
        ),
      )
    );
  };

  const authorityColumns = (mapping: any) => ({
    subjectId: column(mapping.subject.table, mapping.subject.id),
    subjectStatus: column(mapping.subject.table, mapping.subject.status),
    subjectRevision: column(mapping.subject.table, mapping.subject.securityRevision),
    credentialSubjectId: column(mapping.credential.table, mapping.credential.subjectId),
    credentialId: column(mapping.credential.table, mapping.credential.credentialId),
    credentialRevision: column(mapping.credential.table, mapping.credential.revision),
    ...(mapping.credential.status === undefined
      ? {}
      : { credentialStatus: column(mapping.credential.table, mapping.credential.status) }),
  });

  const subjectColumns = (mapping: any) => ({
    subjectId: column(mapping.subject.table, mapping.subject.id),
    subjectStatus: column(mapping.subject.table, mapping.subject.status),
    subjectRevision: column(mapping.subject.table, mapping.subject.securityRevision),
  });

  const readSubject = Effect.fn("DrizzleSession.readSubject")(function* (
    mapping: AnySubjectMapping,
    nativeSubjectId: unknown,
    locking: boolean,
  ) {
    const database = yield* CurrentSessionSql;
    const columns = subjectColumns(mapping);

    return yield* selectRows(
      database
        .select()
        .from(mapping.subject.table)
        .where(eq(columns.subjectId, nativeSubjectId))
        .limit(1),
      locking,
    );
  });

  const captureDetailsIn = Effect.fn("DrizzleSession.captureDetails")(function* (
    mapping: AnyAuthorityMapping,
    subjectId: SubjectId,
    credentialIds: ReadonlyArray<string>,
    locking: boolean,
  ) {
    const database = yield* CurrentSessionSql;
    const requested = uniqueStrings(credentialIds);

    if (requested.length !== credentialIds.length) return yield* stale();
    const nativeSubjectId = yield* mapping.subjectId.toNative(subjectId);
    const subjectRows = yield* readSubject(mapping, nativeSubjectId, locking);
    const subject = subjectRows[0];
    const columns = authorityColumns(mapping);

    if (subject === undefined || !mapping.subject.isActiveStatus(subject[mapping.subject.status]))
      return yield* stale();

    const query = database
      .select()
      .from(mapping.credential.table)
      .where(
        and(
          eq(columns.credentialSubjectId, nativeSubjectId),
          requested.length === 0 ? sql`false` : inArray(columns.credentialId, requested),
        ),
      )
      .orderBy(columns.credentialId);

    const credentialRows = requested.length === 0 ? [] : yield* selectRows(query, locking);

    if (credentialRows.length !== requested.length) return yield* stale();

    const credentials = credentialRows
      .map((row: any) => ({
        credentialId: row[mapping.credential.credentialId] as string,
        revision: row[mapping.credential.revision] as SecurityRevision,
        active:
          mapping.credential.status === undefined ||
          mapping.credential.isActiveStatus?.(row[mapping.credential.status]) === true,
      }))
      .sort((left: any, right: any) => left.credentialId.localeCompare(right.credentialId));

    if (credentials.some((item: any) => !item.active)) return yield* stale();

    return {
      subject,
      revision: {
        subjectId,
        securityRevision: subject[mapping.subject.securityRevision] as SecurityRevision,
        credentials: credentials.map(({ credentialId, revision }: any) => ({
          credentialId,
          revision,
        })),
      } satisfies AuthenticationRevision,
    };
  });

  const captureIn = Effect.fn("DrizzleSession.capture")(function* (
    mapping: AnyAuthorityMapping,
    subjectId: SubjectId,
    credentialIds: ReadonlyArray<string>,
    locking: boolean,
  ) {
    return (yield* captureDetailsIn(mapping, subjectId, credentialIds, locking)).revision;
  });

  const validateEvidenceIn = Effect.fn("DrizzleSession.validateEvidence")(function* (
    mapping: AnyAuthorityMapping,
    evidence: AuthenticationEvidence,
    locking: boolean,
  ) {
    const captured = yield* captureDetailsIn(
      mapping,
      evidence.revision.subjectId,
      evidence.revision.credentials.map((item) => item.credentialId),
      locking,
    );

    if (
      captured.revision.securityRevision !== evidence.revision.securityRevision ||
      captured.revision.credentials.length !== evidence.revision.credentials.length ||
      captured.revision.credentials.some(
        (item: { credentialId: string; revision: SecurityRevision }, index: number) => {
          const expected = [...evidence.revision.credentials].sort((a, b) =>
            a.credentialId.localeCompare(b.credentialId),
          )[index];

          return (
            expected === undefined ||
            expected.credentialId !== item.credentialId ||
            expected.revision !== item.revision
          );
        },
      )
    )
      return yield* stale();
    const nativeSubjectId = yield* mapping.subjectId.toNative(evidence.revision.subjectId);
    const requirement = yield* mapping.subject.decodeRequirement(captured.subject);

    return { nativeSubjectId, requirement };
  });

  const flowColumns = (mapping: any) => ({
    flowId: column(mapping.flow.table, mapping.flow.flowId),
    subjectId: column(mapping.flow.table, mapping.flow.subjectId),
    state: column(mapping.flow.table, mapping.flow.state),
    pendingDigest: column(mapping.flow.table, mapping.flow.pendingDigest),
    dedupUntil: column(mapping.flow.table, mapping.flow.dedupUntil),
  });

  const readFlow = Effect.fn("DrizzleSession.readFlow")(function* (
    mapping: AnyFlowMapping,
    flowId: string,
    locking: boolean,
  ) {
    const database = yield* CurrentSessionSql;
    const columns = flowColumns(mapping);

    return yield* selectRows(
      database.select().from(mapping.flow.table).where(eq(columns.flowId, flowId)).limit(1),
      locking,
    );
  });

  const ensureDirectFlowAvailable = Effect.fn("DrizzleSession.ensureFlowAvailable")(function* (
    mapping: AnyAuthorityMapping &
      AnyFlowMapping & {
        readonly pending?: PendingAuthenticationTables<any, any, any, any>["pending"] | undefined;
      },
    evidence: AuthenticationEvidence,
    nativeSubjectId: unknown,
    dedupUntil: DateTime.Utc,
  ) {
    const database = yield* CurrentSessionSql;
    const rows = yield* readFlow(mapping, evidence.flowId, true);
    const existing = rows[0];

    if (existing !== undefined) {
      const now = yield* freshNow;

      if (
        DateTime.toEpochMillis(now) <
        DateTime.toEpochMillis(yield* mapping.flow.decodeInstant(existing[mapping.flow.dedupUntil]))
      )
        return yield* SessionConflict.make({});
      if (mapping.pending !== undefined)
        yield* database
          .delete(mapping.pending.table)
          .where(eq(column(mapping.pending.table, mapping.pending.flowId), evidence.flowId));
      yield* database
        .delete(mapping.flow.table)
        .where(eq(flowColumns(mapping).flowId, evidence.flowId));
    }

    return mapping.flow.encodeEstablishedInsert({
      evidence,
      subjectId: nativeSubjectId,
      dedupUntil,
    });
  });

  const pendingColumns = (mapping: any) => ({
    digest: column(mapping.pending.table, mapping.pending.digest),
    version: column(mapping.pending.table, mapping.pending.version),
    flowId: column(mapping.pending.table, mapping.pending.flowId),
    subjectId: column(mapping.pending.table, mapping.pending.subjectId),
    bindingDigest: column(mapping.pending.table, mapping.pending.bindingDigest),
    expiresAt: column(mapping.pending.table, mapping.pending.expiresAt),
    attemptLimit: column(mapping.pending.table, mapping.pending.attemptLimit),
    failedAttempts: column(mapping.pending.table, mapping.pending.failedAttempts),
    consumed: column(mapping.pending.table, mapping.pending.consumed),
  });

  const readPending = Effect.fn("DrizzleSession.readPending")(function* (
    mapping: AnyPendingMapping,
    digest: TokenDigest,
    locking: boolean,
  ) {
    const database = yield* CurrentSessionSql;

    return yield* selectRows(
      database
        .select()
        .from(mapping.pending.table)
        .where(eq(pendingColumns(mapping).digest, digest))
        .limit(1),
      locking,
    );
  });

  const validatePending = Effect.fn("DrizzleSession.validatePending")(function* <
    Record extends PendingAuthenticationState = PendingAuthenticationRecord<unknown>,
  >(
    mapping: AnyPendingMapping,
    input: PendingConsumption,
    projection: PendingProjection = "record",
  ) {
    const rows = yield* readPending(mapping, input.digest, true);
    const row = rows[0];

    if (row === undefined) return yield* invalidPending();

    const decode = (
      projection === "context" ? mapping.pending.decodeContext : mapping.pending.decode
    ) as (row: any) => Effect.Effect<Record, PersistenceMappingError>;

    const record = yield* decode(row);
    const failedAttempts = Number(row[mapping.pending.failedAttempts]);

    if (
      record.version !== input.version ||
      record.evidence.flowId !== input.flowId ||
      record.evidence.bindingDigest !== input.bindingDigest ||
      row[mapping.pending.consumed] !== false ||
      failedAttempts >= record.attemptLimit
    )
      return yield* invalidPending();
    const flows = yield* readFlow(mapping, input.flowId, true);
    const flow = flows[0];

    if (
      flow === undefined ||
      flow[mapping.flow.state] !== mapping.flow.pendingStateValue ||
      flow[mapping.flow.pendingDigest] !== input.digest
    )
      return yield* invalidPending();
    if (DateTime.toEpochMillis(yield* freshNow) >= DateTime.toEpochMillis(record.expiresAt))
      return yield* invalidPending();

    return record;
  });

  const consumePending = Effect.fn("DrizzleSession.consumePending")(function* (
    mapping: AnyPendingMapping,
    input: PendingConsumption,
    until: DateTime.Utc,
  ) {
    const database = yield* CurrentSessionSql;

    yield* Effect.all([
      database
        .update(mapping.pending.table)
        .set(updateValues([[mapping.pending.consumed, true]]))
        .where(
          and(
            eq(pendingColumns(mapping).digest, input.digest),
            eq(pendingColumns(mapping).version, input.version),
            eq(pendingColumns(mapping).consumed, false),
          ),
        ),

      database
        .update(mapping.flow.table)
        .set(
          updateValues([
            [mapping.flow.state, mapping.flow.establishedStateValue],
            [mapping.flow.pendingDigest, null],
            [mapping.flow.dedupUntil, mapping.flow.encodeInstant(until)],
          ]),
        )
        .where(eq(flowColumns(mapping).flowId, input.flowId)),
    ]);
  });

  const freshNow = DateTime.now;

  const allocate = <A>(
    mode: CommitMode,
    asynchronous: Effect.Effect<A, PersistenceMappingError> | undefined,
    synchronous: (() => A) | undefined,
  ): Effect.Effect<A, PersistenceMappingError | SessionUnavailable> => {
    if (mode === "synchronous")
      return synchronous === undefined
        ? Effect.fail(unavailable())
        : Effect.try({
            try: synchronous,
            catch: (cause) => PersistenceMappingError.make({ operation: "allocate", cause }),
          });
    if (asynchronous !== undefined) return asynchronous;

    return synchronous === undefined
      ? Effect.fail(unavailable())
      : Effect.try({
          try: synchronous,
          catch: (cause) => PersistenceMappingError.make({ operation: "allocate", cause }),
        });
  };

  const makeSqlAuthenticationAuthority = Effect.fnUntraced(function* <Claims>(
    mapping: AuthenticationAuthorityMapping<Claims, any, any, any, any, any>,
    options: SessionSqlOptions,
  ): Effect.fn.Return<
    AuthenticationAuthority["Service"],
    SessionUnavailable,
    LifecycleHooks | CurrentSessionSql | NativeDatabase
  > {
    const database = yield* CurrentSessionSql;

    if (!options.coordinated)
      yield* (operations.validateStorage?.(mapping) ?? Effect.void).pipe(
        Effect.mapError(unavailable),
      );
    const hooks = yield* LifecycleHooks;

    const service = {
      capture: (subjectId: SubjectId, credentialIds: ReadonlyArray<string>) =>
        safeTransaction(
          inTransaction(database, captureIn(mapping, subjectId, credentialIds, true)),
        ),
      requirements: (evidence: AuthenticationEvidence) =>
        safeTransaction(
          inTransaction(
            database,
            validateEvidenceIn(mapping, evidence, true).pipe(
              Effect.map((result) => result.requirement),
            ),
          ),
        ),
      approve: <A>(
        input: Parameters<AuthenticationAuthority["Service"]["approve"]>[0],
        prepare: PrepareSessionCommit<void, A>,
      ) =>
        owned(
          database,
          options,
          mapping.isConstraintConflict,
          Effect.gen(function* () {
            const journal = yield* CurrentCommitJournal;
            const { requirement } = yield* validateEvidenceIn(mapping, input.evidence, true);

            if (input.pending === undefined) {
              const assessed = yield* assessAuthentication(input.evidence, requirement).pipe(
                Effect.mapError(unavailable),
              );

              const now = yield* freshNow;

              if (
                !assessed.satisfied ||
                DateTime.toEpochMillis(now) >= DateTime.toEpochMillis(input.expiresAt) ||
                DateTime.toEpochMillis(input.expiresAt) >
                  DateTime.toEpochMillis(input.absoluteExpiresAt)
              )
                return yield* stale();

              return prepare(undefined, journal);
            }
            if (mapping.pending === undefined) return yield* invalidPending();
            const pendingMapping = { ...mapping, ...mapping.pending };
            const pending = yield* validatePending(pendingMapping, input.pending);

            if (!preservesRevision(input.evidence, pending.evidence))
              return yield* invalidPending();

            const assessed = yield* assessAuthentication(input.evidence, requirement).pipe(
              Effect.mapError(unavailable),
            );

            const now = yield* freshNow;

            if (
              !assessed.satisfied ||
              DateTime.toEpochMillis(now) >= DateTime.toEpochMillis(pending.expiresAt) ||
              DateTime.toEpochMillis(now) >= DateTime.toEpochMillis(input.expiresAt) ||
              DateTime.toEpochMillis(input.expiresAt) >
                DateTime.toEpochMillis(input.absoluteExpiresAt)
            )
              return yield* stale();
            const receipt = prepare(undefined, journal);

            yield* consumePending(pendingMapping, input.pending, input.absoluteExpiresAt);

            return receipt;
          }),
        ),
    };

    return {
      capture: (subjectId, credentialIds) =>
        service
          .capture(subjectId, credentialIds)
          .pipe(Effect.provideService(LifecycleHooks, hooks)),
      requirements: (evidence) =>
        service.requirements(evidence).pipe(Effect.provideService(LifecycleHooks, hooks)),
      approve: (input, prepare) =>
        service.approve(input, prepare).pipe(Effect.provideService(LifecycleHooks, hooks)),
    } satisfies AuthenticationAuthority["Service"];
  });

  /** The same locked security checks serve full consumption reads and the
   * claims-free additional-factor context. No lock spans proof verification. */
  const readAuthenticatedPending = Effect.fn("DrizzleSession.readAuthenticatedPending")(function* <
    Record extends PendingAuthenticationState,
  >(
    mapping: AnyPendingMapping,
    input: { readonly digest: TokenDigest; readonly bindingDigest?: TokenDigest },
    projection: PendingProjection,
  ) {
    const initial = (yield* readPending(mapping, input.digest, false))[0];

    if (initial === undefined) return yield* invalidPending();
    const initialNativeSubjectId = initial[mapping.pending.subjectId];
    const subject = (yield* readSubject(mapping, initialNativeSubjectId, true))[0];

    if (subject === undefined) return yield* invalidPending();
    const current = (yield* readPending(mapping, input.digest, true))[0];

    if (
      current === undefined ||
      !mapping.subjectId.equals(current[mapping.pending.subjectId], initialNativeSubjectId)
    )
      return yield* invalidPending();

    const decode = (
      projection === "context" ? mapping.pending.decodeContext : mapping.pending.decode
    ) as (row: any) => Effect.Effect<Record, PersistenceMappingError>;

    const record = yield* decode(current);
    const nativeSubjectId = yield* mapping.subjectId.toNative(record.evidence.revision.subjectId);
    const failedAttempts = Number(current[mapping.pending.failedAttempts]);

    if (
      !mapping.subjectId.equals(nativeSubjectId, initialNativeSubjectId) ||
      (input.bindingDigest !== undefined &&
        record.evidence.bindingDigest !== input.bindingDigest) ||
      current[mapping.pending.version] !== record.version ||
      current[mapping.pending.flowId] !== record.evidence.flowId ||
      current[mapping.pending.bindingDigest] !== record.evidence.bindingDigest ||
      current[mapping.pending.consumed] !== false ||
      failedAttempts >= record.attemptLimit
    )
      return yield* invalidPending();
    const flow = (yield* readFlow(mapping, record.evidence.flowId, true))[0];

    if (
      flow === undefined ||
      flow[mapping.flow.state] !== mapping.flow.pendingStateValue ||
      flow[mapping.flow.pendingDigest] !== input.digest
    )
      return yield* invalidPending();

    const { requirement } = yield* mapFailureCause(
      validateEvidenceIn(mapping, record.evidence, true),
      (error) => (Schema.is(StaleAuthentication)(error) ? invalidPending() : error),
    );

    yield* assessAuthentication(record.evidence, requirement).pipe(
      Effect.mapError(() => invalidPending()),
    );
    if (DateTime.toEpochMillis(yield* freshNow) >= DateTime.toEpochMillis(record.expiresAt))
      return yield* invalidPending();

    return record;
  });

  const makeSqlPendingAuthentication = Effect.fnUntraced(function* <Claims>(
    mapping: PendingAuthenticationMapping<Claims, any, any, any, any, any>,
    options: SessionSqlOptions,
  ): Effect.fn.Return<
    PendingAuthentication<Claims>,
    SessionUnavailable,
    LifecycleHooks | CurrentSessionSql | NativeDatabase
  > {
    const database = yield* CurrentSessionSql;

    if (!options.coordinated)
      yield* (operations.validateStorage?.(mapping) ?? Effect.void).pipe(
        Effect.mapError(unavailable),
      );
    const hooks = yield* LifecycleHooks;

    const service = {
      create: <A>(
        input: Omit<PendingAuthenticationRecord<Claims>, "version">,
        _inputNow: DateTime.Utc,
        prepare: PrepareSessionCommit<PendingAuthenticationRecord<Claims>, A>,
      ) =>
        owned(
          database,
          options,
          mapping.isConstraintConflict,
          Effect.gen(function* () {
            const transaction = yield* CurrentSessionSql;
            const journal = yield* CurrentCommitJournal;

            const { nativeSubjectId, requirement } = yield* validateEvidenceIn(
              mapping,
              input.evidence,
              true,
            );

            const existing = (yield* readFlow(mapping, input.evidence.flowId, true))[0];

            if (existing !== undefined) {
              const dedupUntil = yield* mapping.flow.decodeInstant(
                existing[mapping.flow.dedupUntil],
              );

              if (DateTime.toEpochMillis(yield* freshNow) < DateTime.toEpochMillis(dedupUntil))
                return yield* SessionConflict.make({});
              yield* transaction
                .delete(mapping.pending.table)
                .where(eq(pendingColumns(mapping).flowId, input.evidence.flowId));
              yield* transaction
                .delete(mapping.flow.table)
                .where(eq(flowColumns(mapping).flowId, input.evidence.flowId));
            }

            const version = yield* allocate(
              options.mode,
              mapping.pending.allocateVersion,
              mapping.pending.allocateVersionSync,
            );

            yield* assessAuthentication(input.evidence, requirement);
            const now = yield* freshNow;

            if (DateTime.toEpochMillis(now) >= DateTime.toEpochMillis(input.expiresAt))
              return yield* stale();
            const record = { ...input, version };
            const receipt = prepare(record, journal);

            yield* transaction.insert(mapping.flow.table).values(
              mapping.flow.encodePendingInsert({
                evidence: input.evidence,
                subjectId: nativeSubjectId,
                pendingDigest: input.digest,
                dedupUntil: input.expiresAt,
              }),
            );
            yield* transaction.insert(mapping.pending.table).values(
              mapping.pending.encodeInsert(record, {
                subjectId: nativeSubjectId,
                failedAttempts: 0,
                consumed: false,
              }),
            );

            return receipt;
          }).pipe(normalizeMutation(mapping)),
        ),
      context: (input: { readonly digest: TokenDigest; readonly now: DateTime.Utc }) =>
        safeTransaction(
          inTransaction(
            database,
            readAuthenticatedPending<PendingAuthenticationState>(mapping, input, "context"),
          ),
        ).pipe(Effect.flatMap(pendingAuthenticationContext)),
      read: (input: {
        readonly digest: TokenDigest;
        readonly bindingDigest: TokenDigest;
        readonly now: DateTime.Utc;
      }) =>
        safeTransaction(
          inTransaction(
            database,
            readAuthenticatedPending<PendingAuthenticationRecord<Claims>>(mapping, input, "record"),
          ),
        ).pipe(Effect.map((record) => record as PendingAuthenticationRecord<Claims>)),
      reject: <A>(
        input: Parameters<PendingAuthentication<Claims>["reject"]>[0],
        prepare: PrepareSessionCommit<{ readonly _tag: "Rejected" }, A>,
      ) =>
        owned(
          database,
          options,
          mapping.isConstraintConflict,
          Effect.gen(function* () {
            const transaction = yield* CurrentSessionSql;
            const journal = yield* CurrentCommitJournal;
            const initial = (yield* readPending(mapping, input.digest, false))[0];

            if (initial === undefined) return prepare({ _tag: "Rejected" }, journal);
            const record = yield* mapping.pending.decodeContext(initial);

            const nativeSubjectId = yield* mapping.subjectId.toNative(
              record.evidence.revision.subjectId,
            );

            const subject = (yield* readSubject(mapping, nativeSubjectId, true))[0];
            const current = (yield* readPending(mapping, input.digest, true))[0];
            const now = yield* freshNow;
            const receipt = prepare({ _tag: "Rejected" }, journal);

            if (
              subject !== undefined &&
              mapping.subject.isActiveStatus(subject[mapping.subject.status]) &&
              subject[mapping.subject.securityRevision] ===
                record.evidence.revision.securityRevision &&
              current !== undefined &&
              current[mapping.pending.consumed] === false &&
              record.evidence.bindingDigest === input.bindingDigest &&
              DateTime.toEpochMillis(now) < DateTime.toEpochMillis(record.expiresAt)
            ) {
              yield* transaction
                .update(mapping.pending.table)
                .set(
                  updateValues([
                    [
                      mapping.pending.failedAttempts,
                      sql`case when ${pendingColumns(mapping).failedAttempts} < ${pendingColumns(mapping).attemptLimit} then ${pendingColumns(mapping).failedAttempts} + 1 else ${pendingColumns(mapping).failedAttempts} end`,
                    ],
                  ]),
                )
                .where(eq(pendingColumns(mapping).digest, input.digest));
            }

            return receipt;
          }),
        ),
    };

    return {
      create: (input, now, prepare) =>
        service.create(input, now, prepare).pipe(Effect.provideService(LifecycleHooks, hooks)),
      context: (input) => service.context(input).pipe(Effect.provideService(LifecycleHooks, hooks)),
      read: (input) => service.read(input).pipe(Effect.provideService(LifecycleHooks, hooks)),
      reject: (input, prepare) =>
        service.reject(input, prepare).pipe(Effect.provideService(LifecycleHooks, hooks)),
    } satisfies PendingAuthentication<Claims>;
  });

  const sessionColumns = (mapping: any) => ({
    sessionId: column(mapping.session.table, mapping.session.sessionId),
    subjectId: column(mapping.session.table, mapping.session.subjectId),
    digest: column(mapping.session.table, mapping.session.digest),
    version: column(mapping.session.table, mapping.session.version),
    securityRevision: column(mapping.session.table, mapping.session.securityRevision),
    issuedAt: column(mapping.session.table, mapping.session.issuedAt),
    expiresAt: column(mapping.session.table, mapping.session.expiresAt),
    absoluteExpiresAt: column(mapping.session.table, mapping.session.absoluteExpiresAt),
  });

  const makeSqlStatefulSessions = Effect.fnUntraced(function* <Claims>(
    mapping: StatefulSessionMapping<Claims, any, any, any, any, any, any, any>,
    options: SessionSqlOptions,
  ): Effect.fn.Return<
    {
      readonly statefulSessionPersistence: StatefulSessionPersistence<Claims>;
      readonly sessionRepository: SessionRepository;
    },
    SessionUnavailable,
    LifecycleHooks | CurrentSessionSql | NativeDatabase
  > {
    const database = yield* CurrentSessionSql;

    if (!options.coordinated)
      yield* (operations.validateStorage?.(mapping) ?? Effect.void).pipe(
        Effect.mapError(unavailable),
      );
    const hooks = yield* LifecycleHooks;

    const c = sessionColumns(mapping);

    const persistence = {
      establish: <A>(
        input: Parameters<StatefulSessionPersistence<Claims>["establish"]>[0],
        prepare: PrepareSessionCommit<StatefulSessionRecord<Claims>, A>,
      ) =>
        owned(
          database,
          options,
          mapping.isConstraintConflict,
          Effect.gen(function* () {
            const transaction = yield* CurrentSessionSql;
            const journal = yield* CurrentCommitJournal;

            const { nativeSubjectId, requirement } = yield* validateEvidenceIn(
              mapping,
              input.evidence,
              true,
            );

            let flowInsert: unknown | undefined;
            let pendingExpiresAt: DateTime.Utc | undefined;

            if (input.pending === undefined)
              flowInsert = yield* ensureDirectFlowAvailable(
                mapping,
                input.evidence,
                nativeSubjectId,
                input.session.absoluteExpiresAt,
              );
            else {
              if (mapping.pending === undefined) return yield* invalidPending();
              const pending = yield* validatePending(mapping, input.pending);

              if (!preservesRevision(input.evidence, pending.evidence))
                return yield* invalidPending();
              pendingExpiresAt = pending.expiresAt;
            }

            const nativeSessionId = yield* allocate(
              options.mode,
              mapping.session.allocateId,
              mapping.session.allocateIdSync,
            );

            const sessionId = yield* mapping.sessionId.toSession(nativeSessionId);

            if (sessionId === input.handoffSourceSessionId) return yield* SessionConflict.make({});

            const version = yield* allocate(
              options.mode,
              mapping.session.allocateVersion,
              mapping.session.allocateVersionSync,
            );

            const assessed = yield* assessAuthentication(input.evidence, requirement);
            const now = yield* freshNow;

            if (
              !assessed.satisfied ||
              (pendingExpiresAt !== undefined &&
                DateTime.toEpochMillis(now) >= DateTime.toEpochMillis(pendingExpiresAt)) ||
              DateTime.toEpochMillis(now) >= DateTime.toEpochMillis(input.session.expiresAt) ||
              DateTime.toEpochMillis(input.session.expiresAt) >
                DateTime.toEpochMillis(input.session.absoluteExpiresAt)
            )
              return yield* stale();

            const record = {
              ...input.session,
              sessionId,
              version,
              subjectId: input.evidence.revision.subjectId,
              securityRevision: input.evidence.revision.securityRevision,
              assurance:
                input.handoffSourceSessionId === undefined
                  ? assessed.assurance
                  : input.session.assurance,
              provenance: yield* snapshotSessionAuthenticationProvenance({
                evidence: input.evidence,
              }),
              issuedAt: now,
            };

            const receipt = prepare(record, journal);

            if (flowInsert !== undefined)
              yield* transaction.insert(mapping.flow.table).values(flowInsert);
            else
              yield* consumePending(
                { ...mapping, pending: mapping.pending! },
                input.pending!,
                input.session.absoluteExpiresAt,
              );
            yield* transaction.insert(mapping.session.table).values(
              mapping.session.encodeInsert(record, {
                subjectId: nativeSubjectId,
                sessionId: nativeSessionId,
              }),
            );

            // Writes can suspend after prepare. Recheck the capped lifetime and
            // original proof freshness while the authority rows remain locked.
            const commitNow = yield* freshNow;

            if (
              DateTime.toEpochMillis(commitNow) < DateTime.toEpochMillis(record.issuedAt) ||
              DateTime.toEpochMillis(commitNow) >= DateTime.toEpochMillis(record.expiresAt) ||
              !(yield* assessAuthentication(input.evidence, requirement)).satisfied
            )
              return yield* stale();

            return receipt;
          }).pipe(normalizeMutation(mapping)),
        ),
      verify: (input: any) =>
        safeTransaction(
          inTransaction(
            database,
            Effect.gen(function* () {
              const read = yield* CurrentSessionSql;

              const rows = yield* read
                .select()
                .from(mapping.session.table)
                .where(eq(c.digest, input.digest))
                .limit(1);

              const row = rows[0];

              if (row === undefined) return yield* invalidSession();
              const record = yield* mapping.session.decode(row);
              const nativeSubjectId = yield* mapping.subjectId.toNative(record.subjectId);
              const subjects = yield* readSubject(mapping, nativeSubjectId, false);
              const subject = subjects[0];
              const now = yield* freshNow;

              if (
                subject === undefined ||
                !mapping.subject.isActiveStatus(subject[mapping.subject.status]) ||
                subject[mapping.subject.securityRevision] !== record.securityRevision ||
                DateTime.toEpochMillis(now) >= DateTime.toEpochMillis(record.expiresAt) ||
                DateTime.toEpochMillis(now) >= DateTime.toEpochMillis(record.absoluteExpiresAt)
              )
                return yield* invalidSession();

              return record;
            }),
          ),
        ),
      rotate: <A>(
        input: Parameters<StatefulSessionPersistence<Claims>["rotate"]>[0],
        prepare: PrepareSessionCommit<StatefulSessionRecord<Claims>, A>,
      ) =>
        owned(
          database,
          options,
          mapping.isConstraintConflict,
          Effect.gen(function* () {
            const transaction = yield* CurrentSessionSql;
            const journal = yield* CurrentCommitJournal;
            const nativeSessionId = yield* mapping.sessionId.toNative(input.sessionId);

            const initial = (yield* transaction
              .select()
              .from(mapping.session.table)
              .where(eq(c.sessionId, nativeSessionId))
              .limit(1))[0];

            if (initial === undefined) return yield* SessionConflict.make({});
            const initialRecord = yield* mapping.session.decode(initial);
            const nativeSubjectId = yield* mapping.subjectId.toNative(initialRecord.subjectId);
            const subject = (yield* readSubject(mapping, nativeSubjectId, true))[0];

            const row = (yield* selectRows(
              transaction
                .select()
                .from(mapping.session.table)
                .where(eq(c.sessionId, nativeSessionId))
                .limit(1),
              options.locking,
            ))[0];

            if (row === undefined) return yield* SessionConflict.make({});
            const record = yield* mapping.session.decode(row);

            const version = yield* allocate(
              options.mode,
              mapping.session.allocateVersion,
              mapping.session.allocateVersionSync,
            );

            const now = yield* freshNow;

            if (
              subject === undefined ||
              !mapping.subject.isActiveStatus(subject[mapping.subject.status]) ||
              subject[mapping.subject.securityRevision] !== input.expectedSecurityRevision ||
              record.securityRevision !== input.expectedSecurityRevision ||
              record.digest !== input.expectedDigest ||
              record.version !== input.expectedVersion ||
              DateTime.toEpochMillis(now) >= DateTime.toEpochMillis(record.expiresAt) ||
              DateTime.toEpochMillis(now) >= DateTime.toEpochMillis(record.absoluteExpiresAt) ||
              DateTime.toEpochMillis(input.nextExpiresAt) >
                DateTime.toEpochMillis(record.absoluteExpiresAt) ||
              DateTime.toEpochMillis(input.nextExpiresAt) <= DateTime.toEpochMillis(now)
            )
              return yield* SessionConflict.make({});

            const next = {
              ...record,
              digest: input.nextDigest,
              credentialVersion: input.nextCredentialVersion,
              version,
              issuedAt: now,
              expiresAt: input.nextExpiresAt,
            };

            const receipt = prepare(next, journal);

            yield* transaction
              .update(mapping.session.table)
              .set(mapping.session.encodeRotation(next))
              .where(
                and(
                  eq(c.sessionId, nativeSessionId),
                  eq(c.digest, input.expectedDigest),
                  eq(c.version, input.expectedVersion),
                ),
              );

            return receipt;
          }),
        ),
      revokeDigest: <A>(digest: TokenDigest, prepare: PrepareSessionCommit<boolean, A>) =>
        owned(
          database,
          options,
          mapping.isConstraintConflict,
          Effect.gen(function* () {
            const transaction = yield* CurrentSessionSql;
            const journal = yield* CurrentCommitJournal;

            const initial = (yield* transaction
              .select()
              .from(mapping.session.table)
              .where(eq(c.digest, digest))
              .limit(1))[0];

            if (initial === undefined) return prepare(false, journal);
            const record = yield* mapping.session.decode(initial);
            const nativeSubjectId = yield* mapping.subjectId.toNative(record.subjectId);

            yield* readSubject(mapping, nativeSubjectId, true);

            const row = (yield* selectRows(
              transaction.select().from(mapping.session.table).where(eq(c.digest, digest)).limit(1),
              options.locking,
            ))[0];

            const receipt = prepare(row !== undefined, journal);

            if (row !== undefined)
              yield* transaction.delete(mapping.session.table).where(eq(c.digest, digest));

            return receipt;
          }),
        ),
      revoke: <A>(
        input: Parameters<StatefulSessionPersistence<Claims>["revoke"]>[0],
        prepare: PrepareSessionCommit<void, A>,
      ) =>
        owned(
          database,
          options,
          mapping.isConstraintConflict,
          Effect.gen(function* () {
            const transaction = yield* CurrentSessionSql;
            const journal = yield* CurrentCommitJournal;
            const nativeSubjectId = yield* mapping.subjectId.toNative(input.subjectId);
            const subject = (yield* readSubject(mapping, nativeSubjectId, true))[0];

            if (
              subject === undefined ||
              !mapping.subject.isActiveStatus(subject[mapping.subject.status]) ||
              subject[mapping.subject.securityRevision] !== input.expectedSecurityRevision
            )
              return yield* stale();
            const nativeSessionId = yield* mapping.sessionId.toNative(input.sessionId);
            const receipt = prepare(undefined, journal);

            yield* transaction
              .delete(mapping.session.table)
              .where(and(eq(c.subjectId, nativeSubjectId), eq(c.sessionId, nativeSessionId)));

            return receipt;
          }),
        ),
      revokeAll: <A>(
        input: Parameters<StatefulSessionPersistence<Claims>["revokeAll"]>[0],
        prepare: PrepareSessionCommit<void, A>,
      ) =>
        owned(
          database,
          options,
          mapping.isConstraintConflict,
          Effect.gen(function* () {
            const transaction = yield* CurrentSessionSql;
            const journal = yield* CurrentCommitJournal;
            const nativeSubjectId = yield* mapping.subjectId.toNative(input.subjectId);
            const subject = (yield* readSubject(mapping, nativeSubjectId, true))[0];

            if (
              subject === undefined ||
              !mapping.subject.isActiveStatus(subject[mapping.subject.status]) ||
              subject[mapping.subject.securityRevision] !== input.expectedSecurityRevision
            )
              return yield* stale();
            const nextRevisionSync = mapping.subject.nextSecurityRevisionSync;

            const next = yield* allocate(
              options.mode,
              mapping.subject.nextSecurityRevision?.(input.expectedSecurityRevision),
              nextRevisionSync === undefined
                ? undefined
                : () => nextRevisionSync(input.expectedSecurityRevision),
            );

            const receipt = prepare(undefined, journal);

            yield* transaction
              .update(mapping.subject.table)
              .set(updateValues([[mapping.subject.securityRevision, next]]))
              .where(
                and(
                  eq(authorityColumns(mapping).subjectId, nativeSubjectId),
                  eq(authorityColumns(mapping).subjectRevision, input.expectedSecurityRevision),
                ),
              );
            yield* transaction
              .delete(mapping.session.table)
              .where(eq(c.subjectId, nativeSubjectId));

            return receipt;
          }),
        ),
    };

    const repository = {
      list: (input: any) =>
        safeTransaction(
          inTransaction(
            database,
            Effect.gen(function* () {
              const read = yield* CurrentSessionSql;
              const nativeSubjectId = yield* mapping.subjectId.toNative(input.subjectId);
              const subject = (yield* readSubject(mapping, nativeSubjectId, false))[0];

              if (
                subject === undefined ||
                !mapping.subject.isActiveStatus(subject[mapping.subject.status])
              )
                return { sessions: [] };

              const cursor =
                input.cursor === undefined
                  ? undefined
                  : yield* mapping.sessionId.toNative(input.cursor as any);

              const now = yield* freshNow;

              const rows = yield* read
                .select()
                .from(mapping.session.table)
                .where(
                  and(
                    eq(c.subjectId, nativeSubjectId),
                    eq(c.securityRevision, subject[mapping.subject.securityRevision]),
                    gt(c.expiresAt, mapping.session.encodeInstant(now)),
                    gt(c.absoluteExpiresAt, mapping.session.encodeInstant(now)),
                    cursor === undefined ? undefined : gt(c.sessionId, cursor),
                  ),
                )
                .orderBy(c.sessionId)
                .limit(input.limit + 1);

              const decoded = yield* Effect.forEach(rows, (row: any) =>
                mapping.session.decode(row),
              );

              const codec = Schema.toCodecJson(Schema.toType(SessionMetadata));

              const sessions = yield* Effect.forEach(decoded.slice(0, input.limit), (record: any) =>
                Schema.encodeEffect(codec)(record).pipe(Effect.flatMap(Schema.decodeEffect(codec))),
              );

              const extra = decoded[input.limit];
              const nextCursor = extra === undefined ? undefined : sessions.at(-1)?.sessionId;

              return {
                sessions,
                ...(nextCursor === undefined ? {} : { nextCursor }),
              };
            }),
          ),
        ),
    };

    return {
      statefulSessionPersistence: {
        establish: (input, prepare) =>
          persistence.establish(input, prepare).pipe(Effect.provideService(LifecycleHooks, hooks)),
        verify: (input) =>
          persistence.verify(input).pipe(Effect.provideService(LifecycleHooks, hooks)),
        rotate: (input, prepare) =>
          persistence.rotate(input, prepare).pipe(Effect.provideService(LifecycleHooks, hooks)),
        revokeDigest: (digest, prepare) =>
          persistence
            .revokeDigest(digest, prepare)
            .pipe(Effect.provideService(LifecycleHooks, hooks)),
        revoke: (input, prepare) =>
          persistence.revoke(input, prepare).pipe(Effect.provideService(LifecycleHooks, hooks)),
        revokeAll: (input, prepare) =>
          persistence.revokeAll(input, prepare).pipe(Effect.provideService(LifecycleHooks, hooks)),
      } satisfies StatefulSessionPersistence<Claims>,
      sessionRepository: {
        list: (input) => repository.list(input).pipe(Effect.provideService(LifecycleHooks, hooks)),
      } satisfies SessionRepository,
    };
  });

  const makeSqlSignedValidity = Effect.fnUntraced(function* (
    mapping: SignedSessionValidityMapping<any, any, any, any>,
    options: SessionSqlOptions,
  ): Effect.fn.Return<
    SignedSessionValidity,
    SessionUnavailable,
    LifecycleHooks | CurrentSessionSql | NativeDatabase
  > {
    const database = yield* CurrentSessionSql;

    if (!options.coordinated)
      yield* (operations.validateStorage?.(mapping) ?? Effect.void).pipe(
        Effect.mapError(unavailable),
      );
    const hooks = yield* LifecycleHooks;

    const subject = subjectColumns(mapping);

    const tombstone = {
      subjectId: column(mapping.tombstone.table, mapping.tombstone.subjectId),
      sessionId: column(mapping.tombstone.table, mapping.tombstone.sessionId),
      absoluteExpiresAt: column(mapping.tombstone.table, mapping.tombstone.absoluteExpiresAt),
    };

    const service = {
      verify: (session: SessionMetadata, _now: DateTime.Utc) =>
        safeTransaction(
          inTransaction(
            database,
            Effect.gen(function* () {
              const read = yield* CurrentSessionSql;
              const nativeSubjectId = yield* mapping.subjectId.toNative(session.subjectId);
              const nativeSessionId = yield* mapping.sessionId.toNative(session.sessionId);
              const subjects = yield* readSubject(mapping, nativeSubjectId, false);
              const row = subjects[0];

              if (
                row === undefined ||
                !mapping.subject.isActiveStatus(row[mapping.subject.status]) ||
                row[mapping.subject.securityRevision] !== session.securityRevision
              )
                return yield* invalidSession();
              const authoritativeNow = yield* freshNow;

              if (
                DateTime.toEpochMillis(authoritativeNow) >=
                  DateTime.toEpochMillis(session.expiresAt) ||
                DateTime.toEpochMillis(authoritativeNow) >=
                  DateTime.toEpochMillis(session.absoluteExpiresAt)
              )
                return yield* invalidSession();

              const revoked = yield* read
                .select({ sessionId: tombstone.sessionId })
                .from(mapping.tombstone.table)
                .where(
                  and(
                    eq(tombstone.subjectId, nativeSubjectId),
                    eq(tombstone.sessionId, nativeSessionId),
                    gt(
                      tombstone.absoluteExpiresAt,
                      mapping.tombstone.encodeInstant(authoritativeNow),
                    ),
                  ),
                )
                .limit(1);

              if (revoked.length > 0) return yield* invalidSession();
            }),
          ),
        ),
      revoke: <A>(
        input: Parameters<SignedSessionValidity["revoke"]>[0],
        prepare: PrepareSessionCommit<void, A>,
      ) =>
        owned(
          database,
          options,
          mapping.isConstraintConflict,
          Effect.gen(function* () {
            const transaction = yield* CurrentSessionSql;
            const journal = yield* CurrentCommitJournal;
            const nativeSubjectId = yield* mapping.subjectId.toNative(input.subjectId);
            const row = (yield* readSubject(mapping, nativeSubjectId, true))[0];

            if (
              row === undefined ||
              !mapping.subject.isActiveStatus(row[mapping.subject.status]) ||
              row[mapping.subject.securityRevision] !== input.expectedSecurityRevision
            )
              return yield* stale();
            const nativeSessionId = yield* mapping.sessionId.toNative(input.sessionId);

            const existing = yield* transaction
              .select()
              .from(mapping.tombstone.table)
              .where(
                and(
                  eq(tombstone.subjectId, nativeSubjectId),
                  eq(tombstone.sessionId, nativeSessionId),
                ),
              )
              .limit(1);

            const receipt = prepare(undefined, journal);

            if (existing[0] === undefined)
              yield* transaction.insert(mapping.tombstone.table).values(
                mapping.tombstone.encodeInsert({
                  subjectId: nativeSubjectId,
                  sessionId: nativeSessionId,
                  absoluteExpiresAt: input.absoluteExpiresAt,
                }),
              );
            else {
              const existingExpiry = yield* mapping.tombstone.decodeInstant(
                existing[0][mapping.tombstone.absoluteExpiresAt],
              );

              if (
                DateTime.toEpochMillis(input.absoluteExpiresAt) >
                DateTime.toEpochMillis(existingExpiry)
              )
                yield* transaction
                  .update(mapping.tombstone.table)
                  .set(
                    updateValues([
                      [
                        mapping.tombstone.absoluteExpiresAt,
                        mapping.tombstone.encodeInstant(input.absoluteExpiresAt),
                      ],
                    ]),
                  )
                  .where(
                    and(
                      eq(tombstone.subjectId, nativeSubjectId),
                      eq(tombstone.sessionId, nativeSessionId),
                    ),
                  );
            }

            return receipt;
          }),
        ),
      revokeAll: <A>(
        input: Parameters<SignedSessionValidity["revokeAll"]>[0],
        prepare: PrepareSessionCommit<void, A>,
      ) =>
        owned(
          database,
          options,
          mapping.isConstraintConflict,
          Effect.gen(function* () {
            const transaction = yield* CurrentSessionSql;
            const journal = yield* CurrentCommitJournal;
            const nativeSubjectId = yield* mapping.subjectId.toNative(input.subjectId);
            const row = (yield* readSubject(mapping, nativeSubjectId, true))[0];

            if (
              row === undefined ||
              !mapping.subject.isActiveStatus(row[mapping.subject.status]) ||
              row[mapping.subject.securityRevision] !== input.expectedSecurityRevision
            )
              return yield* stale();
            const nextRevisionSync = mapping.subject.nextSecurityRevisionSync;

            const next = yield* allocate(
              options.mode,
              mapping.subject.nextSecurityRevision?.(input.expectedSecurityRevision),
              nextRevisionSync === undefined
                ? undefined
                : () => nextRevisionSync(input.expectedSecurityRevision),
            );

            const receipt = prepare(undefined, journal);

            yield* transaction
              .update(mapping.subject.table)
              .set(updateValues([[mapping.subject.securityRevision, next]]))
              .where(
                and(
                  eq(subject.subjectId, nativeSubjectId),
                  eq(subject.subjectRevision, input.expectedSecurityRevision),
                ),
              );

            return receipt;
          }),
        ),
    };

    return {
      verify: (session, now) =>
        service.verify(session, now).pipe(Effect.provideService(LifecycleHooks, hooks)),
      revoke: (input, prepare) =>
        service.revoke(input, prepare).pipe(Effect.provideService(LifecycleHooks, hooks)),
      revokeAll: (input, prepare) =>
        service.revokeAll(input, prepare).pipe(Effect.provideService(LifecycleHooks, hooks)),
    } satisfies SignedSessionValidity;
  });

  const stepUpColumns = (mapping: any) =>
    Object.fromEntries(
      [
        "digest",
        "version",
        "flowId",
        "subjectId",
        "bindingDigest",
        "snapshot",
        "expiresAt",
        "attemptLimit",
        "failedAttempts",
        "consumed",
      ].map((key) => [key, column(mapping.intent.table, mapping.intent[key])]),
    );

  const stepUpLocator = Effect.fn("DrizzleStepUp.locator")(function* (
    mapping: AnyStepUpMapping,
    digest: TokenDigest,
    locking: boolean,
    expiresAt?: DateTime.Utc,
  ) {
    const database = yield* CurrentSessionSql;

    return yield* selectRows(
      database
        .select()
        .from(mapping.intent.table)
        .where(
          and(
            eq(stepUpColumns(mapping).digest, digest),
            expiresAt === undefined
              ? undefined
              : eq(stepUpColumns(mapping).expiresAt, mapping.intent.encodeInstant(expiresAt)),
          ),
        )
        .limit(1),
      locking,
    ).pipe(Effect.map((rows) => rows[0]));
  });

  const stepUpAuthority = Effect.fn("DrizzleStepUp.authority")(function* (
    mapping: AnyStepUpMapping,
    revision: AuthenticationRevision,
    locking: boolean,
  ) {
    const current = yield* captureDetailsIn(
      mapping,
      revision.subjectId,
      revision.credentials.map((c) => c.credentialId),
      locking,
    );

    if (!sameStepUpRevision(current.revision, revision)) return yield* stale();
    const requirement = yield* mapping.subject.decodeRequirement(current.subject);

    return {
      nativeSubjectId: yield* mapping.subjectId.toNative(revision.subjectId),
      requirement,
    };
  });

  const stepUpSource = Effect.fn("DrizzleStepUp.source")(function* (
    mapping: AnyStepUpMapping,
    intent: SessionStepUpIntent,
    nativeSubjectId: unknown,
    now: DateTime.Utc,
    locking: boolean,
  ) {
    const database = yield* CurrentSessionSql;

    if (!stepUpIntentLive(intent, mapping.source.kind, now))
      return yield* SessionStepUpInvalid.make({});
    const source = mapping.source;

    if (source.kind === "StatelessSigned") return { nativeSessionId: undefined, row: undefined };
    const nativeSessionId = yield* source.sessionId.toNative(intent.sourceSessionId);

    if (source.kind === "StateAssistedSigned") {
      const t = source.tombstone;

      const found = yield* selectRows(
        database
          .select()
          .from(t.table)
          .where(
            and(
              eq(column(t.table, t.subjectId), nativeSubjectId),
              eq(column(t.table, t.sessionId), nativeSessionId),
              gt(column(t.table, t.absoluteExpiresAt), t.encodeInstant(now)),
            ),
          )
          .limit(1),
        locking,
      );

      if (found.length > 0) return yield* SessionStepUpInvalid.make({});

      return { nativeSessionId, row: undefined };
    }

    const s = source.session,
      c = sessionColumns(source);

    const row = (yield* selectRows(
      database
        .select()
        .from(s.table)
        .where(
          and(
            eq(c.sessionId, nativeSessionId),
            eq(c.subjectId, nativeSubjectId),
            eq(c.securityRevision, intent.revision.securityRevision),
            eq(column(s.table, s.credentialVersion), intent.sourceCredentialVersion),
            eq(column(s.table, s.authenticatedAt), s.encodeInstant(intent.sourceAuthenticatedAt)),
            eq(c.expiresAt, s.encodeInstant(intent.sourceExpiresAt)),
            eq(c.absoluteExpiresAt, s.encodeInstant(intent.sourceAbsoluteExpiresAt)),
            gt(c.expiresAt, s.encodeInstant(now)),
            gt(c.absoluteExpiresAt, s.encodeInstant(now)),
          ),
        )
        .limit(1),
      locking,
    ))[0];

    if (row === undefined) return yield* SessionStepUpInvalid.make({});

    return { nativeSessionId, row };
  });

  const readSqlStepUp = Effect.fn("DrizzleStepUp.read")(function* (
    mapping: AnyStepUpMapping,
    digest: TokenDigest,
    locking: boolean,
  ) {
    const first = yield* stepUpLocator(mapping, digest, false);

    if (first === undefined) return yield* SessionStepUpInvalid.make({});
    const intent = yield* decodeStepUpIntent(first[mapping.intent.snapshot]);
    const authority = yield* stepUpAuthority(mapping, intent.revision, locking);

    const source = yield* stepUpSource(
      mapping,
      intent,
      authority.nativeSubjectId,
      yield* freshNow,
      locking,
    );

    const row = yield* stepUpLocator(mapping, digest, locking, intent.expiresAt);
    const m = mapping.intent;

    if (
      row === undefined ||
      row[m.snapshot] !== first[m.snapshot] ||
      row[m.version] !== intent.version ||
      row[m.digest] !== intent.digest ||
      digest !== intent.digest ||
      row[m.flowId] !== intent.flowId ||
      row[m.bindingDigest] !== intent.bindingDigest ||
      !mapping.subjectId.equals(row[m.subjectId], authority.nativeSubjectId) ||
      Boolean(row[m.consumed]) ||
      !Schema.is(Schema.Natural)(row[m.failedAttempts]) ||
      row[m.failedAttempts] >= row[m.attemptLimit] ||
      row[m.attemptLimit] !== intent.attemptLimit ||
      !stepUpIntentLive(intent, mapping.source.kind, yield* freshNow)
    )
      return yield* SessionStepUpInvalid.make({});

    return { row, intent, source, ...authority };
  });

  const isSqlStepUpRejectAbsence = (error: unknown): error is SqlStepUpRejectAbsence => {
    const tag =
      typeof error === "object" && error !== null ? Reflect.get(error, "_tag") : undefined;

    return tag === "SessionStepUpInvalid" || tag === "StaleAuthentication";
  };

  const recoverSqlStepUpRejectAbsence = <A, B, R>(
    effect: Effect.Effect<A, SqlStepUpReadFailure, R>,
    rejected: B,
  ): Effect.Effect<A | B, AdapterFailure | SessionUnavailable, R> =>
    effect.pipe(
      Effect.catchCause((cause) => {
        if (
          cause.reasons.length > 0 &&
          cause.reasons.every(
            (reason) => Cause.isFailReason(reason) && isSqlStepUpRejectAbsence(reason.error),
          )
        )
          return Effect.succeed(rejected);

        return Effect.failCause(
          Cause.map(cause, (error) => (isSqlStepUpRejectAbsence(error) ? unavailable() : error)),
        );
      }),
    );

  /** Shared implementation; public driver entrypoints restore concrete tables/IDs. */
  const makeSqlSessionStepUp = Effect.fnUntraced(function* <Claims>(
    mapping: SessionStepUpMapping<Claims, any, any, any, any, any, any, any>,
    options: SessionSqlOptions,
  ): Effect.fn.Return<
    SessionStepUpPersistence<Claims>,
    SessionUnavailable,
    LifecycleHooks | CurrentSessionSql | NativeDatabase
  > {
    const database = yield* CurrentSessionSql;

    if (!options.coordinated)
      yield* (operations.validateStorage?.(mapping) ?? Effect.void).pipe(
        Effect.mapError(unavailable),
      );
    const hooks = yield* LifecycleHooks;

    const m = mapping.intent,
      c = stepUpColumns(mapping);

    const read = (digest: TokenDigest) =>
      mapFailureCause(
        safeTransaction(inTransaction(database, readSqlStepUp(mapping, digest, options.locking))),
        (error) => (error._tag === "StaleAuthentication" ? SessionStepUpInvalid.make({}) : error),
      );

    const service = {
      create: <A>(
        input: Omit<SessionStepUpIntent, "version">,
        _now: DateTime.Utc,
        prepare: PrepareSessionCommit<SessionStepUpIntent, A>,
      ) =>
        owned(
          database,
          options,
          mapping.isConstraintConflict,
          Effect.gen(function* () {
            const tx = yield* CurrentSessionSql;
            const journal = yield* CurrentCommitJournal;
            const authority = yield* stepUpAuthority(mapping, input.revision, options.locking);

            const version = yield* allocate(options.mode, m.allocateVersion, m.allocateVersionSync);

            const record: SessionStepUpIntent = { ...input, version };

            yield* stepUpSource(
              mapping,
              record,
              authority.nativeSubjectId,
              yield* freshNow,
              options.locking,
            );

            const existing = yield* selectRows(
              tx
                .select()
                .from(m.table)
                .where(or(eq(c.digest, input.digest), eq(c.flowId, input.flowId)))
                .limit(1),
              options.locking,
            );

            if (existing.length > 0) return yield* SessionConflict.make({});
            const snapshot = yield* encodeStepUpIntent(record);

            const values = {
              ...m.encodeInsert(record, { subjectId: authority.nativeSubjectId }),
              ...updateValues([
                [m.digest, record.digest],
                [m.version, version],
                [m.flowId, record.flowId],
                [m.subjectId, authority.nativeSubjectId],
                [m.bindingDigest, record.bindingDigest],
                [m.snapshot, snapshot],
                [m.expiresAt, m.encodeInstant(record.expiresAt)],
                [m.attemptLimit, record.attemptLimit],
                [m.failedAttempts, 0],
                [m.consumed, false],
              ]),
            };

            const receipt = prepare(record, journal);

            yield* tx.insert(m.table).values(values).pipe(normalizeMutation(mapping));

            const inserted = (yield* tx
              .select()
              .from(m.table)
              .where(
                and(
                  eq(c.digest, record.digest),
                  eq(c.version, version),
                  eq(c.flowId, record.flowId),
                  eq(c.subjectId, authority.nativeSubjectId),
                  eq(c.bindingDigest, record.bindingDigest),
                  eq(c.snapshot, snapshot),
                  eq(c.expiresAt, m.encodeInstant(record.expiresAt)),
                  eq(c.attemptLimit, record.attemptLimit),
                  eq(c.failedAttempts, 0),
                  eq(c.consumed, false),
                ),
              )
              .limit(1))[0];

            if (inserted === undefined) return yield* unavailable();

            return receipt;
          }),
        ).pipe((effect) =>
          mapFailureCause(effect, (error) =>
            error._tag === "SessionStepUpInvalid" ? stale() : error,
          ),
        ),
      context: (input: any) =>
        mapFailureCause(
          read(input.digest).pipe(
            Effect.flatMap(({ intent }) =>
              snapshotPendingAuthenticationContext({
                flowId: intent.flowId,
                bindingDigest: intent.bindingDigest,
                revision: intent.revision,
                expiresAtMillis: DateTime.toEpochMillis(intent.expiresAt),
              }),
            ),
          ),
          (error) => (error._tag === "PendingAuthenticationInvalid" ? unavailable() : error),
        ),
      read: (input: any) =>
        read(input.digest).pipe(
          Effect.flatMap((value) =>
            value.intent.bindingDigest === input.bindingDigest
              ? Effect.succeed(value.intent)
              : Effect.fail(SessionStepUpInvalid.make({})),
          ),
        ),
      reject: <A>(
        input: Parameters<SessionStepUpPersistence<Claims>["reject"]>[0],
        prepare: PrepareSessionCommit<{ readonly _tag: "Rejected" }, A>,
      ) =>
        owned(
          database,
          options,
          mapping.isConstraintConflict,
          Effect.gen(function* () {
            const tx = yield* CurrentSessionSql;
            const journal = yield* CurrentCommitJournal;

            const selected = yield* recoverSqlStepUpRejectAbsence(
              readSqlStepUp(mapping, input.digest, options.locking).pipe(
                Effect.map((value) => ({ _tag: "Found" as const, value })),
              ),
              { _tag: "Rejected" as const },
            );

            if (selected._tag === "Rejected") return prepare({ _tag: "Rejected" }, journal);
            const { row, intent } = selected.value;
            const receipt = prepare({ _tag: "Rejected" }, journal);

            yield* tx
              .update(m.table)
              .set(updateValues([[m.failedAttempts, sql`${c.failedAttempts} + 1`]]))
              .where(
                and(
                  eq(c.digest, input.digest),
                  eq(c.snapshot, row[m.snapshot]),
                  eq(c.version, intent.version),
                  eq(c.consumed, false),
                  sql`${c.failedAttempts} < ${c.attemptLimit}`,
                ),
              );
            const written = yield* stepUpLocator(mapping, input.digest, false);

            if (
              written === undefined ||
              written[m.version] !== intent.version ||
              written[m.snapshot] !== row[m.snapshot] ||
              written[m.failedAttempts] !== row[m.failedAttempts] + 1
            )
              return yield* unavailable();

            return receipt;
          }),
        ),
      complete: <A>(
        plan: Parameters<SessionStepUpPersistence<Claims>["complete"]>[0],
        prepare: PrepareSessionCommit<SessionInspection<Claims>, A>,
      ) =>
        owned(
          database,
          options,
          mapping.isConstraintConflict,
          Effect.gen(function* () {
            const tx = yield* CurrentSessionSql;
            const journal = yield* CurrentCommitJournal;

            yield* validateStepUpPlan(plan);

            // Lock the entire combined vector before source/intent, including added factors.
            const current = yield* stepUpAuthority(
              mapping,
              plan.evidence.revision,
              options.locking,
            );

            const stored = yield* readSqlStepUp(mapping, plan.intent.digest, options.locking);

            if (
              (yield* encodeStepUpIntent(stored.intent)) !==
              (yield* encodeStepUpIntent(plan.intent))
            )
              return yield* SessionStepUpInvalid.make({});

            const base = yield* assessAuthentication(plan.evidence, current.requirement).pipe(
              Effect.mapError(() => stale()),
            );

            const profile = yield* assessAuthentication(
              plan.evidence,
              stored.intent.requirement,
            ).pipe(Effect.mapError(() => stale()));

            if (!base.satisfied || !profile.satisfied) return yield* stale();

            const replacement = plan.replacement,
              now = yield* freshNow;

            if (
              DateTime.toEpochMillis(replacement.inspection.session.expiresAt) >
                DateTime.toEpochMillis(stored.intent.sourceAbsoluteExpiresAt) ||
              DateTime.toEpochMillis(now) <
                DateTime.toEpochMillis(replacement.inspection.session.issuedAt) ||
              DateTime.toEpochMillis(now) >=
                Math.min(
                  DateTime.toEpochMillis(replacement.inspection.session.expiresAt),
                  DateTime.toEpochMillis(stored.intent.expiresAt),
                )
            )
              return yield* SessionStepUpInvalid.make({});
            let rotation: any;

            if (replacement._tag === "Stateful") {
              if (mapping.source.kind !== "Stateful") return yield* SessionStepUpInvalid.make({});

              const s = mapping.source.session,
                row = stored.source.row;

              if (
                row[s.digest] !== replacement.expectedDigest ||
                row[s.version] !== replacement.expectedRowVersion
              )
                return yield* SessionConflict.make({});

              const version = yield* allocate(
                options.mode,
                s.allocateVersion,
                s.allocateVersionSync,
              );

              const next: StatefulSessionRecord<Claims> = {
                ...replacement.inspection.session,
                provenance: replacement.inspection.provenance,
                credentialVersion: replacement.inspection.credentialVersion,
                digest: replacement.nextDigest,
                version,
              };

              rotation = {
                ...s.encodeRotation(next),
                ...updateValues([
                  [s.version, version],
                  [s.digest, next.digest],
                  [s.credentialVersion, next.credentialVersion],
                  [s.authenticatedAt, s.encodeInstant(next.assurance.authenticatedAt)],
                  [s.issuedAt, s.encodeInstant(next.issuedAt)],
                  [s.expiresAt, s.encodeInstant(next.expiresAt)],
                  [s.absoluteExpiresAt, s.encodeInstant(next.absoluteExpiresAt)],
                ]),
              };
            }

            const completionVersion = yield* allocate(
              options.mode,
              m.allocateVersion,
              m.allocateVersionSync,
            );

            if (completionVersion === stored.intent.version) return yield* unavailable();

            const completionSnapshot = yield* encodeStepUpIntent({
              ...stored.intent,
              version: completionVersion,
            });

            const receipt = prepare(replacement.inspection, journal);

            if (replacement._tag === "Stateful" && mapping.source.kind === "Stateful") {
              const s = mapping.source.session,
                sc = sessionColumns(mapping.source);

              yield* tx
                .update(s.table)
                .set(rotation)
                .where(
                  and(
                    eq(sc.sessionId, stored.source.nativeSessionId),
                    eq(sc.digest, replacement.expectedDigest),
                    eq(sc.version, replacement.expectedRowVersion),
                  ),
                );

              const written = (yield* tx
                .select()
                .from(s.table)
                .where(eq(sc.sessionId, stored.source.nativeSessionId))
                .limit(1))[0];

              if (written === undefined || written[s.version] !== rotation[s.version])
                return yield* unavailable();
              const decoded = yield* s.decode(written);

              if (decoded.version !== rotation[s.version] || !stepUpRotationMatches(plan, decoded))
                return yield* unavailable();
            } else if (
              replacement._tag === "StateAssistedSigned" &&
              mapping.source.kind === "StateAssistedSigned"
            ) {
              const t = mapping.source.tombstone;

              const owner = column(t.table, t.subjectId),
                id = column(t.table, t.sessionId),
                expiry = column(t.table, t.absoluteExpiresAt);

              yield* tx
                .delete(t.table)
                .where(
                  and(
                    eq(owner, stored.nativeSubjectId),
                    eq(id, stored.source.nativeSessionId),
                    lte(expiry, t.encodeInstant(yield* freshNow)),
                  ),
                );

              const values = t.encodeInsert({
                subjectId: stored.nativeSubjectId,
                sessionId: stored.source.nativeSessionId,
                absoluteExpiresAt: replacement.tombstoneUntil,
              });

              yield* tx.insert(t.table).values(values).pipe(normalizeMutation(mapping));

              const inserted = (yield* tx
                .select()
                .from(t.table)
                .where(
                  and(
                    eq(owner, stored.nativeSubjectId),
                    eq(id, stored.source.nativeSessionId),
                    eq(expiry, t.encodeInstant(replacement.tombstoneUntil)),
                  ),
                )
                .limit(1))[0];

              if (inserted === undefined) return yield* unavailable();
            }
            yield* tx
              .update(m.table)
              .set(
                updateValues([
                  [m.consumed, true],
                  [m.version, completionVersion],
                  [m.snapshot, completionSnapshot],
                ]),
              )
              .where(
                and(
                  eq(c.digest, stored.intent.digest),
                  eq(c.version, stored.intent.version),
                  eq(c.snapshot, stored.row[m.snapshot]),
                  eq(c.consumed, false),
                  eq(c.failedAttempts, stored.row[m.failedAttempts]),
                ),
              );
            const completed = yield* stepUpLocator(mapping, stored.intent.digest, false);

            if (
              completed === undefined ||
              !completed[m.consumed] ||
              completed[m.version] !== completionVersion ||
              completed[m.snapshot] !== completionSnapshot
            )
              return yield* unavailable();
            const commitNow = yield* freshNow;

            if (
              !stepUpIntentLive(stored.intent, mapping.source.kind, commitNow) ||
              DateTime.toEpochMillis(commitNow) >=
                DateTime.toEpochMillis(replacement.inspection.session.expiresAt) ||
              !(yield* assessAuthentication(plan.evidence, current.requirement).pipe(
                Effect.mapError(() => stale()),
              )).satisfied ||
              !(yield* assessAuthentication(plan.evidence, stored.intent.requirement).pipe(
                Effect.mapError(() => stale()),
              )).satisfied
            )
              return yield* stale();

            return receipt;
          }),
        ),
    };

    return {
      create: (input, now, prepare) =>
        service.create(input, now, prepare).pipe(Effect.provideService(LifecycleHooks, hooks)),
      context: (input) => service.context(input).pipe(Effect.provideService(LifecycleHooks, hooks)),
      read: (input) => service.read(input).pipe(Effect.provideService(LifecycleHooks, hooks)),
      reject: (input, prepare) =>
        service.reject(input, prepare).pipe(Effect.provideService(LifecycleHooks, hooks)),
      complete: (plan, prepare) =>
        service.complete(plan, prepare).pipe(Effect.provideService(LifecycleHooks, hooks)),
    } satisfies SessionStepUpPersistence<Claims>;
  });

  return {
    makeSqlAuthenticationAuthority,
    makeSqlPendingAuthentication,
    makeSqlStatefulSessions,
    makeSqlSignedValidity,
    makeSqlSessionStepUp,
  };
};
