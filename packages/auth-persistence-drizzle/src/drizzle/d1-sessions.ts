import {
  NativeDatabase,
  decodeStepUpIntent,
  encodeStepUpIntent,
  stepUpIntentLive,
  validateStepUpPlan,
} from "@yielded/auth-persistence/Adapter";
import {
  coordinateCommit,
  CurrentCommitJournal,
  hasCommitScope,
  type PreparedCommit,
  LifecycleHooks,
  type HookConfigurationError,
} from "@yielded/auth/Hooks";
import { reportPersistenceFailure } from "@yielded/auth/Persistence";
import type { SubjectId, TokenDigest } from "@yielded/auth/Schema";
import {
  assessAuthentication,
  snapshotSessionAuthenticationProvenance,
  AuthenticationAuthority,
  PendingAuthenticationInvalid,
  SessionConflict,
  type SessionConfigurationError,
  SessionInvalid,
  SessionStepUpInvalid,
  SessionUnavailable,
  StaleAuthentication,
  SessionMetadata,
  type AuthenticationEvidence,
  type AuthenticationRequirement,
  type AuthenticationRevision,
  type PendingConsumption,
  type SecurityRevision,
  pendingAuthenticationContext,
  snapshotPendingAuthenticationContext,
  type PendingAuthentication,
  type PendingAuthenticationRecord,
  type PendingAuthenticationState,
  type PrepareSessionCommit,
  type SessionRepository,
  type SignedSessionValidity,
  type StatefulSessionPersistence,
  type SessionStepUpIntent,
  type SessionStepUpCompletionPlan,
  type SessionStepUpPersistence,
} from "@yielded/auth/Sessions";
/* oxlint-disable no-explicit-any -- D1 batch planning bridges dynamic consumer Drizzle tables to Effect SQL statements. */
import { and, eq, getTableColumns, gt, inArray, not, or, sql, type SQL } from "drizzle-orm";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { Cause, Context, Data, DateTime, Effect, Schema } from "effect";
import type * as SqlError from "effect/sql/SqlError";
import type { Statement } from "effect/sql/Statement";

import { Database as DatabaseService } from "./d1-database";
import { compactD1GeneratedStatement } from "./d1-generated-statement";
import {
  CurrentD1PlanningDatabase,
  makeD1Owner,
  type D1Owner,
  type D1PlanningDatabase,
} from "./d1-planning";
import { D1BatchStatements } from "./D1BatchStatements";
import { column, PersistenceMappingError, isMappedConstraintConflict, updateValues } from "./model";
import { nativeDatabase } from "./native-database";
import type {
  D1AuthenticationAuthorityMapping,
  D1PendingAuthenticationMapping,
  D1SignedSessionValidityMapping,
  D1StatefulSessionMapping,
} from "./session-model";
import type { D1SessionStepUpMapping } from "./step-up-model";
import { validateDrizzleStorage } from "./storage-validation";
import type { SuppliedService } from "./SuppliedService";

type Database = D1PlanningDatabase;
type AnyD1StepUpMapping = D1SessionStepUpMapping<any, any, any, any, any, any, any, any>;
type D1DomainError =
  | SessionStepUpInvalid
  | PendingAuthenticationInvalid
  | SessionConflict
  | SessionInvalid
  | SessionUnavailable
  | StaleAuthentication;
type D1PlanError =
  | D1DomainError
  | SessionConfigurationError
  | PersistenceMappingError
  | EffectDrizzleQueryError
  | Schema.SchemaError;
type D1AdapterFailure = PersistenceMappingError | EffectDrizzleQueryError | Schema.SchemaError;
type NormalizedD1Error<E> = Extract<E, D1DomainError> | SessionUnavailable;
type PreparedValue<Method extends (...args: any[]) => any> =
  Parameters<Method>[1] extends PrepareSessionCommit<infer Value, any> ? Value : never;
interface Planned<A> {
  readonly receipt: A;
  readonly statements: ReadonlyArray<Statement<any>>;
  readonly isConstraintConflict?: (cause: unknown) => boolean;
  readonly recoverGuard?: Effect.Effect<never, D1PlanError, CurrentD1PlanningDatabase>;
  readonly journalGuard?: PreparedCommit<void>;
}
interface D1SessionBatch {
  readonly owner: D1Owner<SessionUnavailable>;
  readonly append: (planned: Planned<any>) => Effect.Effect<void, SessionUnavailable>;
}
class CurrentD1SessionBatch extends Context.Service<CurrentD1SessionBatch, D1SessionBatch>()(
  "effect-auth/drizzle/CurrentD1SessionBatch",
) {}
class D1BatchFailure extends Data.TaggedError("D1BatchFailure")<{
  readonly cause: Cause.Cause<SqlError.SqlError>;
  readonly mutation?: Planned<any>;
}> {}

const unavailable = () => SessionUnavailable.make({});
const stale = () => StaleAuthentication.make({});
const invalidPending = () => PendingAuthenticationInvalid.make({});
const invalidSession = () => SessionInvalid.make({});

const mapFailureCause = <A, E, R, E2>(
  effect: Effect.Effect<A, E, R>,
  map: (error: E) => E2,
): Effect.Effect<A, E2, R> =>
  Effect.catchCause(effect, (cause) => Effect.failCause(Cause.map(cause, map)));

const isD1DomainError = (error: unknown): error is D1DomainError => {
  const tag = typeof error === "object" && error !== null ? Reflect.get(error, "_tag") : undefined;

  return (
    tag === "SessionStepUpInvalid" ||
    tag === "PendingAuthenticationInvalid" ||
    tag === "SessionConflict" ||
    tag === "SessionInvalid" ||
    tag === "SessionUnavailable" ||
    tag === "StaleAuthentication"
  );
};

const normalizeD1Failure = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  isExpected: (error: E) => boolean,
): Effect.Effect<A, NormalizedD1Error<E>, R> =>
  reportPersistenceFailure(effect, isExpected).pipe(
    Effect.catchCause((cause) =>
      Effect.failCause(
        Cause.map(cause, (error): NormalizedD1Error<E> =>
          isD1DomainError(error) ? (error as Extract<E, D1DomainError>) : unavailable(),
        ),
      ),
    ),
  );

const terminalD1 = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  normalizeD1Failure(effect, isD1DomainError);

const containsFailure = (failure: unknown, predicate: (value: unknown) => boolean): boolean => {
  const seen = new Set<unknown>();
  const pending: Array<unknown> = [failure];

  for (let inspected = 0; inspected < 24 && pending.length > 0; inspected++) {
    const current = pending.shift();

    if (current === undefined || current === null || seen.has(current)) continue;
    seen.add(current);
    if (predicate(current)) return true;
    if (Cause.isCause(current)) {
      for (const reason of current.reasons) {
        if (Cause.isFailReason(reason)) pending.push(reason.error);
        else if (Cause.isDieReason(reason)) pending.push(reason.defect);
      }
      continue;
    }
    if (typeof current !== "object") continue;

    const wrapped = current as {
      readonly cause?: unknown;
      readonly reason?: unknown;
      readonly message?: unknown;
    };

    if (wrapped.cause !== undefined) pending.push(wrapped.cause);
    if (wrapped.reason !== undefined) pending.push(wrapped.reason);
    if (wrapped.message !== undefined) pending.push(wrapped.message);
  }

  return false;
};

const isGuardFailure = (failure: unknown): boolean =>
  containsFailure(
    failure,
    (value) => typeof value === "string" && value.includes("effect-auth-session-guard"),
  );

const recoverBatchFailure = (
  failure: D1BatchFailure,
): Effect.Effect<never, D1PlanError | SqlError.SqlError, CurrentD1PlanningDatabase> => {
  const { cause, mutation } = failure;
  const onlyFailures = cause.reasons.length > 0 && cause.reasons.every(Cause.isFailReason);

  if (mutation === undefined) return Effect.failCause(cause);
  if (
    onlyFailures &&
    mutation.isConstraintConflict !== undefined &&
    cause.reasons.every(
      (reason) =>
        Cause.isFailReason(reason) &&
        isMappedConstraintConflict(mutation.isConstraintConflict!, reason.error),
    )
  )
    return Effect.fail(SessionConflict.make({}));
  if (
    onlyFailures &&
    mutation.recoverGuard !== undefined &&
    cause.reasons.every((reason) => Cause.isFailReason(reason) && isGuardFailure(reason.error))
  )
    return mutation.recoverGuard;

  return Effect.failCause(cause);
};

const splitD1BatchFailure = <E>(cause: Cause.Cause<E | D1BatchFailure>) => {
  const marker = cause.reasons.find(
    (reason) => Cause.isFailReason(reason) && reason.error instanceof D1BatchFailure,
  );

  if (marker === undefined || !Cause.isFailReason(marker)) return undefined;
  const remaining = Cause.fromReasons(cause.reasons.filter((reason) => reason !== marker));

  return {
    failure: marker.error as D1BatchFailure,
    // The private marker is removed by identity; every retained reason belongs to E.
    remaining: remaining as Cause.Cause<E>,
  };
};

const recoverD1BatchCause = <E>(
  cause: Cause.Cause<E | D1BatchFailure>,
): Effect.Effect<never, E | D1PlanError | SqlError.SqlError, CurrentD1PlanningDatabase> => {
  const split = splitD1BatchFailure(cause);

  if (split === undefined) {
    // No private marker remains, so this is the original E Cause.
    return Effect.failCause(cause as Cause.Cause<E>);
  }

  return recoverBatchFailure(split.failure).pipe(
    Effect.catchCause((recovered) => Effect.failCause(Cause.combine(recovered, split.remaining))),
  );
};

const recoverCoordinatedD1BatchCause = <E>(
  cause: Cause.Cause<E | D1BatchFailure>,
): Effect.Effect<never, E | D1DomainError, CurrentD1PlanningDatabase> => {
  const split = splitD1BatchFailure(cause);

  if (split === undefined) {
    // No private marker remains, so this is the original E Cause.
    return Effect.failCause(cause as Cause.Cause<E>);
  }

  return terminalD1(recoverBatchFailure(split.failure)).pipe(
    Effect.catchCause((recovered) => Effect.failCause(Cause.combine(recovered, split.remaining))),
  );
};

const statement = (query: { readonly toSQL: () => { sql: string; params: unknown[] } }) =>
  Effect.map(CurrentD1PlanningDatabase, (database) => {
    const rendered = query.toSQL();

    return compactD1GeneratedStatement(
      database.$client,
      database.$client.unsafe(rendered.sql, rendered.params),
      unavailable,
    );
  });

const assertion = (
  condition: SQL,
): Effect.Effect<Statement<any>, never, CurrentD1PlanningDatabase> =>
  Effect.gen(function* () {
    const database = yield* CurrentD1PlanningDatabase;

    return yield* statement(
      database
        .select({
          ok: sql`case when ${condition} then 1 else json_extract('[]', '$[effect-auth-session-guard]') end`.as(
            "ok",
          ),
        })
        .from(sql`(select 1)`),
    );
  });

const conditionMatches = (condition: SQL) =>
  Effect.flatMap(CurrentD1PlanningDatabase, (database) =>
    database
      .select({ ok: sql<number>`1` })
      .from(sql`(select 1)`)
      .where(condition)
      .limit(1)
      .pipe(Effect.map((rows) => rows.length > 0)),
  );

function runPlanned<A, E>(
  plan: Effect.Effect<Planned<A>, E, CurrentD1PlanningDatabase | CurrentCommitJournal>,
): Effect.Effect<
  A,
  NormalizedD1Error<E | HookConfigurationError | SqlError.SqlError>,
  CurrentD1PlanningDatabase | LifecycleHooks
>;
function runPlanned<A, E>(
  plan: Effect.Effect<Planned<A>, E, CurrentD1PlanningDatabase | CurrentCommitJournal>,
  isConstraintConflict: (cause: unknown) => boolean,
): Effect.Effect<
  A,
  NormalizedD1Error<E | SessionConflict | HookConfigurationError | SqlError.SqlError>,
  CurrentD1PlanningDatabase | LifecycleHooks
>;
function runPlanned<A, E, GuardE extends D1PlanError>(
  plan: Effect.Effect<Planned<A>, E, CurrentD1PlanningDatabase | CurrentCommitJournal>,
  isConstraintConflict: undefined,
  recoverGuard: Effect.Effect<never, GuardE, CurrentD1PlanningDatabase>,
): Effect.Effect<
  A,
  NormalizedD1Error<E | GuardE | HookConfigurationError | SqlError.SqlError>,
  CurrentD1PlanningDatabase | LifecycleHooks
>;
function runPlanned<A, E, GuardE extends D1PlanError>(
  plan: Effect.Effect<Planned<A>, E, CurrentD1PlanningDatabase | CurrentCommitJournal>,
  isConstraintConflict: (cause: unknown) => boolean,
  recoverGuard: Effect.Effect<never, GuardE, CurrentD1PlanningDatabase>,
): Effect.Effect<
  A,
  NormalizedD1Error<E | GuardE | SessionConflict | HookConfigurationError | SqlError.SqlError>,
  CurrentD1PlanningDatabase | LifecycleHooks
>;
function runPlanned<A, E, GuardE extends D1PlanError = never>(
  plan: Effect.Effect<Planned<A>, E, CurrentD1PlanningDatabase | CurrentCommitJournal>,
  isConstraintConflict?: (cause: unknown) => boolean,
  recoverGuard?: Effect.Effect<never, GuardE, CurrentD1PlanningDatabase>,
) {
  const planned = plan.pipe(
    Effect.map((value) => ({
      ...value,
      ...(isConstraintConflict === undefined ? {} : { isConstraintConflict }),
      ...(recoverGuard === undefined ? {} : { recoverGuard }),
    })),
  );

  const execution = Effect.gen(function* () {
    const batch = yield* Effect.serviceOption(CurrentD1SessionBatch);

    if (batch._tag === "Some") {
      const owned = batch.value;

      const result = yield* coordinateCommit(
        () =>
          Effect.gen(function* () {
            yield* owned.owner.check;
            const journal = yield* CurrentCommitJournal;
            const value = yield* planned;

            yield* owned.owner.check;
            const guarded = { ...value, journalGuard: journal.prepare(undefined) };

            yield* owned.append(guarded);

            return guarded.receipt;
          }),
        { mode: "batch" },
      );

      return result.value;
    }

    const database = yield* CurrentD1PlanningDatabase;

    const result = yield* coordinateCommit(
      () =>
        Effect.gen(function* () {
          const prepared = yield* planned;

          yield* database.$client
            .batch(prepared.statements)
            .pipe(
              Effect.catchCause((cause) =>
                Effect.fail(new D1BatchFailure({ cause, mutation: prepared })),
              ),
            );

          return prepared.receipt;
        }),
      { mode: "batch" },
    );

    return result.value;
  });

  return normalizeD1Failure(
    execution.pipe(Effect.catchCause(recoverD1BatchCause)),
    isD1DomainError,
  );
}

const subjectColumns = (mapping: any) => ({
  id: column(mapping.subject.table, mapping.subject.id),
  status: column(mapping.subject.table, mapping.subject.status),
  revision: column(mapping.subject.table, mapping.subject.securityRevision),
});

const credentialColumns = (mapping: any) => ({
  subjectId: column(mapping.credential.table, mapping.credential.subjectId),
  id: column(mapping.credential.table, mapping.credential.credentialId),
  revision: column(mapping.credential.table, mapping.credential.revision),
  ...(mapping.credential.status === undefined
    ? {}
    : { status: column(mapping.credential.table, mapping.credential.status) }),
});

const flowColumns = (mapping: any) => ({
  flowId: column(mapping.flow.table, mapping.flow.flowId),
  subjectId: column(mapping.flow.table, mapping.flow.subjectId),
  state: column(mapping.flow.table, mapping.flow.state),
  pendingDigest: column(mapping.flow.table, mapping.flow.pendingDigest),
  dedupUntil: column(mapping.flow.table, mapping.flow.dedupUntil),
});

const hasActiveFlow = Effect.fn("D1Session.hasActiveFlow")(function* (
  mapping: any,
  flowId: string,
) {
  const database = yield* CurrentD1PlanningDatabase;
  const f = flowColumns(mapping);

  return yield* database
    .select({ flowId: f.flowId })
    .from(mapping.flow.table)
    .where(and(eq(f.flowId, flowId), gt(f.dedupUntil, mapping.d1.engineNow)))
    .limit(1)
    .pipe(Effect.map((rows) => rows.length > 0));
});

const recoverFlowOrStale = (
  mapping: any,
  flowId: string,
): Effect.Effect<
  never,
  SessionConflict | StaleAuthentication | D1AdapterFailure,
  CurrentD1PlanningDatabase
> =>
  hasActiveFlow(mapping, flowId).pipe(
    Effect.flatMap((active) =>
      Effect.fail(active ? SessionConflict.make({}) : StaleAuthentication.make({})),
    ),
  );

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

const captureDetails = Effect.fn("DrizzleD1Session.captureDetails")(function* (
  mapping: any,
  subjectId: SubjectId,
  credentialIds: ReadonlyArray<string>,
): Effect.fn.Return<
  { readonly subject: any; readonly revision: AuthenticationRevision },
  StaleAuthentication | D1AdapterFailure,
  CurrentD1PlanningDatabase
> {
  const database = yield* CurrentD1PlanningDatabase;
  const requested = [...new Set(credentialIds)].sort();

  if (requested.length !== credentialIds.length) return yield* stale();
  const nativeSubjectId = yield* mapping.subjectId.toNative(subjectId);
  const sc = subjectColumns(mapping);
  const cc = credentialColumns(mapping);

  const rows: any[] = yield* requested.length === 0
    ? database
        .select({ subject: getTableColumns(mapping.subject.table) })
        .from(mapping.subject.table)
        .where(eq(sc.id, nativeSubjectId))
        .limit(1)
        .pipe(
          Effect.map((selected: any[]) =>
            selected.map((row: any) => ({ subject: row.subject, credential: undefined })),
          ),
        )
    : database
        .select({
          subject: getTableColumns(mapping.subject.table),
          credential: getTableColumns(mapping.credential.table),
        })
        .from(mapping.subject.table)
        .innerJoin(
          mapping.credential.table,
          and(eq(cc.subjectId, sc.id), inArray(cc.id, requested)),
        )
        .where(eq(sc.id, nativeSubjectId));

  const subject = rows[0]?.subject;

  if (subject === undefined || !mapping.subject.isActiveStatus(subject[mapping.subject.status]))
    return yield* stale();

  const credentials = rows.flatMap((row: any) =>
    row.credential === undefined || row.credential === null ? [] : [row.credential],
  );

  if (
    credentials.length !== requested.length ||
    credentials.some(
      (row: any) =>
        mapping.credential.status !== undefined &&
        mapping.credential.isActiveStatus?.(row[mapping.credential.status]) !== true,
    )
  )
    return yield* stale();

  return {
    subject,
    revision: {
      subjectId,
      securityRevision: subject[mapping.subject.securityRevision],
      credentials: credentials
        .map((row: any) => ({
          credentialId: row[mapping.credential.credentialId],
          revision: row[mapping.credential.revision],
        }))
        .sort((a: any, b: any) => a.credentialId.localeCompare(b.credentialId)),
    } satisfies AuthenticationRevision,
  };
});

const capture = Effect.fn("DrizzleD1Session.capture")(function* (
  mapping: any,
  subjectId: SubjectId,
  credentialIds: ReadonlyArray<string>,
): Effect.fn.Return<
  AuthenticationRevision,
  StaleAuthentication | D1AdapterFailure,
  CurrentD1PlanningDatabase
> {
  const details = yield* captureDetails(mapping, subjectId, credentialIds);

  return details.revision;
});

const requirement = Effect.fn("DrizzleD1Session.requirement")(function* (
  mapping: any,
  evidence: AuthenticationEvidence,
): Effect.fn.Return<
  AuthenticationRequirement,
  StaleAuthentication | D1AdapterFailure,
  CurrentD1PlanningDatabase
> {
  const current = yield* captureDetails(
    mapping,
    evidence.revision.subjectId,
    evidence.revision.credentials.map((item) => item.credentialId),
  );

  const expected = new Map(
    evidence.revision.credentials.map((item) => [item.credentialId, item.revision]),
  );

  if (
    current.revision.securityRevision !== evidence.revision.securityRevision ||
    current.revision.credentials.some((item) => expected.get(item.credentialId) !== item.revision)
  )
    return yield* stale();

  return yield* mapping.subject.decodeRequirement(current.subject);
});

const authorityCondition = (
  mapping: any,
  nativeSubjectId: unknown,
  evidence: Pick<AuthenticationEvidence, "revision">,
): SQL => {
  const sc = subjectColumns(mapping);
  const cc = credentialColumns(mapping);
  const subject = sql`exists(select 1 from ${mapping.subject.table} where ${sc.id} = ${sql.param(nativeSubjectId, sc.id)} and ${sc.status} = ${sql.param(mapping.d1.activeSubjectStatusValue, sc.status)} and ${sc.revision} = ${sql.param(evidence.revision.securityRevision, sc.revision)})`;

  const credentials = evidence.revision.credentials.map(
    (item) =>
      sql`exists(select 1 from ${mapping.credential.table} where ${cc.subjectId} = ${sql.param(nativeSubjectId, cc.subjectId)} and ${cc.id} = ${sql.param(item.credentialId, cc.id)} and ${cc.revision} = ${sql.param(item.revision, cc.revision)}${
        mapping.credential.status === undefined
          ? sql``
          : sql` and ${cc.status} = ${sql.param(mapping.d1.activeCredentialStatusValue, cc.status)}`
      })`,
  );

  return and(subject, ...credentials)!;
};

const subjectRevisionCondition = (
  mapping: any,
  nativeSubjectId: unknown,
  revision: SecurityRevision,
) => {
  const sc = subjectColumns(mapping);

  return sql`exists(select 1 from ${mapping.subject.table} where ${sc.id} = ${sql.param(nativeSubjectId, sc.id)} and ${sc.status} = ${sql.param(mapping.d1.activeSubjectStatusValue, sc.status)} and ${sc.revision} = ${sql.param(revision, sc.revision)})`;
};

/** Engine-time counterpart of assessAuthentication. Complete transitions must
 * satisfy an entire alternative; incomplete pending flows need one eligible proof. */
const freshnessCondition = (
  mapping: any,
  evidence: AuthenticationEvidence,
  requirement: AuthenticationRequirement,
  complete: boolean,
): SQL => {
  const fresh = evidence.proofs.map((proof) => {
    const verified = DateTime.toEpochMillis(proof.verifiedAt);

    return and(
      sql`${mapping.d1.engineNowMillis} >= ${verified}`,
      sql`${mapping.d1.engineNowMillis} - ${verified} < ${requirement.maximumAgeMillis}`,
    )!;
  });

  const any = (conditions: ReadonlyArray<SQL>): SQL =>
    conditions.length === 0 ? sql`false` : or(...conditions)!;

  const notFuture = evidence.proofs.map(
    (proof) => sql`${mapping.d1.engineNowMillis} >= ${DateTime.toEpochMillis(proof.verifiedAt)}`,
  );

  if (!complete) return and(...notFuture, any(fresh))!;
  const byCredential = new Map<string, SQL[]>();

  evidence.proofs.forEach((proof, index) => {
    const previous = byCredential.get(proof.credentialId) ?? [];

    previous.push(fresh[index]);
    byCredential.set(proof.credentialId, previous);
  });

  const credentialCount = sql.join(
    [...byCredential.values()].map((proofs) => sql`case when ${any(proofs)} then 1 else 0 end`),
    sql` + `,
  );

  const alternatives = requirement.alternatives.map((alternative) =>
    and(
      ...alternative.factors.map((factor) =>
        any(fresh.filter((_, index) => evidence.proofs[index].factors.includes(factor))),
      ),
      sql`(${credentialCount}) >= ${alternative.minimumCredentials}`,
      any(
        fresh.filter(
          (_, index) =>
            (!alternative.userVerified || evidence.proofs[index].userVerified) &&
            (!alternative.phishingResistant || evidence.proofs[index].phishingResistant),
        ),
      ),
    )!,
  );

  return and(...notFuture, any(alternatives))!;
};

const allocate = <A>(
  asynchronous: Effect.Effect<A, PersistenceMappingError> | undefined,
  synchronous: (() => A) | undefined,
): Effect.Effect<A, D1AdapterFailure | SessionUnavailable> =>
  asynchronous !== undefined
    ? asynchronous
    : synchronous === undefined
      ? Effect.fail(unavailable())
      : Effect.try({
          try: synchronous,
          catch: (cause) => PersistenceMappingError.make({ operation: "allocate", cause }),
        });

const sameOriginalRevision = (
  completed: AuthenticationEvidence,
  original: AuthenticationEvidence,
) => {
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

type PendingProjection = "record" | "context";

const readPendingWith = Effect.fn("D1Session.readPendingWith")(function* <
  Record extends PendingAuthenticationState,
>(
  mapping: any,
  digest: TokenDigest,
  projection: PendingProjection,
): Effect.fn.Return<Record | undefined, D1AdapterFailure, CurrentD1PlanningDatabase> {
  const database = yield* CurrentD1PlanningDatabase;

  const row = (yield* database
    .select()
    .from(mapping.pending.table)
    .where(eq(pendingColumns(mapping).digest, digest))
    .limit(1))[0];

  if (row === undefined) return undefined;

  const decode: (row: any) => Effect.Effect<Record, PersistenceMappingError> =
    projection === "context" ? mapping.pending.decodeContext : mapping.pending.decode;

  return yield* decode(row);
});

const readPending = <Claims>(mapping: any, digest: TokenDigest) =>
  readPendingWith<PendingAuthenticationRecord<Claims>>(mapping, digest, "record");

const pendingCondition = (
  mapping: any,
  input: PendingConsumption,
  nativeSubjectId: unknown,
): SQL => {
  const p = pendingColumns(mapping);
  const f = flowColumns(mapping);

  return and(
    sql`exists(select 1 from ${mapping.pending.table} where ${p.digest} = ${sql.param(input.digest, p.digest)} and ${p.version} = ${sql.param(input.version, p.version)} and ${p.flowId} = ${sql.param(input.flowId, p.flowId)} and ${p.subjectId} = ${sql.param(nativeSubjectId, p.subjectId)} and ${p.bindingDigest} = ${sql.param(input.bindingDigest, p.bindingDigest)} and ${p.consumed} = ${sql.param(false, p.consumed)} and ${p.failedAttempts} < ${p.attemptLimit} and ${p.expiresAt} > ${mapping.d1.engineNow})`,
    sql`exists(select 1 from ${mapping.flow.table} where ${f.flowId} = ${sql.param(input.flowId, f.flowId)} and ${f.subjectId} = ${sql.param(nativeSubjectId, f.subjectId)} and ${f.state} = ${sql.param(mapping.flow.pendingStateValue, f.state)} and ${f.pendingDigest} = ${sql.param(input.digest, f.pendingDigest)} and ${f.dedupUntil} > ${mapping.d1.engineNow})`,
  )!;
};

const recoverPendingOrStale = (
  mapping: any,
  input: PendingConsumption,
  subjectId: SubjectId,
): Effect.Effect<
  never,
  PendingAuthenticationInvalid | StaleAuthentication | D1AdapterFailure,
  CurrentD1PlanningDatabase
> =>
  mapping.subjectId.toNative(subjectId).pipe(
    Effect.flatMap((nativeSubjectId: unknown) =>
      conditionMatches(pendingCondition(mapping, input, nativeSubjectId)),
    ),
    Effect.flatMap((pendingIsCurrent) =>
      Effect.fail(
        pendingIsCurrent ? StaleAuthentication.make({}) : PendingAuthenticationInvalid.make({}),
      ),
    ),
  );

const consumePendingStatements = Effect.fn("D1Session.consumePendingStatements")(function* (
  mapping: any,
  input: PendingConsumption,
  absoluteExpiresAt: DateTime.Utc,
): Effect.fn.Return<ReadonlyArray<Statement<any>>, never, CurrentD1PlanningDatabase> {
  const database = yield* CurrentD1PlanningDatabase;

  return [
    yield* statement(
      database
        .update(mapping.pending.table)
        .set(updateValues<any>([[mapping.pending.consumed, true]]))
        .where(
          and(
            eq(pendingColumns(mapping).digest, input.digest),
            eq(pendingColumns(mapping).version, input.version),
          ),
        ),
    ),
    yield* statement(
      database
        .update(mapping.flow.table)
        .set(
          updateValues<any>([
            [mapping.flow.state, mapping.flow.establishedStateValue],
            [mapping.flow.pendingDigest, null],
            [mapping.flow.dedupUntil, mapping.flow.encodeInstant(absoluteExpiresAt)],
          ]),
        )
        .where(eq(flowColumns(mapping).flowId, input.flowId)),
    ),
  ];
});

export const makeD1AuthenticationAuthority = <Claims>(
  mapping: D1AuthenticationAuthorityMapping<Claims, any, any, any, any, any>,
) => ({
  capture: (
    subjectId: Parameters<AuthenticationAuthority["Service"]["capture"]>[0],
    credentialIds: Parameters<AuthenticationAuthority["Service"]["capture"]>[1],
  ) => capture(mapping, subjectId, credentialIds).pipe(terminalD1),
  requirements: (evidence: AuthenticationEvidence) =>
    requirement(mapping, evidence).pipe(terminalD1),
  approve: <A>(
    input: Parameters<AuthenticationAuthority["Service"]["approve"]>[0],
    prepare: PrepareSessionCommit<void, A>,
  ) =>
    runPlanned(
      Effect.gen(function* () {
        const journal = yield* CurrentCommitJournal;
        const policy = yield* requirement(mapping, input.evidence);
        const assessed = yield* assessAuthentication(input.evidence, policy);

        if (!assessed.satisfied) return yield* stale();

        const nativeSubjectId = yield* mapping.subjectId.toNative(
          input.evidence.revision.subjectId,
        );

        let condition = and(
          authorityCondition(mapping, nativeSubjectId, input.evidence),
          freshnessCondition(mapping, input.evidence, policy, true),
          sql`${mapping.d1.engineNowMillis} < ${DateTime.toEpochMillis(input.expiresAt)}`,
          sql`${DateTime.toEpochMillis(input.expiresAt)} <= ${DateTime.toEpochMillis(input.absoluteExpiresAt)}`,
        )!;

        const statements: Statement<any>[] = [];

        if (input.pending !== undefined) {
          if (mapping.pending === undefined) return yield* invalidPending();
          const pendingMapping = { ...mapping, ...mapping.pending };
          const stored = yield* readPending(pendingMapping, input.pending.digest);

          if (stored === undefined || !sameOriginalRevision(input.evidence, stored.evidence))
            return yield* invalidPending();
          condition = and(
            condition,
            pendingCondition(pendingMapping, input.pending, nativeSubjectId),
          )!;
          statements.push(
            ...(yield* consumePendingStatements(
              pendingMapping,
              input.pending,
              input.absoluteExpiresAt,
            )),
          );
        }
        const receipt = prepare(undefined, journal);

        return { receipt, statements: [yield* assertion(condition), ...statements] };
      }),
      undefined,
      Effect.suspend(() =>
        input.pending === undefined || mapping.pending === undefined
          ? Effect.fail(stale())
          : recoverPendingOrStale(
              { ...mapping, ...mapping.pending },
              input.pending,
              input.evidence.revision.subjectId,
            ),
      ),
    ),
});

/** D1's last authoritative statement checks the original record version and
 * security state together. A later race is still rejected by final consumption. */
const readAuthenticatedPending = Effect.fn("D1Session.readAuthenticatedPending")(function* <
  Record extends PendingAuthenticationState,
>(
  mapping: any,
  input: { readonly digest: TokenDigest; readonly bindingDigest?: TokenDigest },
  projection: PendingProjection,
): Effect.fn.Return<
  Record,
  PendingAuthenticationInvalid | D1AdapterFailure,
  CurrentD1PlanningDatabase
> {
  const record = yield* readPendingWith<Record>(mapping, input.digest, projection);

  if (
    record === undefined ||
    (input.bindingDigest !== undefined && record.evidence.bindingDigest !== input.bindingDigest)
  )
    return yield* invalidPending();

  const policy = yield* mapFailureCause(requirement(mapping, record.evidence), (error) =>
    error._tag === "StaleAuthentication" ? invalidPending() : error,
  );

  yield* assessAuthentication(record.evidence, policy).pipe(
    Effect.mapError(() => invalidPending()),
  );
  const nativeSubjectId = yield* mapping.subjectId.toNative(record.evidence.revision.subjectId);

  const current = yield* conditionMatches(
    and(
      authorityCondition(mapping, nativeSubjectId, record.evidence),
      freshnessCondition(mapping, record.evidence, policy, false),
      pendingCondition(
        mapping,
        {
          digest: input.digest,
          bindingDigest: record.evidence.bindingDigest,
          flowId: record.evidence.flowId,
          version: record.version,
        },
        nativeSubjectId,
      ),
    )!,
  );

  if (!current) return yield* invalidPending();

  return record;
});

export const makeD1PendingAuthentication = <Claims>(
  mapping: D1PendingAuthenticationMapping<Claims, any, any, any, any, any>,
) => ({
  create: <A>(
    input: Parameters<PendingAuthentication<Claims>["create"]>[0],
    _now: DateTime.Utc,
    prepare: PrepareSessionCommit<PendingAuthenticationRecord<Claims>, A>,
  ) =>
    runPlanned(
      Effect.gen(function* () {
        const database = yield* CurrentD1PlanningDatabase;
        const journal = yield* CurrentCommitJournal;
        const policy = yield* requirement(mapping, input.evidence);

        yield* assessAuthentication(input.evidence, policy);

        const nativeSubjectId = yield* mapping.subjectId.toNative(
          input.evidence.revision.subjectId,
        );

        if (yield* hasActiveFlow(mapping, input.evidence.flowId))
          return yield* SessionConflict.make({});

        const version = yield* allocate(
          mapping.pending.allocateVersion,
          mapping.pending.allocateVersionSync,
        );

        const record = { ...input, version };
        const f = flowColumns(mapping);

        const condition = and(
          authorityCondition(mapping, nativeSubjectId, input.evidence),
          freshnessCondition(mapping, input.evidence, policy, false),
          sql`${mapping.d1.engineNowMillis} < ${DateTime.toEpochMillis(input.expiresAt)}`,
          not(
            sql`exists(select 1 from ${mapping.flow.table} where ${f.flowId} = ${sql.param(input.evidence.flowId, f.flowId)} and ${f.dedupUntil} > ${mapping.d1.engineNow})`,
          ),
        )!;

        const cleanupPending = database
          .delete(mapping.pending.table)
          .where(
            sql`${pendingColumns(mapping).flowId} in (select ${f.flowId} from ${mapping.flow.table} where ${f.flowId} = ${sql.param(input.evidence.flowId, f.flowId)} and ${f.dedupUntil} <= ${mapping.d1.engineNow})`,
          );

        const cleanupFlow = database
          .delete(mapping.flow.table)
          .where(
            and(
              eq(f.flowId, input.evidence.flowId),
              sql`${f.dedupUntil} <= ${mapping.d1.engineNow}`,
            ),
          );

        const insertFlow = database.insert(mapping.flow.table).values(
          mapping.flow.encodePendingInsert({
            evidence: input.evidence,
            subjectId: nativeSubjectId,
            pendingDigest: input.digest,
            dedupUntil: input.expiresAt,
          }),
        );

        const insertPending = database.insert(mapping.pending.table).values(
          mapping.pending.encodeInsert(record, {
            subjectId: nativeSubjectId,
            failedAttempts: 0,
            consumed: false,
          }),
        );

        const receipt = prepare(record, journal);

        return {
          receipt,
          statements: [
            yield* assertion(condition),
            yield* statement(cleanupPending),
            yield* statement(cleanupFlow),
            yield* statement(insertFlow),
            yield* statement(insertPending),
          ],
        };
      }),
      mapping.isConstraintConflict,
      recoverFlowOrStale(mapping, input.evidence.flowId),
    ),
  context: (input: Parameters<PendingAuthentication<Claims>["context"]>[0]) =>
    readAuthenticatedPending<PendingAuthenticationState>(mapping, input, "context").pipe(
      Effect.flatMap(pendingAuthenticationContext),
      terminalD1,
    ),
  read: (input: Parameters<PendingAuthentication<Claims>["read"]>[0]) =>
    readAuthenticatedPending<PendingAuthenticationRecord<Claims>>(mapping, input, "record").pipe(
      terminalD1,
    ),
  reject: <A>(
    input: Parameters<PendingAuthentication<Claims>["reject"]>[0],
    prepare: PrepareSessionCommit<{ readonly _tag: "Rejected" }, A>,
  ) =>
    runPlanned(
      Effect.gen(function* () {
        const database = yield* CurrentD1PlanningDatabase;
        const journal = yield* CurrentCommitJournal;

        const record = yield* readPendingWith<PendingAuthenticationState>(
          mapping,
          input.digest,
          "context",
        );

        if (record === undefined)
          return {
            receipt: prepare({ _tag: "Rejected" }, journal),
            statements: [yield* assertion(sql`true`)],
          };

        const nativeSubjectId = yield* mapping.subjectId.toNative(
          record.evidence.revision.subjectId,
        );

        const p = pendingColumns(mapping);

        const condition = and(
          authorityCondition(mapping, nativeSubjectId, record.evidence),
          eq(p.digest, input.digest),
          eq(p.bindingDigest, input.bindingDigest),
          eq(p.consumed, false),
          gt(p.expiresAt, mapping.d1.engineNow),
        )!;

        const update = database
          .update(mapping.pending.table)
          .set(
            updateValues<any>([
              [
                mapping.pending.failedAttempts,
                sql`case when ${p.failedAttempts} < ${p.attemptLimit} then ${p.failedAttempts} + 1 else ${p.failedAttempts} end`,
              ],
            ]),
          )
          .where(condition);

        const receipt = prepare({ _tag: "Rejected" }, journal);

        return { receipt, statements: [yield* statement(update)] };
      }),
    ),
});

export const makeD1StatefulSessions = <Claims>(
  mapping: D1StatefulSessionMapping<Claims, any, any, any, any, any, any, any>,
) => {
  const s = sessionColumns(mapping);

  const persistence = {
    establish: <A>(
      input: Parameters<StatefulSessionPersistence<Claims>["establish"]>[0],
      prepare: PrepareSessionCommit<
        PreparedValue<StatefulSessionPersistence<Claims>["establish"]>,
        A
      >,
    ) =>
      runPlanned(
        Effect.gen(function* () {
          const database = yield* CurrentD1PlanningDatabase;
          const journal = yield* CurrentCommitJournal;
          const policy = yield* requirement(mapping, input.evidence);
          const assessed = yield* assessAuthentication(input.evidence, policy);

          if (!assessed.satisfied) return yield* stale();

          const nativeSubjectId = yield* mapping.subjectId.toNative(
            input.evidence.revision.subjectId,
          );

          if (input.pending === undefined && (yield* hasActiveFlow(mapping, input.evidence.flowId)))
            return yield* SessionConflict.make({});

          const nativeSessionId = yield* allocate(
            mapping.session.allocateId,
            mapping.session.allocateIdSync,
          );

          const sessionId = yield* mapping.sessionId.toSession(nativeSessionId);

          if (sessionId === input.handoffSourceSessionId) return yield* SessionConflict.make({});

          const version = yield* allocate(
            mapping.session.allocateVersion,
            mapping.session.allocateVersionSync,
          );

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
            // Ordered D1 batches cannot expose the engine timestamp to the
            // prepare callback. Persist the core's trusted planned time and
            // guard it against the engine clock in the final batch.
            issuedAt: DateTime.makeUnsafe(DateTime.toEpochMillis(input.session.issuedAt)),
          };

          const commitCondition = and(
            authorityCondition(mapping, nativeSubjectId, input.evidence),
            freshnessCondition(mapping, input.evidence, policy, true),
            sql`${DateTime.toEpochMillis(record.issuedAt)} <= ${mapping.d1.engineNowMillis}`,
            sql`${mapping.d1.engineNowMillis} < ${DateTime.toEpochMillis(record.expiresAt)}`,
            sql`${DateTime.toEpochMillis(record.expiresAt)} <= ${DateTime.toEpochMillis(record.absoluteExpiresAt)}`,
          )!;

          let condition = commitCondition;
          const statements: Statement<any>[] = [];

          if (input.pending === undefined) {
            const f = flowColumns(mapping);

            condition = and(
              condition,
              not(
                sql`exists(select 1 from ${mapping.flow.table} where ${f.flowId} = ${sql.param(input.evidence.flowId, f.flowId)} and ${f.dedupUntil} > ${mapping.d1.engineNow})`,
              ),
            )!;
            if (mapping.pending !== undefined)
              statements.push(
                yield* statement(
                  database
                    .delete(mapping.pending.table)
                    .where(
                      eq(
                        column(mapping.pending.table, mapping.pending.flowId),
                        input.evidence.flowId,
                      ),
                    ),
                ),
              );
            statements.push(
              yield* statement(
                database.delete(mapping.flow.table).where(eq(f.flowId, input.evidence.flowId)),
              ),
              yield* statement(
                database.insert(mapping.flow.table).values(
                  mapping.flow.encodeEstablishedInsert({
                    evidence: input.evidence,
                    subjectId: nativeSubjectId,
                    dedupUntil: record.absoluteExpiresAt,
                  }),
                ),
              ),
            );
          } else {
            if (mapping.pending === undefined) return yield* invalidPending();
            const stored = yield* readPending(mapping, input.pending.digest);

            if (stored === undefined || !sameOriginalRevision(input.evidence, stored.evidence))
              return yield* invalidPending();
            condition = and(condition, pendingCondition(mapping, input.pending, nativeSubjectId))!;
            statements.push(
              ...(yield* consumePendingStatements(
                mapping,
                input.pending,
                record.absoluteExpiresAt,
              )),
            );
          }
          statements.push(
            yield* statement(
              database.insert(mapping.session.table).values(
                mapping.session.encodeInsert(record, {
                  subjectId: nativeSubjectId,
                  sessionId: nativeSessionId,
                }),
              ),
            ),
            // Recheck after insertion as well as admission; the capped source
            // expiry and proof freshness must still hold at the final batch step.
            yield* assertion(commitCondition),
          );
          const receipt = prepare(record, journal);

          return { receipt, statements: [yield* assertion(condition), ...statements] };
        }),
        mapping.isConstraintConflict,
        Effect.suspend<
          never,
          SessionConflict | PendingAuthenticationInvalid | StaleAuthentication | D1AdapterFailure,
          CurrentD1PlanningDatabase
        >(() =>
          input.pending === undefined
            ? recoverFlowOrStale(mapping, input.evidence.flowId)
            : recoverPendingOrStale(mapping, input.pending, input.evidence.revision.subjectId),
        ),
      ),
    verify: (input: Parameters<StatefulSessionPersistence<Claims>["verify"]>[0]) =>
      Effect.gen(function* () {
        const database = yield* CurrentD1PlanningDatabase;

        const rows = yield* database
          .select({ ...getTableColumns(mapping.session.table) })
          .from(mapping.session.table)
          .innerJoin(
            mapping.subject.table,
            and(
              eq(s.subjectId, subjectColumns(mapping).id),
              eq(s.securityRevision, subjectColumns(mapping).revision),
              eq(subjectColumns(mapping).status, mapping.d1.activeSubjectStatusValue),
            ),
          )
          .where(
            and(
              eq(s.digest, input.digest),
              gt(s.expiresAt, mapping.d1.engineNow),
              gt(s.absoluteExpiresAt, mapping.d1.engineNow),
            ),
          )
          .limit(1);

        if (rows[0] === undefined) return yield* invalidSession();

        return yield* mapping.session.decode(rows[0]);
      }).pipe(terminalD1),
    rotate: <A>(
      input: Parameters<StatefulSessionPersistence<Claims>["rotate"]>[0],
      prepare: PrepareSessionCommit<PreparedValue<StatefulSessionPersistence<Claims>["rotate"]>, A>,
    ) =>
      runPlanned(
        Effect.gen(function* () {
          const database = yield* CurrentD1PlanningDatabase;
          const journal = yield* CurrentCommitJournal;
          const nativeSessionId = yield* mapping.sessionId.toNative(input.sessionId);

          const row = (yield* database
            .select()
            .from(mapping.session.table)
            .where(eq(s.sessionId, nativeSessionId))
            .limit(1))[0];

          if (row === undefined) return yield* SessionConflict.make({});
          const current = yield* mapping.session.decode(row);
          const nativeSubjectId = yield* mapping.subjectId.toNative(current.subjectId);

          const version = yield* allocate(
            mapping.session.allocateVersion,
            mapping.session.allocateVersionSync,
          );

          const next = {
            ...current,
            digest: input.nextDigest,
            credentialVersion: input.nextCredentialVersion,
            version,
            issuedAt: DateTime.makeUnsafe(DateTime.toEpochMillis(input.now)),
            expiresAt: input.nextExpiresAt,
          };

          const sessionCondition = and(
            eq(s.sessionId, nativeSessionId),
            eq(s.digest, input.expectedDigest),
            eq(s.version, input.expectedVersion),
            eq(s.securityRevision, input.expectedSecurityRevision),
            gt(s.expiresAt, mapping.d1.engineNow),
            gt(s.absoluteExpiresAt, mapping.d1.engineNow),
          )!;

          const timeCondition = and(
            sql`${DateTime.toEpochMillis(next.issuedAt)} <= ${mapping.d1.engineNowMillis}`,
            sql`${mapping.d1.engineNowMillis} < ${DateTime.toEpochMillis(input.nextExpiresAt)}`,
            sql`${DateTime.toEpochMillis(input.nextExpiresAt)} <= ${DateTime.toEpochMillis(current.absoluteExpiresAt)}`,
          )!;

          const authority = subjectRevisionCondition(
            mapping,
            nativeSubjectId,
            input.expectedSecurityRevision,
          );

          const assertionCondition = and(
            authority,
            sql`exists(select 1 from ${mapping.session.table} where ${sessionCondition})`,
            timeCondition,
          )!;

          const update = database
            .update(mapping.session.table)
            .set(mapping.session.encodeRotation(next))
            .where(and(authority, sessionCondition, timeCondition));

          const receipt = prepare(next, journal);

          return {
            receipt,
            statements: [yield* assertion(assertionCondition), yield* statement(update)],
          };
        }),
        undefined,
        Effect.fail(SessionConflict.make({})),
      ),
    revokeDigest: <A>(
      digest: Parameters<StatefulSessionPersistence<Claims>["revokeDigest"]>[0],
      prepare: PrepareSessionCommit<boolean, A>,
    ) =>
      runPlanned(
        Effect.gen(function* () {
          const database = yield* CurrentD1PlanningDatabase;
          const journal = yield* CurrentCommitJournal;

          const row = (yield* database
            .select()
            .from(mapping.session.table)
            .where(eq(s.digest, digest))
            .limit(1))[0];

          const statements =
            row === undefined
              ? [yield* assertion(sql`true`)]
              : [
                  yield* statement(
                    database.delete(mapping.session.table).where(eq(s.digest, digest)),
                  ),
                ];

          return { receipt: prepare(row !== undefined, journal), statements };
        }),
      ),
    revoke: <A>(
      input: Parameters<StatefulSessionPersistence<Claims>["revoke"]>[0],
      prepare: PrepareSessionCommit<void, A>,
    ) =>
      runPlanned(
        Effect.gen(function* () {
          const database = yield* CurrentD1PlanningDatabase;
          const journal = yield* CurrentCommitJournal;
          const nativeSubjectId = yield* mapping.subjectId.toNative(input.subjectId);
          const nativeSessionId = yield* mapping.sessionId.toNative(input.sessionId);

          const condition = subjectRevisionCondition(
            mapping,
            nativeSubjectId,
            input.expectedSecurityRevision,
          );

          const remove = database
            .delete(mapping.session.table)
            .where(and(eq(s.subjectId, nativeSubjectId), eq(s.sessionId, nativeSessionId)));

          const receipt = prepare(undefined, journal);

          return {
            receipt,
            statements: [yield* assertion(condition), yield* statement(remove)],
          };
        }),
        undefined,
        Effect.fail(stale()),
      ),
    revokeAll: <A>(
      input: Parameters<StatefulSessionPersistence<Claims>["revokeAll"]>[0],
      prepare: PrepareSessionCommit<void, A>,
    ) =>
      runPlanned(
        Effect.gen(function* () {
          const database = yield* CurrentD1PlanningDatabase;
          const journal = yield* CurrentCommitJournal;
          const nativeSubjectId = yield* mapping.subjectId.toNative(input.subjectId);

          const next = yield* allocate(
            mapping.subject.nextSecurityRevision?.(input.expectedSecurityRevision),
            mapping.subject.nextSecurityRevisionSync === undefined
              ? undefined
              : () => mapping.subject.nextSecurityRevisionSync!(input.expectedSecurityRevision),
          );

          const sc = subjectColumns(mapping);

          const condition = and(
            eq(sc.id, nativeSubjectId),
            eq(sc.status, mapping.d1.activeSubjectStatusValue),
            eq(sc.revision, input.expectedSecurityRevision),
          )!;

          const updateSubject = database
            .update(mapping.subject.table)
            .set(updateValues<any>([[mapping.subject.securityRevision, next]]))
            .where(condition);

          const removeSessions = database
            .delete(mapping.session.table)
            .where(eq(s.subjectId, nativeSubjectId));

          const receipt = prepare(undefined, journal);

          return {
            receipt,
            statements: [
              yield* assertion(
                sql`exists(select 1 from ${mapping.subject.table} where ${condition})`,
              ),
              yield* statement(updateSubject),
              yield* statement(removeSessions),
            ],
          };
        }),
        undefined,
        Effect.fail(stale()),
      ),
  };

  const repository = {
    list: (input: Parameters<SessionRepository["list"]>[0]) =>
      Effect.gen(function* () {
        const database = yield* CurrentD1PlanningDatabase;
        const nativeSubjectId = yield* mapping.subjectId.toNative(input.subjectId);

        const cursor =
          input.cursor === undefined
            ? undefined
            : yield* mapping.sessionId.toNative(input.cursor as any);

        const rows = yield* database
          .select({ ...getTableColumns(mapping.session.table) })
          .from(mapping.session.table)
          .innerJoin(
            mapping.subject.table,
            and(
              eq(s.subjectId, subjectColumns(mapping).id),
              eq(s.securityRevision, subjectColumns(mapping).revision),
              eq(subjectColumns(mapping).status, mapping.d1.activeSubjectStatusValue),
            ),
          )
          .where(
            and(
              eq(s.subjectId, nativeSubjectId),
              gt(s.expiresAt, mapping.d1.engineNow),
              gt(s.absoluteExpiresAt, mapping.d1.engineNow),
              cursor === undefined ? undefined : gt(s.sessionId, cursor),
            ),
          )
          .orderBy(s.sessionId)
          .limit(input.limit + 1);

        const decoded = yield* Effect.forEach(rows, (row) => mapping.session.decode(row));
        const codec = Schema.toCodecJson(Schema.toType(SessionMetadata));

        const sessions = yield* Effect.forEach(decoded.slice(0, input.limit), (record) =>
          Schema.encodeEffect(codec)(record).pipe(Effect.flatMap(Schema.decodeEffect(codec))),
        );

        const nextCursor = decoded.length <= input.limit ? undefined : sessions.at(-1)?.sessionId;

        return {
          sessions,
          ...(nextCursor === undefined ? {} : { nextCursor }),
        };
      }).pipe(terminalD1),
  };

  return { persistence, repository };
};

export const makeD1SignedValidity = (
  mapping: D1SignedSessionValidityMapping<any, any, any, any>,
) => {
  const sc = subjectColumns(mapping);

  const t = {
    subjectId: column(mapping.tombstone.table, mapping.tombstone.subjectId),
    sessionId: column(mapping.tombstone.table, mapping.tombstone.sessionId),
    absoluteExpiresAt: column(mapping.tombstone.table, mapping.tombstone.absoluteExpiresAt),
  };

  return {
    verify: (session: Parameters<SignedSessionValidity["verify"]>[0], _now: DateTime.Utc) =>
      Effect.gen(function* () {
        const database = yield* CurrentD1PlanningDatabase;
        const nativeSubjectId = yield* mapping.subjectId.toNative(session.subjectId);
        const nativeSessionId = yield* mapping.sessionId.toNative(session.sessionId);

        const rows = yield* database
          .select({ subjectId: sc.id })
          .from(mapping.subject.table)
          .where(
            and(
              eq(sc.id, nativeSubjectId),
              eq(sc.status, mapping.d1.activeSubjectStatusValue),
              eq(sc.revision, session.securityRevision),
              sql`${mapping.d1.engineNowMillis} < ${DateTime.toEpochMillis(session.expiresAt)}`,
              sql`${mapping.d1.engineNowMillis} < ${DateTime.toEpochMillis(session.absoluteExpiresAt)}`,
              not(
                sql`exists(select 1 from ${mapping.tombstone.table} where ${t.subjectId} = ${sql.param(nativeSubjectId, t.subjectId)} and ${t.sessionId} = ${sql.param(nativeSessionId, t.sessionId)} and ${t.absoluteExpiresAt} > ${mapping.d1.engineNow})`,
              ),
            ),
          )
          .limit(1);

        if (rows.length === 0) return yield* invalidSession();
      }).pipe(terminalD1),
    revoke: <A>(
      input: Parameters<SignedSessionValidity["revoke"]>[0],
      prepare: PrepareSessionCommit<void, A>,
    ) =>
      runPlanned(
        Effect.gen(function* () {
          const database = yield* CurrentD1PlanningDatabase;
          const journal = yield* CurrentCommitJournal;
          const nativeSubjectId = yield* mapping.subjectId.toNative(input.subjectId);
          const nativeSessionId = yield* mapping.sessionId.toNative(input.sessionId);
          const condition = sql`exists(select 1 from ${mapping.subject.table} where ${sc.id} = ${sql.param(nativeSubjectId, sc.id)} and ${sc.status} = ${sql.param(mapping.d1.activeSubjectStatusValue, sc.status)} and ${sc.revision} = ${sql.param(input.expectedSecurityRevision, sc.revision)})`;
          const encodedExpiry = mapping.tombstone.encodeInstant(input.absoluteExpiresAt);
          const desiredExpiry = sql.param(encodedExpiry, t.absoluteExpiresAt);

          const write = database
            .insert(mapping.tombstone.table)
            .values(
              mapping.tombstone.encodeInsert({
                subjectId: nativeSubjectId,
                sessionId: nativeSessionId,
                absoluteExpiresAt: input.absoluteExpiresAt,
              }),
            )
            .onConflictDoUpdate({
              target: [t.subjectId, t.sessionId],
              set: updateValues<any>([
                [
                  mapping.tombstone.absoluteExpiresAt,
                  sql`case when ${t.absoluteExpiresAt} < ${desiredExpiry} then ${desiredExpiry} else ${t.absoluteExpiresAt} end`,
                ],
              ]),
            });

          const receipt = prepare(undefined, journal);

          return {
            receipt,
            statements: [yield* assertion(condition), yield* statement(write)],
          };
        }),
        undefined,
        Effect.fail(stale()),
      ),
    revokeAll: <A>(
      input: Parameters<SignedSessionValidity["revokeAll"]>[0],
      prepare: PrepareSessionCommit<void, A>,
    ) =>
      runPlanned(
        Effect.gen(function* () {
          const database = yield* CurrentD1PlanningDatabase;
          const journal = yield* CurrentCommitJournal;
          const nativeSubjectId = yield* mapping.subjectId.toNative(input.subjectId);

          const next = yield* allocate(
            mapping.subject.nextSecurityRevision?.(input.expectedSecurityRevision),
            mapping.subject.nextSecurityRevisionSync === undefined
              ? undefined
              : () => mapping.subject.nextSecurityRevisionSync!(input.expectedSecurityRevision),
          );

          const condition = and(
            eq(sc.id, nativeSubjectId),
            eq(sc.status, mapping.d1.activeSubjectStatusValue),
            eq(sc.revision, input.expectedSecurityRevision),
          )!;

          const updateSubject = database
            .update(mapping.subject.table)
            .set(updateValues<any>([[mapping.subject.securityRevision, next]]))
            .where(condition);

          const receipt = prepare(undefined, journal);

          return {
            receipt,
            statements: [
              yield* assertion(
                sql`exists(select 1 from ${mapping.subject.table} where ${condition})`,
              ),
              yield* statement(updateSubject),
            ],
          };
        }),
        undefined,
        Effect.fail(stale()),
      ),
  };
};

export const makeD1SessionServiceEffects = {
  authority: <Claims>(mapping: any) =>
    Effect.gen(function* () {
      const database = yield* CurrentD1PlanningDatabase;

      yield* validateDrizzleStorage(mapping).pipe(Effect.mapError(unavailable));
      const hooks = yield* LifecycleHooks;
      const raw = makeD1AuthenticationAuthority<Claims>(mapping);

      const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          if (
            (yield* Effect.serviceOption(CurrentD1SessionBatch))._tag === "Some" ||
            (yield* hasCommitScope)
          )
            return yield* unavailable();

          return yield* effect.pipe(
            Effect.provideService(CurrentD1PlanningDatabase, database),
            Effect.provideService(LifecycleHooks, hooks),
          );
        });

      const authenticationAuthority: AuthenticationAuthority["Service"] = {
        capture: (subjectId, credentialIds) => run(raw.capture(subjectId, credentialIds)),
        requirements: (evidence) => run(raw.requirements(evidence)),
        approve: (input, prepare) => run(raw.approve(input, prepare)),
      };

      return { authenticationAuthority };
    }),
  pending: <Claims>(mapping: any) =>
    Effect.gen(function* () {
      const database = yield* CurrentD1PlanningDatabase;

      yield* validateDrizzleStorage(mapping).pipe(Effect.mapError(unavailable));
      const hooks = yield* LifecycleHooks;
      const raw = makeD1PendingAuthentication<Claims>(mapping);

      const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          if (
            (yield* Effect.serviceOption(CurrentD1SessionBatch))._tag === "Some" ||
            (yield* hasCommitScope)
          )
            return yield* unavailable();

          return yield* effect.pipe(
            Effect.provideService(CurrentD1PlanningDatabase, database),
            Effect.provideService(LifecycleHooks, hooks),
          );
        });

      const pendingAuthentication: PendingAuthentication<Claims> = {
        create: (input, now, prepare) => run(raw.create(input, now, prepare)),
        context: (input) => run(raw.context(input)),
        read: (input) => run(raw.read(input)),
        reject: (input, prepare) => run(raw.reject(input, prepare)),
      };

      return { pendingAuthentication };
    }),
  stateful: <Claims>(mapping: any) =>
    Effect.gen(function* () {
      const database = yield* CurrentD1PlanningDatabase;

      yield* validateDrizzleStorage(mapping).pipe(Effect.mapError(unavailable));
      const hooks = yield* LifecycleHooks;
      const raw = makeD1StatefulSessions<Claims>(mapping);

      const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          if (
            (yield* Effect.serviceOption(CurrentD1SessionBatch))._tag === "Some" ||
            (yield* hasCommitScope)
          )
            return yield* unavailable();

          return yield* effect.pipe(
            Effect.provideService(CurrentD1PlanningDatabase, database),
            Effect.provideService(LifecycleHooks, hooks),
          );
        });

      const statefulSessionPersistence: StatefulSessionPersistence<Claims> = {
        establish: (input, prepare) => run(raw.persistence.establish(input, prepare)),
        verify: (input) => run(raw.persistence.verify(input)),
        rotate: (input, prepare) => run(raw.persistence.rotate(input, prepare)),
        revokeDigest: (digest, prepare) => run(raw.persistence.revokeDigest(digest, prepare)),
        revoke: (input, prepare) => run(raw.persistence.revoke(input, prepare)),
        revokeAll: (input, prepare) => run(raw.persistence.revokeAll(input, prepare)),
      };

      const sessionRepository: SessionRepository = {
        list: (input) => run(raw.repository.list(input)),
      };

      return { statefulSessionPersistence, sessionRepository };
    }),
  validity: (mapping: any) =>
    Effect.gen(function* () {
      const database = yield* CurrentD1PlanningDatabase;

      yield* validateDrizzleStorage(mapping).pipe(Effect.mapError(unavailable));
      const hooks = yield* LifecycleHooks;
      const raw = makeD1SignedValidity(mapping);

      const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          if (
            (yield* Effect.serviceOption(CurrentD1SessionBatch))._tag === "Some" ||
            (yield* hasCommitScope)
          )
            return yield* unavailable();

          return yield* effect.pipe(
            Effect.provideService(CurrentD1PlanningDatabase, database),
            Effect.provideService(LifecycleHooks, hooks),
          );
        });

      const signedSessionValidity: SignedSessionValidity = {
        verify: (session, now) => run(raw.verify(session, now)),
        revoke: (input, prepare) => run(raw.revoke(input, prepare)),
        revokeAll: (input, prepare) => run(raw.revokeAll(input, prepare)),
      };

      return { signedSessionValidity };
    }),
};

type D1CoordinatorError<E> = E | D1DomainError | HookConfigurationError;

/**
 * Owns one atomic D1 persistence transition together with any number of
 * application statements appended by `owner`. Keeping one persistence
 * transition makes a failed batch's domain guard recoverable without exposing
 * a prepared value. Compose additional transitions in later root batches.
 * Interruption or owner failure before `$client.batch` discards the journal;
 * the adapter performs no hidden retry and a retry must re-plan the whole owner.
 * Caller failures remain in the error channel. D1 batch/transport failures that
 * cannot be tied to this adapter's reserved guard become `SessionUnavailable`.
 */
export const coordinateD1SessionBatch = <Services, A, E, R>(
  database: Database,
  mapping: unknown,
  make: (batch: D1SessionBatch) => Effect.Effect<Services, never, LifecycleHooks>,
  owner: (services: Services, batch: D1SessionBatch) => Effect.Effect<A, E, R>,
): Effect.Effect<A, D1CoordinatorError<E>, R | LifecycleHooks | NativeDatabase> =>
  Effect.gen(function* (): Effect.fn.Return<
    A,
    D1CoordinatorError<E>,
    R | LifecycleHooks | NativeDatabase
  > {
    if (yield* hasCommitScope) return yield* unavailable();

    yield* validateDrizzleStorage(mapping).pipe(Effect.mapError(unavailable));

    const result = yield* coordinateCommit(
      () =>
        Effect.gen(function* () {
          const statements: Statement<any>[] = [];
          let mutation: Planned<any> | undefined;

          const nativeCollector = D1BatchStatements.of({
            append: (statement) => Effect.sync(() => statements.push(statement)),
          });

          const d1Owner = yield* makeD1Owner(unavailable()).pipe(
            Effect.provideService(D1BatchStatements, nativeCollector),
          );

          let batch!: D1SessionBatch;

          const appendMutation = (input: Planned<any>) =>
            d1Owner.run(
              Effect.suspend(() => {
                // Guard recovery is unambiguous only for one persistence transition.
                // The owner may append any number of application statements around it.
                if (mutation !== undefined) return Effect.fail(unavailable());
                mutation = input;
                statements.push(...input.statements);

                return Effect.void;
              }),
            );

          batch = { owner: d1Owner, append: appendMutation };
          const services = yield* make(batch);

          const value = yield* d1Owner.close(
            Effect.provideService(owner(services, batch), D1BatchStatements, d1Owner.collector),
          );

          if (mutation?.journalGuard !== undefined) {
            const status = yield* Effect.result(mutation.journalGuard.read);

            if (status._tag === "Success" || status.failure._tag !== "CommitPending")
              return yield* unavailable();
          }

          yield* database.$client
            .batch(statements)
            .pipe(
              Effect.catchCause((cause) =>
                Effect.fail(
                  new D1BatchFailure({ cause, ...(mutation === undefined ? {} : { mutation }) }),
                ),
              ),
            );

          return value;
        }),
      { mode: "batch" },
    ).pipe(
      Effect.catchCause(recoverCoordinatedD1BatchCause),
      Effect.provideService(CurrentD1PlanningDatabase, database),
    );

    return result.value;
  });

export const makeD1AuthenticationAuthorityServices = <
  Claims,
  Subject extends AnySQLiteTable,
  Credential extends AnySQLiteTable,
  Flow extends AnySQLiteTable,
  Pending extends AnySQLiteTable,
  NativeSubjectId,
>(
  mapping: D1AuthenticationAuthorityMapping<
    Claims,
    Subject,
    Credential,
    Flow,
    Pending,
    NativeSubjectId
  >,
) =>
  makeD1SessionServiceEffects
    .authority<Claims>(mapping as any)
    .pipe(
      Effect.provideServiceEffect(CurrentD1PlanningDatabase, DatabaseService),
      Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
    );

export const makeD1PendingAuthenticationServices = <
  Claims,
  Subject extends AnySQLiteTable,
  Credential extends AnySQLiteTable,
  Pending extends AnySQLiteTable,
  Flow extends AnySQLiteTable,
  NativeSubjectId,
>(
  mapping: D1PendingAuthenticationMapping<
    Claims,
    Subject,
    Credential,
    Pending,
    Flow,
    NativeSubjectId
  >,
) =>
  makeD1SessionServiceEffects
    .pending<Claims>(mapping as any)
    .pipe(
      Effect.provideServiceEffect(CurrentD1PlanningDatabase, DatabaseService),
      Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
    );

export const makeD1StatefulSessionServices = <
  Claims,
  Subject extends AnySQLiteTable,
  Credential extends AnySQLiteTable,
  Session extends AnySQLiteTable,
  Flow extends AnySQLiteTable,
  Pending extends AnySQLiteTable,
  NativeSubjectId,
  NativeSessionId,
>(
  mapping: D1StatefulSessionMapping<
    Claims,
    Subject,
    Credential,
    Session,
    Flow,
    Pending,
    NativeSubjectId,
    NativeSessionId
  >,
) =>
  makeD1SessionServiceEffects
    .stateful<Claims>(mapping as any)
    .pipe(
      Effect.provideServiceEffect(CurrentD1PlanningDatabase, DatabaseService),
      Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
    );

export const makeD1SignedSessionValidityServices = <
  Subject extends AnySQLiteTable,
  Tombstone extends AnySQLiteTable,
  NativeSubjectId,
  NativeSessionId,
>(
  mapping: D1SignedSessionValidityMapping<Subject, Tombstone, NativeSubjectId, NativeSessionId>,
) =>
  makeD1SessionServiceEffects
    .validity(mapping as any)
    .pipe(
      Effect.provideServiceEffect(CurrentD1PlanningDatabase, DatabaseService),
      Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
    );

export function coordinateD1AuthenticationAuthority<
  Claims,
  Subject extends AnySQLiteTable,
  Credential extends AnySQLiteTable,
  Flow extends AnySQLiteTable,
  Pending extends AnySQLiteTable,
  NativeSubjectId,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: D1AuthenticationAuthorityMapping<
      Claims,
      Subject,
      Credential,
      Flow,
      Pending,
      NativeSubjectId
    >;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  D1CoordinatorError<E> | DatabaseError,
  Exclude<R, AuthenticationAuthority | D1BatchStatements> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateD1SessionBatch(
      database,
      options.mapping,
      (batch) =>
        Effect.gen(function* () {
          const hooks = yield* LifecycleHooks;
          const raw = makeD1AuthenticationAuthority<Claims>(options.mapping as any);

          const run = <Out, Failure, Requirements>(
            effect: Effect.Effect<Out, Failure, Requirements>,
          ) =>
            batch.owner.run(
              effect.pipe(
                Effect.provideService(CurrentD1PlanningDatabase, database),
                Effect.provideService(LifecycleHooks, hooks),
                Effect.provideService(CurrentD1SessionBatch, batch),
              ),
            );

          const authenticationAuthority: AuthenticationAuthority["Service"] = {
            capture: (subjectId, credentialIds) => run(raw.capture(subjectId, credentialIds)),
            requirements: (evidence) => run(raw.requirements(evidence)),
            approve: (input, prepare) => run(raw.approve(input, prepare)),
          };

          return { authenticationAuthority };
        }),
      (
        ownedServices: { readonly authenticationAuthority: AuthenticationAuthority["Service"] },
        batch,
      ) => {
        const provided = Context.make(
          AuthenticationAuthority,
          ownedServices.authenticationAuthority,
        ).pipe(Context.add(D1BatchStatements, batch.owner.collector));

        return Effect.provideContext(body, provided);
      },
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
}

export function coordinateD1PendingAuthentication<
  TargetId,
  Claims,
  Subject extends AnySQLiteTable,
  Credential extends AnySQLiteTable,
  Pending extends AnySQLiteTable,
  Flow extends AnySQLiteTable,
  NativeSubjectId,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: D1PendingAuthenticationMapping<
      NoInfer<Claims>,
      Subject,
      Credential,
      Pending,
      Flow,
      NativeSubjectId
    >;
    readonly target: SuppliedService<TargetId, PendingAuthentication<Claims>>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  D1CoordinatorError<E> | DatabaseError,
  Exclude<R, TargetId | D1BatchStatements> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateD1SessionBatch(
      database,
      options.mapping,
      (batch) =>
        Effect.gen(function* () {
          const hooks = yield* LifecycleHooks;
          const raw = makeD1PendingAuthentication<Claims>(options.mapping as any);

          const run = <Out, Failure, Requirements>(
            effect: Effect.Effect<Out, Failure, Requirements>,
          ) =>
            batch.owner.run(
              effect.pipe(
                Effect.provideService(CurrentD1PlanningDatabase, database),
                Effect.provideService(LifecycleHooks, hooks),
                Effect.provideService(CurrentD1SessionBatch, batch),
              ),
            );

          const pendingAuthentication: PendingAuthentication<Claims> = {
            create: (input, now, prepare) => run(raw.create(input, now, prepare)),
            context: (input) => run(raw.context(input)),
            read: (input) => run(raw.read(input)),
            reject: (input, prepare) => run(raw.reject(input, prepare)),
          };

          return { pendingAuthentication };
        }),
      (ownedServices: { readonly pendingAuthentication: PendingAuthentication<Claims> }, batch) => {
        const provided = Context.make(options.target, ownedServices.pendingAuthentication).pipe(
          Context.add(D1BatchStatements, batch.owner.collector),
        );

        return Effect.provideContext(body, provided);
      },
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
}

export function coordinateD1StatefulSessions<
  PersistenceId,
  RepositoryId,
  Claims,
  Subject extends AnySQLiteTable,
  Credential extends AnySQLiteTable,
  Session extends AnySQLiteTable,
  Flow extends AnySQLiteTable,
  Pending extends AnySQLiteTable,
  NativeSubjectId,
  NativeSessionId,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: D1StatefulSessionMapping<
      NoInfer<Claims>,
      Subject,
      Credential,
      Session,
      Flow,
      Pending,
      NativeSubjectId,
      NativeSessionId
    >;
    readonly persistence: SuppliedService<PersistenceId, StatefulSessionPersistence<Claims>>;
    readonly repository: SuppliedService<RepositoryId, SessionRepository>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  D1CoordinatorError<E> | DatabaseError,
  | Exclude<R, PersistenceId | RepositoryId | D1BatchStatements>
  | LifecycleHooks
  | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateD1SessionBatch(
      database,
      options.mapping,
      (batch) =>
        Effect.gen(function* () {
          const hooks = yield* LifecycleHooks;
          const raw = makeD1StatefulSessions<Claims>(options.mapping as any);

          const run = <Out, Failure, Requirements>(
            effect: Effect.Effect<Out, Failure, Requirements>,
          ) =>
            batch.owner.run(
              effect.pipe(
                Effect.provideService(CurrentD1PlanningDatabase, database),
                Effect.provideService(LifecycleHooks, hooks),
                Effect.provideService(CurrentD1SessionBatch, batch),
              ),
            );

          const statefulSessionPersistence: StatefulSessionPersistence<Claims> = {
            establish: (input, prepare) => run(raw.persistence.establish(input, prepare)),
            verify: (input) => run(raw.persistence.verify(input)),
            rotate: (input, prepare) => run(raw.persistence.rotate(input, prepare)),
            revokeDigest: (digest, prepare) => run(raw.persistence.revokeDigest(digest, prepare)),
            revoke: (input, prepare) => run(raw.persistence.revoke(input, prepare)),
            revokeAll: (input, prepare) => run(raw.persistence.revokeAll(input, prepare)),
          };

          const sessionRepository: SessionRepository = {
            list: (input) => run(raw.repository.list(input)),
          };

          return { statefulSessionPersistence, sessionRepository };
        }),
      (
        ownedServices: {
          readonly statefulSessionPersistence: StatefulSessionPersistence<Claims>;
          readonly sessionRepository: SessionRepository;
        },
        batch,
      ) => {
        const provided = Context.make(
          options.persistence,
          ownedServices.statefulSessionPersistence,
        ).pipe(
          Context.add(options.repository, ownedServices.sessionRepository),
          Context.add(D1BatchStatements, batch.owner.collector),
        );

        return Effect.provideContext(body, provided);
      },
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
}

export function coordinateD1SignedSessionValidity<
  TargetId,
  Subject extends AnySQLiteTable,
  Tombstone extends AnySQLiteTable,
  NativeSubjectId,
  NativeSessionId,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: D1SignedSessionValidityMapping<
      Subject,
      Tombstone,
      NativeSubjectId,
      NativeSessionId
    >;
    readonly target: SuppliedService<TargetId, SignedSessionValidity>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  D1CoordinatorError<E> | DatabaseError,
  Exclude<R, TargetId | D1BatchStatements> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateD1SessionBatch(
      database,
      options.mapping,
      (batch) =>
        Effect.gen(function* () {
          const hooks = yield* LifecycleHooks;
          const raw = makeD1SignedValidity(options.mapping as any);

          const run = <Out, Failure, Requirements>(
            effect: Effect.Effect<Out, Failure, Requirements>,
          ) =>
            batch.owner.run(
              effect.pipe(
                Effect.provideService(CurrentD1PlanningDatabase, database),
                Effect.provideService(LifecycleHooks, hooks),
                Effect.provideService(CurrentD1SessionBatch, batch),
              ),
            );

          const signedSessionValidity: SignedSessionValidity = {
            verify: (session, now) => run(raw.verify(session, now)),
            revoke: (input, prepare) => run(raw.revoke(input, prepare)),
            revokeAll: (input, prepare) => run(raw.revokeAll(input, prepare)),
          };

          return { signedSessionValidity };
        }),
      (ownedServices: { readonly signedSessionValidity: SignedSessionValidity }, batch) => {
        const provided = Context.make(options.target, ownedServices.signedSessionValidity).pipe(
          Context.add(D1BatchStatements, batch.owner.collector),
        );

        return Effect.provideContext(body, provided);
      },
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
}

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

const stepUpSourceCondition = (
  mapping: any,
  intent: SessionStepUpIntent,
  nativeSubjectId: unknown,
  nativeSessionId: unknown,
  plan?: SessionStepUpCompletionPlan<unknown>,
): SQL => {
  const source = mapping.source;

  if (source.kind !== intent.sourceKind) return sql`false`;

  const time = and(
    sql`${mapping.d1.engineNowMillis} >= ${DateTime.toEpochMillis(intent.sourceAuthenticatedAt)}`,
    sql`${mapping.d1.engineNowMillis} < ${DateTime.toEpochMillis(intent.sourceExpiresAt)}`,
    sql`${mapping.d1.engineNowMillis} < ${DateTime.toEpochMillis(intent.sourceAbsoluteExpiresAt)}`,
  )!;

  if (source.kind === "StatelessSigned") return time;
  if (source.kind === "StateAssistedSigned") {
    const t = source.tombstone,
      owner = column(t.table, t.subjectId),
      id = column(t.table, t.sessionId),
      expiry = column(t.table, t.absoluteExpiresAt);

    return and(
      time,
      not(
        sql`exists(select 1 from ${t.table} where ${owner}=${sql.param(nativeSubjectId, owner)} and ${id}=${sql.param(nativeSessionId, id)} and ${expiry}>${mapping.d1.engineNow})`,
      ),
    )!;
  }

  const s = source.session,
    c = sessionColumns(source);

  const condition = and(
    eq(c.sessionId, nativeSessionId),
    eq(c.subjectId, nativeSubjectId),
    eq(c.securityRevision, intent.revision.securityRevision),
    eq(column(s.table, s.credentialVersion), intent.sourceCredentialVersion),
    eq(column(s.table, s.authenticatedAt), s.encodeInstant(intent.sourceAuthenticatedAt)),
    eq(c.expiresAt, s.encodeInstant(intent.sourceExpiresAt)),
    eq(c.absoluteExpiresAt, s.encodeInstant(intent.sourceAbsoluteExpiresAt)),
    gt(c.expiresAt, mapping.d1.engineNow),
    gt(c.absoluteExpiresAt, mapping.d1.engineNow),
    plan?.replacement._tag === "Stateful"
      ? eq(c.digest, plan.replacement.expectedDigest)
      : undefined,
    plan?.replacement._tag === "Stateful"
      ? eq(c.version, plan.replacement.expectedRowVersion)
      : undefined,
  )!;

  return and(time, sql`exists(select 1 from ${s.table} where ${condition})`)!;
};

const stepUpRowCondition = (
  mapping: any,
  row: any,
  intent: SessionStepUpIntent,
  nativeSubjectId: unknown,
): SQL => {
  const c = stepUpColumns(mapping),
    m = mapping.intent;

  return and(
    eq(c.digest, intent.digest),
    eq(c.version, intent.version),
    eq(c.flowId, intent.flowId),
    eq(c.subjectId, nativeSubjectId),
    eq(c.bindingDigest, intent.bindingDigest),
    eq(c.snapshot, row[m.snapshot]),
    eq(c.expiresAt, m.encodeInstant(intent.expiresAt)),
    eq(c.attemptLimit, intent.attemptLimit),
    eq(c.consumed, false),
    eq(c.failedAttempts, row[m.failedAttempts]),
    sql`${c.failedAttempts} >= 0`,
    sql`${c.failedAttempts} < ${c.attemptLimit}`,
    gt(c.expiresAt, mapping.d1.engineNow),
  )!;
};

const readD1StepUp = Effect.fn("DrizzleD1StepUp.read")(function* (
  mapping: AnyD1StepUpMapping,
  digest: TokenDigest,
) {
  const database = yield* CurrentD1PlanningDatabase;

  const m = mapping.intent,
    c = stepUpColumns(mapping);

  const row = (yield* database.select().from(m.table).where(eq(c.digest, digest)).limit(1))[0];

  if (row === undefined) return yield* SessionStepUpInvalid.make({});
  const intent = yield* decodeStepUpIntent(row[m.snapshot]);

  if (
    intent.digest !== digest ||
    !stepUpIntentLive(intent, mapping.source.kind, yield* DateTime.now) ||
    !Schema.is(Schema.Natural)(row[m.failedAttempts])
  )
    return yield* SessionStepUpInvalid.make({});
  const nativeSubjectId = yield* mapping.subjectId.toNative(intent.revision.subjectId);

  const nativeSessionId =
    mapping.source.kind === "StatelessSigned"
      ? undefined
      : yield* mapping.source.sessionId.toNative(intent.sourceSessionId);

  const condition = and(
    authorityCondition(mapping, nativeSubjectId, intent),
    stepUpSourceCondition(mapping, intent, nativeSubjectId, nativeSessionId),
    sql`exists(select 1 from ${m.table} where ${stepUpRowCondition(mapping, row, intent, nativeSubjectId)})`,
    sql`${mapping.d1.engineNowMillis} < ${DateTime.toEpochMillis(intent.expiresAt)}`,
  )!;

  if (!(yield* conditionMatches(condition))) return yield* SessionStepUpInvalid.make({});

  return { row, intent, nativeSubjectId, nativeSessionId };
});

const isD1StepUpRejectAbsence = (error: unknown): error is SessionStepUpInvalid =>
  typeof error === "object" &&
  error !== null &&
  Reflect.get(error, "_tag") === "SessionStepUpInvalid";

type D1StepUpReadFailure = D1AdapterFailure | SessionStepUpInvalid | SessionUnavailable;

const recoverD1StepUpRejectAbsence = <A, B, R>(
  effect: Effect.Effect<A, D1StepUpReadFailure, R>,
  rejected: B,
): Effect.Effect<A | B, D1AdapterFailure | SessionUnavailable, R> =>
  effect.pipe(
    Effect.catchCause((cause) => {
      if (
        cause.reasons.length > 0 &&
        cause.reasons.every(
          (reason) => Cause.isFailReason(reason) && isD1StepUpRejectAbsence(reason.error),
        )
      )
        return Effect.succeed(rejected);

      return Effect.failCause(
        Cause.map(cause, (error) =>
          isD1StepUpRejectAbsence(error) ? SessionUnavailable.make({}) : error,
        ),
      );
    }),
  );

export const makeD1SessionStepUp = <Claims>(
  mapping: D1SessionStepUpMapping<Claims, any, any, any, any, any, any, any>,
) => {
  const m = mapping.intent,
    c = stepUpColumns(mapping);

  const recover = Effect.fail(SessionStepUpInvalid.make({}));

  return {
    create: <A>(
      input: Parameters<SessionStepUpPersistence<Claims>["create"]>[0],
      _now: DateTime.Utc,
      prepare: PrepareSessionCommit<SessionStepUpIntent, A>,
    ) =>
      runPlanned(
        Effect.gen(function* () {
          const database = yield* CurrentD1PlanningDatabase;
          const journal = yield* CurrentCommitJournal;

          const version = yield* allocate(m.allocateVersion, m.allocateVersionSync),
            record: SessionStepUpIntent = { ...input, version };

          if (!stepUpIntentLive(record, mapping.source.kind, yield* DateTime.now))
            return yield* stale();
          const nativeSubjectId = yield* mapping.subjectId.toNative(input.revision.subjectId);

          const nativeSessionId =
            mapping.source.kind === "StatelessSigned"
              ? undefined
              : yield* mapping.source.sessionId.toNative(input.sourceSessionId);

          const existing = yield* database
            .select()
            .from(m.table)
            .where(or(eq(c.digest, input.digest), eq(c.flowId, input.flowId)))
            .limit(1);

          if (existing.length > 0) return yield* SessionConflict.make({});

          const condition = and(
            authorityCondition(mapping, nativeSubjectId, record),
            stepUpSourceCondition(mapping, record, nativeSubjectId, nativeSessionId),
            sql`${mapping.d1.engineNowMillis} < ${DateTime.toEpochMillis(input.expiresAt)}`,
          )!;

          if (!(yield* conditionMatches(condition))) return yield* stale();
          const snapshot = yield* encodeStepUpIntent(record);

          const values = {
            ...m.encodeInsert(record, { subjectId: nativeSubjectId }),
            ...updateValues<any>([
              [m.digest, record.digest],
              [m.version, version],
              [m.flowId, record.flowId],
              [m.subjectId, nativeSubjectId],
              [m.bindingDigest, record.bindingDigest],
              [m.snapshot, snapshot],
              [m.expiresAt, m.encodeInstant(record.expiresAt)],
              [m.attemptLimit, record.attemptLimit],
              [m.failedAttempts, 0],
              [m.consumed, false],
            ]),
          };

          const receipt = prepare(record, journal);

          const exact = and(
            eq(c.digest, record.digest),
            eq(c.version, version),
            eq(c.flowId, record.flowId),
            eq(c.subjectId, nativeSubjectId),
            eq(c.bindingDigest, record.bindingDigest),
            eq(c.snapshot, snapshot),
            eq(c.expiresAt, m.encodeInstant(record.expiresAt)),
            eq(c.attemptLimit, record.attemptLimit),
            eq(c.failedAttempts, 0),
            eq(c.consumed, false),
          )!;

          return {
            receipt,
            statements: [
              yield* assertion(condition),
              yield* statement(database.insert(m.table).values(values)),
              yield* assertion(sql`changes() = 1`),
              yield* assertion(
                and(condition, sql`exists(select 1 from ${m.table} where ${exact})`)!,
              ),
            ],
          };
        }),
        mapping.isConstraintConflict,
        Effect.fail(stale()),
      ),
    context: (input: Parameters<SessionStepUpPersistence<Claims>["context"]>[0]) =>
      mapFailureCause(
        readD1StepUp(mapping, input.digest).pipe(
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
      ).pipe(terminalD1),
    read: (input: Parameters<SessionStepUpPersistence<Claims>["read"]>[0]) =>
      readD1StepUp(mapping, input.digest).pipe(
        Effect.flatMap(({ intent }) =>
          intent.bindingDigest === input.bindingDigest
            ? Effect.succeed(intent)
            : Effect.fail(SessionStepUpInvalid.make({})),
        ),
        terminalD1,
      ),
    reject: <A>(
      input: Parameters<SessionStepUpPersistence<Claims>["reject"]>[0],
      prepare: PrepareSessionCommit<{ readonly _tag: "Rejected" }, A>,
    ) =>
      runPlanned(
        Effect.gen(function* () {
          const database = yield* CurrentD1PlanningDatabase;
          const journal = yield* CurrentCommitJournal;

          const selected = yield* recoverD1StepUpRejectAbsence(
            readD1StepUp(mapping, input.digest).pipe(
              Effect.map((value) => ({ _tag: "Found" as const, value })),
            ),
            { _tag: "Rejected" as const },
          );

          if (selected._tag === "Rejected")
            return { receipt: prepare({ _tag: "Rejected" }, journal), statements: [] };
          const { row, intent, nativeSubjectId, nativeSessionId } = selected.value;

          // Rejection does not replace immutable intent identity. Concurrent contenders
          // increment the authoritative counter under the same cap; completion pins it.
          const condition = and(
            eq(c.digest, intent.digest),
            eq(c.version, intent.version),
            eq(c.snapshot, row[m.snapshot]),
            eq(c.subjectId, nativeSubjectId),
            eq(c.bindingDigest, intent.bindingDigest),
            eq(c.flowId, intent.flowId),
            eq(c.expiresAt, m.encodeInstant(intent.expiresAt)),
            eq(c.attemptLimit, intent.attemptLimit),
            eq(c.consumed, false),
            sql`${c.failedAttempts} >= 0`,
            sql`${c.failedAttempts} < ${c.attemptLimit}`,
            gt(c.expiresAt, mapping.d1.engineNow),
            authorityCondition(mapping, nativeSubjectId, intent),
            stepUpSourceCondition(mapping, intent, nativeSubjectId, nativeSessionId),
          )!;

          const write = database
            .update(m.table)
            .set(updateValues<any>([[m.failedAttempts, sql`${c.failedAttempts} + 1`]]))
            .where(condition);

          // A valid still-chargeable row cannot survive a zero-write trigger. A row
          // consumed/expired/exhausted while queued legitimately returns Rejected.
          const settled = sql`changes() = 1 or not exists(select 1 from ${m.table} where ${condition})`;

          return {
            receipt: prepare({ _tag: "Rejected" }, journal),
            statements: [yield* statement(write), yield* assertion(settled)],
          };
        }),
        undefined,
        Effect.fail(unavailable()),
      ),
    complete: <A>(
      plan: SessionStepUpCompletionPlan<Claims>,
      prepare: PrepareSessionCommit<PreparedValue<SessionStepUpPersistence<Claims>["complete"]>, A>,
    ) =>
      runPlanned(
        Effect.gen(function* () {
          const database = yield* CurrentD1PlanningDatabase;
          const journal = yield* CurrentCommitJournal;

          yield* validateStepUpPlan(plan);
          const stored = yield* readD1StepUp(mapping, plan.intent.digest);

          if (
            (yield* encodeStepUpIntent(stored.intent)) !== (yield* encodeStepUpIntent(plan.intent))
          )
            return yield* SessionStepUpInvalid.make({});
          const base = yield* requirement(mapping, plan.evidence);

          if (
            !(yield* assessAuthentication(plan.evidence, base)).satisfied ||
            !(yield* assessAuthentication(plan.evidence, stored.intent.requirement)).satisfied
          )
            return yield* stale();

          const { row, intent, nativeSubjectId, nativeSessionId } = stored,
            replacement = plan.replacement;

          const target = replacement.inspection.session;

          if (
            DateTime.toEpochMillis(target.expiresAt) >
            DateTime.toEpochMillis(intent.sourceAbsoluteExpiresAt)
          )
            return yield* SessionStepUpInvalid.make({});

          const live = and(
            authorityCondition(mapping, nativeSubjectId, plan.evidence),
            freshnessCondition(mapping, plan.evidence, base, true),
            freshnessCondition(mapping, plan.evidence, intent.requirement, true),
            sql`${mapping.d1.engineNowMillis} >= ${DateTime.toEpochMillis(intent.sourceAuthenticatedAt)}`,
            sql`${mapping.d1.engineNowMillis} < ${DateTime.toEpochMillis(intent.expiresAt)}`,
            sql`${mapping.d1.engineNowMillis} < ${DateTime.toEpochMillis(intent.sourceExpiresAt)}`,
            sql`${mapping.d1.engineNowMillis} < ${DateTime.toEpochMillis(intent.sourceAbsoluteExpiresAt)}`,
            sql`${mapping.d1.engineNowMillis} >= ${DateTime.toEpochMillis(target.issuedAt)}`,
            sql`${mapping.d1.engineNowMillis} < ${DateTime.toEpochMillis(target.expiresAt)}`,
          )!;

          const source = stepUpSourceCondition(
            mapping,
            intent,
            nativeSubjectId,
            nativeSessionId,
            plan,
          );

          const version = yield* allocate(m.allocateVersion, m.allocateVersionSync);

          if (version === intent.version) return yield* unavailable();
          const snapshot = yield* encodeStepUpIntent({ ...intent, version });

          const consume = database
            .update(m.table)
            .set(
              updateValues<any>([
                [m.consumed, true],
                [m.version, version],
                [m.snapshot, snapshot],
              ]),
            )
            .where(and(stepUpRowCondition(mapping, row, intent, nativeSubjectId), live, source));

          const marker = sql`exists(select 1 from ${m.table} where ${c.digest}=${sql.param(intent.digest, c.digest)} and ${c.version}=${sql.param(version, c.version)} and ${c.snapshot}=${sql.param(snapshot, c.snapshot)} and ${c.consumed}=${sql.param(true, c.consumed)} and ${c.failedAttempts}=${row[m.failedAttempts]})`;

          const statements: Statement<any>[] = [
            yield* statement(consume),
            yield* assertion(sql`changes() = 1`),
          ];

          let post: SQL = sql`true`;

          if (replacement._tag === "Stateful") {
            if (mapping.source.kind !== "Stateful") return yield* SessionStepUpInvalid.make({});

            const s = mapping.source.session,
              sc = sessionColumns(mapping.source);

            const rowVersion = yield* allocate(s.allocateVersion, s.allocateVersionSync);

            const next = {
              ...target,
              provenance: replacement.inspection.provenance,
              credentialVersion: replacement.inspection.credentialVersion,
              digest: replacement.nextDigest,
              version: rowVersion,
            };

            const rotation = {
              ...s.encodeRotation(next),
              ...updateValues<any>([
                [s.version, rowVersion],
                [s.digest, next.digest],
                [s.credentialVersion, next.credentialVersion],
                [s.authenticatedAt, s.encodeInstant(target.assurance.authenticatedAt)],
                [s.issuedAt, s.encodeInstant(target.issuedAt)],
                [s.expiresAt, s.encodeInstant(target.expiresAt)],
                [s.absoluteExpiresAt, s.encodeInstant(target.absoluteExpiresAt)],
              ]),
            };

            const write = database
              .update(s.table)
              .set(rotation)
              .where(
                and(
                  eq(sc.sessionId, nativeSessionId),
                  eq(sc.digest, replacement.expectedDigest),
                  eq(sc.version, replacement.expectedRowVersion),
                  marker,
                  source,
                  live,
                ),
              );

            statements.push(yield* statement(write), yield* assertion(sql`changes() = 1`));

            const exact = and(
              eq(sc.sessionId, nativeSessionId),
              eq(sc.subjectId, nativeSubjectId),
              eq(sc.version, rowVersion),
              eq(sc.digest, next.digest),
              eq(sc.securityRevision, target.securityRevision),
              eq(column(s.table, s.credentialVersion), next.credentialVersion),
              eq(
                column(s.table, s.authenticatedAt),
                s.encodeInstant(target.assurance.authenticatedAt),
              ),
              eq(sc.issuedAt, s.encodeInstant(target.issuedAt)),
              eq(sc.expiresAt, s.encodeInstant(target.expiresAt)),
              eq(sc.absoluteExpiresAt, s.encodeInstant(target.absoluteExpiresAt)),
            )!;

            post = sql`exists(select 1 from ${s.table} where ${exact})`;
          } else if (replacement._tag === "StateAssistedSigned") {
            if (mapping.source.kind !== "StateAssistedSigned")
              return yield* SessionStepUpInvalid.make({});

            const t = mapping.source.tombstone,
              owner = column(t.table, t.subjectId),
              id = column(t.table, t.sessionId),
              expiry = column(t.table, t.absoluteExpiresAt);

            statements.push(
              yield* statement(
                database
                  .delete(t.table)
                  .where(
                    and(
                      eq(owner, nativeSubjectId),
                      eq(id, nativeSessionId),
                      sql`${expiry} <= ${mapping.d1.engineNow}`,
                      marker,
                    ),
                  ),
              ),
            );

            const values = t.encodeInsert({
              subjectId: nativeSubjectId,
              sessionId: nativeSessionId,
              absoluteExpiresAt: replacement.tombstoneUntil,
            });

            statements.push(
              yield* statement(database.insert(t.table).values(values)),
              yield* assertion(sql`changes() = 1`),
            );

            const exact = and(
              eq(owner, nativeSubjectId),
              eq(id, nativeSessionId),
              eq(expiry, t.encodeInstant(replacement.tombstoneUntil)),
            )!;

            post = sql`exists(select 1 from ${t.table} where ${exact})`;
          }
          statements.push(yield* assertion(and(marker, post, live)!));

          return { receipt: prepare(replacement.inspection, journal), statements };
        }),
        mapping.isConstraintConflict,
        recover,
      ),
  };
};

export const makeD1SessionStepUpServices = Effect.fnUntraced(function* <
  Claims,
  Id,
  S extends AnySQLiteTable,
  C extends AnySQLiteTable,
  I extends AnySQLiteTable,
  Session extends AnySQLiteTable,
  T extends AnySQLiteTable,
  NativeId,
  NativeSessionId,
>(
  mapping: D1SessionStepUpMapping<NoInfer<Claims>, S, C, I, Session, T, NativeId, NativeSessionId>,
  target: Context.Service<Id, SessionStepUpPersistence<Claims>>,
) {
  const database = yield* DatabaseService;

  yield* validateDrizzleStorage(mapping).pipe(
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
    Effect.mapError(unavailable),
  );

  const hooks = yield* LifecycleHooks;
  const raw = makeD1SessionStepUp<Claims>(mapping as any);

  const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      if (
        (yield* Effect.serviceOption(CurrentD1SessionBatch))._tag === "Some" ||
        (yield* hasCommitScope)
      )
        return yield* unavailable();

      return yield* effect.pipe(
        Effect.provideService(CurrentD1PlanningDatabase, database),
        Effect.provideService(LifecycleHooks, hooks),
      );
    });

  const sessionStepUpPersistence = target.of({
    create: (input, now, prepare) => run(raw.create(input, now, prepare)),
    context: (input) => run(raw.context(input)),
    read: (input) => run(raw.read(input)),
    reject: (input, prepare) => run(raw.reject(input, prepare)),
    complete: (plan, prepare) => run(raw.complete(plan, prepare)),
  });

  return { sessionStepUpPersistence };
});

export function coordinateD1SessionStepUp<
  Claims,
  Id,
  S extends AnySQLiteTable,
  C extends AnySQLiteTable,
  I extends AnySQLiteTable,
  Session extends AnySQLiteTable,
  T extends AnySQLiteTable,
  NativeId,
  NativeSessionId,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: D1SessionStepUpMapping<
      NoInfer<Claims>,
      S,
      C,
      I,
      Session,
      T,
      NativeId,
      NativeSessionId
    >;
    readonly target: SuppliedService<Id, SessionStepUpPersistence<Claims>>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  D1CoordinatorError<E> | DatabaseError,
  Exclude<R, Id | D1BatchStatements> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateD1SessionBatch(
      database,
      options.mapping,
      (batch) =>
        Effect.gen(function* () {
          const hooks = yield* LifecycleHooks;
          const raw = makeD1SessionStepUp<Claims>(options.mapping as any);

          const run = <Out, Failure, Requirements>(
            effect: Effect.Effect<Out, Failure, Requirements>,
          ) =>
            batch.owner.run(
              effect.pipe(
                Effect.provideService(CurrentD1PlanningDatabase, database),
                Effect.provideService(LifecycleHooks, hooks),
                Effect.provideService(CurrentD1SessionBatch, batch),
              ),
            );

          const sessionStepUpPersistence = options.target.of({
            create: (input, now, prepare) => run(raw.create(input, now, prepare)),
            context: (input) => run(raw.context(input)),
            read: (input) => run(raw.read(input)),
            reject: (input, prepare) => run(raw.reject(input, prepare)),
            complete: (plan, prepare) => run(raw.complete(plan, prepare)),
          });

          return { sessionStepUpPersistence };
        }),
      (
        ownedServices: { readonly sessionStepUpPersistence: SessionStepUpPersistence<Claims> },
        batch,
      ) => {
        const provided = Context.make(options.target, ownedServices.sessionStepUpPersistence).pipe(
          Context.add(D1BatchStatements, batch.owner.collector),
        );

        return Effect.provideContext(body, provided);
      },
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
}
