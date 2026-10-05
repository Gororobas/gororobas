/* oxlint-disable no-explicit-any -- D1 planning bridges consumer Drizzle tables to Effect SQL statements. */
import type { D1Client } from "@effect/sql-d1/D1Client";
import { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import {
  coordinateCommit,
  CurrentCommitJournal,
  hasCommitScope,
  type CommitJournal,
  type PreparedCommit,
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
  type PrepareProofCommit,
  type ProofDeliveryClaim,
  ProofRequestConflict,
  ProofUnavailable,
} from "@yielded/auth/Proofs";
import {
  and,
  count,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  notExists,
  or,
  sql,
  type AnyRelations,
  type SQL,
  type Table,
} from "drizzle-orm";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import type { EffectSQLiteD1Database } from "drizzle-orm/effect-d1";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { Cause, Effect, Schema, Context } from "effect";
import type { Statement } from "effect/sql/Statement";

import { Database as DatabaseService } from "./d1-database";
import { balancedD1And } from "./d1-generated-statement";
import { CurrentD1PlanningDatabase, makeD1Owner } from "./d1-planning";
import { D1BatchStatements } from "./D1BatchStatements";
import { column, PersistenceMappingError, isMappedConstraintConflict, updateValues } from "./model";
import { nativeDatabase } from "./native-database";
import {
  type D1ProofPersistenceMapping,
  requiredProofConstraints,
  type ProofAction,
  type ProofAuthorityInput,
  type ProofCommandDecision,
  type ProofContinuationRecord,
  type ProofPersistenceMapping,
  type ProofScopeKeys,
  type ProofScopeKind,
} from "./proof-model";
import { validateDrizzleStorage } from "./storage-validation";

type PlanPrepare<Method extends (...args: any[]) => any, A> = (
  value: Parameters<Parameters<Method>[1]>[0],
  journal: CommitJournal,
) => PreparedCommit<A>;

type Database = EffectSQLiteD1Database<AnyRelations> & { readonly $client: D1Client };
type Mapping = D1ProofPersistenceMapping<
  Table,
  Table,
  Table,
  Table,
  Table,
  Table,
  Table,
  Table,
  Table,
  Table,
  Table,
  unknown
>;
interface Planned<A> {
  readonly receipt: A;
  readonly statements: ReadonlyArray<Statement<any>>;
  readonly retryable?: (cause: unknown) => boolean;
  readonly journalGuard?: PreparedCommit<void>;
  readonly postconditions?: ReadonlyArray<Statement<any>>;
}

const unavailable = () => ProofUnavailable.make({});

const everyFailureMatches = (
  cause: Cause.Cause<unknown>,
  classify: ((cause: unknown) => boolean) | undefined,
): boolean =>
  classify !== undefined &&
  cause.reasons.length > 0 &&
  cause.reasons.every((reason) => Cause.isFailReason(reason) && classify(Cause.fail(reason.error)));

const conflict = () => ProofRequestConflict.make({});

const validConstraints = (mapping: Mapping) =>
  Object.entries(requiredProofConstraints).every(
    ([key, value]) => mapping.constraints[key as keyof typeof requiredProofConstraints] === value,
  );

const canonicalBinding = Schema.encodeSync(Schema.fromJsonString(ProofBinding));

const sameBinding = (left: ProofBinding, right: ProofBinding) =>
  canonicalBinding(left) === canonicalBinding(right);

const containsFailure = (failure: unknown, predicate: (value: unknown) => boolean): boolean => {
  const seen = new Set<unknown>();
  const pending: Array<unknown> = [failure];

  for (let inspected = 0; inspected < 32 && pending.length > 0; inspected++) {
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

// Match only the native workerd/D1 SQLite diagnostic. Query wrappers may echo
// marker parameters, which is not evidence that the guard ran and rolled back.
const isGuardFailure = (cause: unknown, marker: string) => {
  const path = `$[${marker.replaceAll("'", "''")}]`;
  const nativeMessage = `bad JSON path: '${path}': SQLITE_ERROR`;

  return containsFailure(
    cause,
    (value) => value === nativeMessage || value === `D1_ERROR: ${nativeMessage}`,
  );
};

type AdapterFailure = PersistenceMappingError | EffectDrizzleQueryError;

const statement = Effect.fn(function* (query: {
  readonly toSQL: () => { readonly sql: string; readonly params: unknown[] };
}) {
  const database = yield* CurrentD1PlanningDatabase;
  const rendered = query.toSQL();

  return database.$client.unsafe(rendered.sql, rendered.params);
});

const readEngineNowMillis = Effect.fn("Drizzle.readEngineNowMillis")(function* (mapping: Mapping) {
  const database = yield* CurrentD1PlanningDatabase;

  return yield* database
    .select({ value: mapping.d1.engineNowMillis.as("engine_now_millis") })
    .from(sql`(select 1)`)
    .pipe(
      Effect.flatMap((rows) => {
        const value = Number(rows[0]?.value);

        return Number.isFinite(value) ? Effect.succeed(value) : Effect.fail(unavailable());
      }),
    );
});

const driverValues = (values: object, entries: ReadonlyArray<readonly [string, unknown]>) => ({
  ...values,
  ...Object.fromEntries(entries),
});

const assertion = Effect.fn(function* (condition: SQL, marker: string) {
  const database = yield* CurrentD1PlanningDatabase;

  return yield* statement(
    database
      .select({
        ok: sql`case when ${condition} then 1 else json_extract('[]', ${`$[${marker}]`}) end`.as(
          "ok",
        ),
      })
      .from(sql`(select 1)`),
  );
});

const allocateVersion = (
  mapping: Mapping,
): Effect.Effect<ProofVersion, ProofUnavailable | PersistenceMappingError> =>
  mapping.allocateVersion !== undefined
    ? mapping.allocateVersion
    : mapping.allocateVersionSync === undefined
      ? Effect.fail(unavailable())
      : Effect.try({
          try: mapping.allocateVersionSync,
          catch: (cause) => new PersistenceMappingError({ operation: "mapping", cause }),
        });

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
  seriesKey: column(mapping.generation.table, mapping.generation.seriesKey),
  deliveryId: column(mapping.generation.table, mapping.generation.deliveryId),
  verifierKeyId: column(mapping.generation.table, mapping.generation.verifierKeyId),
  verifierDigest: column(mapping.generation.table, mapping.generation.verifierDigest),
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
  continuationId: column(mapping.continuation.table, mapping.continuation.continuationId),
  digest: column(mapping.continuation.table, mapping.continuation.digest),
  consumed: column(mapping.continuation.table, mapping.continuation.consumed),
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
  decision: column(mapping.command.table, mapping.command.decision),
  retentionUntil: column(mapping.command.table, mapping.command.retentionUntil),
});

interface ScopeEntry {
  readonly kind: ProofScopeKind;
  readonly key: string;
  readonly budget: ProofBudget;
}

const scopeEntries = (
  keys: ProofScopeKeys,
  binding: ProofBinding,
  action: ProofAction,
  policy: ProofPolicy,
) => {
  const suffix = action === "issue" ? "Issues" : "Attempts";
  const simple = action === "issue" ? "issues" : "attempts";

  const entries: ScopeEntry[] = [
    { kind: "action", key: "*", budget: policy.abuse[`action${suffix}`] },
    { kind: "identifier", key: keys.identifier, budget: policy.abuse[simple] },
  ];

  if (binding._tag !== "Identifier")
    entries.push({ kind: "subject", key: keys.subject, budget: policy.abuse[`subject${suffix}`] });

  return entries;
};

const scopeCondition = (
  mapping: Mapping,
  moduleId: string,
  purpose: any,
  action: ProofAction,
  entry: ScopeEntry,
) => {
  const c = abuseColumns(mapping);

  return sql`(select count(*) from ${mapping.abuseEvent.table} where ${c.moduleId} = ${sql.param(moduleId, c.moduleId)} and ${c.purpose} = ${sql.param(purpose, c.purpose)} and ${c.action} = ${sql.param(action, c.action)} and ${c.scopeKind} = ${sql.param(entry.kind, c.scopeKind)} and ${c.scopeKey} = ${sql.param(entry.key, c.scopeKey)} and ${c.occurredAt} >= ${mapping.d1.engineInstantMinus(entry.budget.windowMillis)}) < ${entry.budget.limit}`;
};

const failureCondition = (
  mapping: Mapping,
  moduleId: string,
  purpose: any,
  seriesKey: string,
  policy: ProofPolicy,
) => {
  const c = failureColumns(mapping);

  return sql`(select count(*) from ${mapping.failureEvent.table} where ${c.moduleId} = ${sql.param(moduleId, c.moduleId)} and ${c.purpose} = ${sql.param(purpose, c.purpose)} and ${c.seriesKey} = ${sql.param(seriesKey, c.seriesKey)} and ${c.occurredAt} >= ${mapping.d1.engineInstantMinus(policy.abuse.attempts.windowMillis)}) < ${policy.maximumFailedAttempts}`;
};

const readScopeAdmission = Effect.fn("DrizzleD1Proof.readScopeAdmission")(function* (
  mapping: Mapping,
  moduleId: string,
  purpose: any,
  action: ProofAction,
  entries: ReadonlyArray<ScopeEntry>,
  now: number,
) {
  const database = yield* CurrentD1PlanningDatabase;

  const c = abuseColumns(mapping);
  const admitted: ScopeEntry[] = [];

  for (const entry of entries) {
    const rows = yield* database
      .select({ total: count() })
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
      );

    if (Number(rows[0]?.total ?? 0) < entry.budget.limit) admitted.push(entry);
  }

  return admitted;
});

const authority = Effect.fn("DrizzleD1Proof.authority")(function* (
  mapping: Mapping,
  moduleId: string,
  purpose: any,
  binding: ProofBinding,
) {
  const database = yield* CurrentD1PlanningDatabase;

  let nativeSubjectId: unknown | undefined;
  let subjectCurrent = true;
  const parts: SQL[] = [];

  if (binding._tag !== "Identifier") {
    if (
      mapping.authority.subject === undefined ||
      mapping.authority.credential === undefined ||
      mapping.authority.subjectId === undefined
    )
      return yield* unavailable();
    nativeSubjectId = yield* mapping.authority.subjectId.toNative(binding.revision.subjectId);
    const subject = mapping.authority.subject;
    const id = column(subject.table, subject.id);
    const status = column(subject.table, subject.status);
    const revision = column(subject.table, subject.securityRevision);

    const subjectRows = yield* database
      .select()
      .from(subject.table)
      .where(eq(id, nativeSubjectId))
      .limit(1);

    const subjectRow = subjectRows[0];

    subjectCurrent =
      subjectRow !== undefined &&
      subject.isActiveStatus(subjectRow[subject.status]) &&
      subjectRow[subject.securityRevision] === binding.revision.securityRevision;
    parts.push(
      sql`exists(select 1 from ${subject.table} where ${id} = ${sql.param(nativeSubjectId, id)} and ${status} = ${sql.param(subject.d1ActiveStatusValue, status)} and ${revision} = ${sql.param(binding.revision.securityRevision, revision)})`,
    );
  }
  const identifier = mapping.authority.identifier;
  const namespace = column(identifier.table, identifier.namespace);
  const value = column(identifier.table, identifier.value);

  const identifierRows = yield* database
    .select()
    .from(identifier.table)
    .where(and(eq(namespace, binding.identifier.namespace), eq(value, binding.identifier.value)));

  const input: ProofAuthorityInput<unknown> = {
    moduleId,
    purpose,
    binding,
    ...(nativeSubjectId === undefined ? {} : { nativeSubjectId }),
  };

  const identifierCurrent = identifier.isCurrent(input, identifierRows);

  parts.push(identifier.d1CurrentCondition(input));
  let credentialsCurrent = true;

  if (binding._tag !== "Identifier") {
    const credential = mapping.authority.credential!;
    const owner = column(credential.table, credential.subjectId);
    const id = column(credential.table, credential.credentialId);
    const revision = column(credential.table, credential.revision);

    const status =
      credential.status === undefined ? undefined : column(credential.table, credential.status);

    const expected = [...binding.revision.credentials].sort((a, b) =>
      a.credentialId.localeCompare(b.credentialId),
    );

    const rows =
      expected.length === 0
        ? []
        : yield* database
            .select()
            .from(credential.table)
            .where(
              and(
                eq(owner, nativeSubjectId),
                inArray(
                  id,
                  expected.map((item) => item.credentialId),
                ),
              ),
            );

    const actual = rows
      .map((row: any) => ({
        id: row[credential.credentialId],
        revision: row[credential.revision],
        active:
          credential.status === undefined ||
          credential.isActiveStatus?.(row[credential.status]) === true,
      }))
      .sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));

    credentialsCurrent =
      actual.length === expected.length &&
      actual.every(
        (row: any, index: number) =>
          row.active &&
          row.id === expected[index]?.credentialId &&
          row.revision === expected[index]?.revision,
      );
    for (const expectedCredential of expected)
      parts.push(
        sql`exists(select 1 from ${credential.table} where ${owner} = ${sql.param(nativeSubjectId, owner)} and ${id} = ${sql.param(expectedCredential.credentialId, id)} and ${revision} = ${sql.param(expectedCredential.revision, revision)}${status === undefined ? sql`` : sql` and ${status} = ${sql.param(credential.d1ActiveStatusValue, status)}`})`,
      );
  }

  return {
    current: subjectCurrent && identifierCurrent && credentialsCurrent,
    condition: balancedD1And(...parts) ?? sql`1 = 1`,
  };
});

const anchorStatements = Effect.fn(function* (
  mapping: Mapping,
  moduleId: string,
  purpose: any,
  action: ProofAction,
  entries: ReadonlyArray<ScopeEntry>,
  seriesKey: string,
  seriesVersion: ProofVersion,
  includeSeries: boolean,
) {
  const database = yield* CurrentD1PlanningDatabase;

  return [
    ...(yield* Effect.forEach(
      entries,
      Effect.fn(function* (entry) {
        return yield* statement(
          database
            .insert(mapping.rateScope.table)
            .values(
              mapping.rateScope.encodeInsert({
                moduleId,
                purpose,
                action,
                scopeKind: entry.kind,
                scopeKey: entry.key,
              }),
            )
            .onConflictDoNothing(),
        );
      }),
    )),
    ...(includeSeries
      ? [
          yield* statement(
            database
              .insert(mapping.series.table)
              .values(
                mapping.series.encodeInsert({
                  moduleId,
                  purpose,
                  scopeKey: seriesKey,
                  version: seriesVersion,
                }),
              )
              .onConflictDoNothing(),
          ),
        ]
      : []),
  ];
});

const insertScopeStatements = Effect.fn(function* (
  mapping: Mapping,
  moduleId: string,
  purpose: any,
  action: ProofAction,
  commandId: string,
  entries: ReadonlyArray<ScopeEntry>,
  now: number,
  retentionUntil: number,
  marker: string,
) {
  const database = yield* CurrentD1PlanningDatabase;

  return (yield* Effect.forEach(
    entries,
    Effect.fn(function* (entry) {
      return [
        yield* assertion(scopeCondition(mapping, moduleId, purpose, action, entry), marker),
        yield* statement(
          database.insert(mapping.abuseEvent.table).values(
            driverValues(
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
              [
                [mapping.abuseEvent.occurredAt, mapping.d1.engineNow],
                [
                  mapping.abuseEvent.retentionUntil,
                  mapping.d1.engineInstantPlus(retentionUntil - now),
                ],
              ],
            ),
          ),
        ),
      ];
    }),
  )).flat();
});

const readSeries = Effect.fn("Drizzle.readSeries")(function* (
  mapping: Mapping,
  moduleId: string,
  purpose: any,
  key: string,
) {
  const database = yield* CurrentD1PlanningDatabase;

  const c = seriesColumns(mapping);

  return yield* database
    .select()
    .from(mapping.series.table)
    .where(and(eq(c.moduleId, moduleId), eq(c.purpose, purpose), eq(c.scopeKey, key)))
    .limit(1);
});

const readGeneration = Effect.fn("Drizzle.readGeneration")(function* (
  mapping: Mapping,
  moduleId: string,
  proofId: string,
) {
  const database = yield* CurrentD1PlanningDatabase;

  const c = generationColumns(mapping);

  return yield* database
    .select()
    .from(mapping.generation.table)
    .where(and(eq(c.moduleId, moduleId), eq(c.proofId, proofId)))
    .limit(1);
});

const commandInsert = Effect.fn(function* (
  mapping: Mapping,
  moduleId: string,
  commandId: string,
  kind: "attempt" | "complete",
  decision: ProofCommandDecision,
  retentionUntil: number,
  nativeRetention?: SQL,
) {
  const database = yield* CurrentD1PlanningDatabase;

  return yield* statement(
    database.insert(mapping.command.table).values(
      driverValues(
        mapping.command.encodeInsert({
          moduleId,
          commandId,
          kind,
          decision,
          retentionUntilMillis: retentionUntil,
        }),
        nativeRetention === undefined ? [] : [[mapping.command.retentionUntil, nativeRetention]],
      ),
    ),
  );
});

const issuePlan = Effect.fn("Drizzle.issuePlan")(function* <A>(
  mapping: Mapping,
  input: Parameters<ProofPersistence["Service"]["issue"]>[0],
  prepare: PlanPrepare<ProofPersistence["Service"]["issue"], A>,
) {
  const database = yield* CurrentD1PlanningDatabase;
  const journal = yield* CurrentCommitJournal;

  const keys = mapping.scopeKeys({
    moduleId: input.record.moduleId,
    purpose: input.record.purpose,
    binding: input.record.binding,
  });

  const current = yield* authority(
    mapping,
    input.record.moduleId,
    input.record.purpose,
    input.record.binding,
  );

  const now = yield* readEngineNowMillis(mapping);
  const retentionUntil = now + input.policy.requestRetentionMillis;
  const rc = requestColumns(mapping);

  const existingRequest = (yield* database
    .select()
    .from(mapping.request.table)
    .where(and(eq(rc.moduleId, input.record.moduleId), eq(rc.requestId, input.record.requestId)))
    .limit(1))[0];

  if (existingRequest !== undefined) {
    const retained = yield* mapping.decodeInstant(existingRequest[mapping.request.retentionUntil]);

    if (retained > now) {
      if (existingRequest[mapping.request.fingerprint] !== input.record.fingerprint)
        return yield* conflict();
      const receipt = yield* mapping.request.decodeReceipt(existingRequest);

      return {
        receipt: prepare({ _tag: "Existing", receipt }, journal) as PreparedCommit<A>,
        statements: [],
      };
    }
  }
  const scopes = scopeEntries(keys, input.record.binding, "issue", input.policy);

  const initiallyAdmitted = yield* readScopeAdmission(
    mapping,
    input.record.moduleId,
    input.record.purpose,
    "issue",
    scopes,
    now,
  );

  const actionOpen = initiallyAdmitted.some((entry) => entry.kind === "action");
  const admitted = actionOpen ? initiallyAdmitted : [];

  const existingSeries = actionOpen
    ? (yield* readSeries(mapping, input.record.moduleId, input.record.purpose, keys.series))[0]
    : undefined;

  const seriesVersion = yield* allocateVersion(mapping);
  const active = existingSeries?.[mapping.series.activeProofId] as string | null | undefined;

  const activeGeneration =
    active === null || active === undefined
      ? undefined
      : (yield* readGeneration(mapping, input.record.moduleId, active))[0];

  if (
    active !== null &&
    active !== undefined &&
    (activeGeneration === undefined ||
      activeGeneration[mapping.generation.purpose] !== input.record.purpose)
  )
    return yield* unavailable();

  const matchesActiveBinding =
    activeGeneration !== undefined &&
    sameBinding(yield* mapping.generation.decodeBinding(activeGeneration), input.record.binding);

  const replacesLiveProof =
    activeGeneration !== undefined &&
    activeGeneration[mapping.generation.state] === "active" &&
    (yield* mapping.decodeInstant(activeGeneration[mapping.generation.expiresAt])) > now;

  const lastIssue =
    existingSeries?.[mapping.series.lastIssueAt] === null ||
    existingSeries?.[mapping.series.lastIssueAt] === undefined
      ? undefined
      : yield* mapping.decodeInstant(existingSeries[mapping.series.lastIssueAt]);

  const allowed =
    current.current &&
    input.eligible &&
    admitted.length === scopes.length &&
    input.record.issuedAtMillis <= now &&
    input.record.expiresAtMillis > now &&
    (!replacesLiveProof || matchesActiveBinding) &&
    (input.supersedes === undefined || input.supersedes === active) &&
    (lastIssue === undefined || now - lastIssue >= input.policy.abuse.resendCooldownMillis);

  const receipt = {
    requestId: input.record.requestId,
    reference: {
      proofId: input.record.proofId,
      purpose: input.record.purpose,
      keyId: input.record.verifier.keyId,
    },
  };

  const prepared = prepare(
    allowed ? { _tag: "Issued", record: input.record } : { _tag: "Suppressed", receipt },
    journal,
  );

  const statements: Statement<any>[] = [];
  const marker = `effect-auth-proof-guard:issue:${input.record.requestId}`;

  if (existingRequest !== undefined)
    statements.push(
      yield* statement(
        database
          .delete(mapping.request.table)
          .where(
            and(
              eq(rc.moduleId, input.record.moduleId),
              eq(rc.requestId, input.record.requestId),
              lte(rc.retentionUntil, mapping.d1.engineNow),
            ),
          ),
      ),
    );
  statements.push(
    yield* statement(
      database.insert(mapping.request.table).values(
        driverValues(
          mapping.request.encodeInsert({
            record: input.record,
            createdAtMillis: now,
            retentionUntilMillis: retentionUntil,
          }),
          [
            [mapping.request.createdAt, mapping.d1.engineNow],
            [
              mapping.request.retentionUntil,
              mapping.d1.engineInstantPlus(input.policy.requestRetentionMillis),
            ],
          ],
        ),
      ),
    ),
    ...(yield* anchorStatements(
      mapping,
      input.record.moduleId,
      input.record.purpose,
      "issue",
      actionOpen ? scopes : scopes.slice(0, 1),
      keys.series,
      seriesVersion,
      actionOpen,
    )),
    ...(yield* insertScopeStatements(
      mapping,
      input.record.moduleId,
      input.record.purpose,
      "issue",
      input.record.requestId,
      allowed ? scopes : [],
      now,
      retentionUntil,
      marker,
    )),
  );
  if (allowed) {
    const sc = seriesColumns(mapping);
    const gc = generationColumns(mapping);

    // Recheck replacement authority in the submitted batch. Generation bindings
    // are immutable; the version and stored binding also fence a changed row.
    const replacementCondition =
      activeGeneration === undefined
        ? sql`1 = 1`
        : sql`exists(select 1 from ${mapping.generation.table} where ${and(
            eq(gc.moduleId, input.record.moduleId),
            eq(gc.proofId, activeGeneration[mapping.generation.proofId]),
            eq(gc.version, activeGeneration[mapping.generation.version]),
            eq(
              column(mapping.generation.table, mapping.generation.binding),
              activeGeneration[mapping.generation.binding],
            ),
            matchesActiveBinding
              ? sql`1 = 1`
              : sql`(${gc.state} <> 'active' or ${gc.expiresAt} <= ${mapping.d1.engineNow})`,
          )})`;

    const seriesCondition = and(
      eq(sc.moduleId, input.record.moduleId),
      eq(sc.purpose, input.record.purpose),
      eq(sc.scopeKey, keys.series),
      active === null || active === undefined
        ? or(eq(sc.activeProofId, null), sql`${sc.activeProofId} is null`)
        : eq(sc.activeProofId, active),
      lastIssue === undefined
        ? sql`1 = 1`
        : lte(
            sc.lastIssueAt,
            mapping.d1.engineInstantMinus(input.policy.abuse.resendCooldownMillis),
          ),
    );

    statements.push(
      yield* assertion(
        and(
          current.condition,
          replacementCondition,
          sql`${mapping.d1.engineNowMillis} >= ${input.record.issuedAtMillis}`,
          sql`${mapping.d1.engineNow} < ${sql.param(mapping.encodeInstant(input.record.expiresAtMillis), generationColumns(mapping).expiresAt)}`,
          sql`exists(select 1 from ${mapping.series.table} where ${seriesCondition})`,
        )!,
        marker,
      ),
    );
    if (active !== null && active !== undefined)
      statements.push(
        yield* statement(
          database
            .update(mapping.generation.table)
            .set(updateValues([[mapping.generation.state, "superseded"]]))
            .where(
              and(
                eq(generationColumns(mapping).moduleId, input.record.moduleId),
                eq(generationColumns(mapping).proofId, active),
                eq(generationColumns(mapping).state, "active"),
              ),
            ),
        ),
      );
    statements.push(
      yield* statement(
        database.insert(mapping.generation.table).values(
          driverValues(
            mapping.generation.encodeInsert({
              record: input.record,
              seriesKey: keys.series,
              retentionUntilMillis: retentionUntil,
              state: "active",
              deliveryState: "new",
              policy: input.policy,
            }),
            [
              [
                mapping.generation.retentionUntil,
                mapping.d1.engineInstantPlus(input.policy.requestRetentionMillis),
              ],
            ],
          ),
        ),
      ),
      yield* statement(
        database
          .update(mapping.series.table)
          .set(
            updateValues([
              [mapping.series.activeProofId, input.record.proofId],
              [mapping.series.lastIssueAt, mapping.d1.engineNow],
              [mapping.series.version, seriesVersion],
            ]),
          )
          .where(
            and(
              eq(sc.moduleId, input.record.moduleId),
              eq(sc.purpose, input.record.purpose),
              eq(sc.scopeKey, keys.series),
            ),
          ),
      ),
    );
  }

  return {
    receipt: prepared as PreparedCommit<A>,
    statements,
    retryable: (cause: unknown) =>
      isMappedConstraintConflict(mapping.isRequestConflict, cause) ||
      isMappedConstraintConflict(mapping.isSeriesConflict, cause) ||
      isGuardFailure(cause, marker),
  };
});

const attemptPlan = Effect.fn("Drizzle.attemptPlan")(function* <A>(
  mapping: Mapping,
  input: Parameters<ProofPersistence["Service"]["attempt"]>[0],
  prepare: PlanPrepare<ProofPersistence["Service"]["attempt"], A>,
) {
  const database = yield* CurrentD1PlanningDatabase;
  const journal = yield* CurrentCommitJournal;

  const keys = mapping.scopeKeys({
    moduleId: input.moduleId,
    purpose: input.purpose,
    binding: input.binding,
  });

  const current = yield* authority(mapping, input.moduleId, input.purpose, input.binding);
  const command = commandColumns(mapping);

  const existingCommand = (yield* database
    .select()
    .from(mapping.command.table)
    .where(and(eq(command.moduleId, input.moduleId), eq(command.commandId, input.continuationId)))
    .limit(1))[0];

  if (existingCommand !== undefined) {
    if (existingCommand[mapping.command.decision] === "rejected")
      return {
        receipt: prepare({ _tag: "Rejected" }, journal) as PreparedCommit<A>,
        statements: [],
      };

    return yield* unavailable();
  }
  const now = yield* readEngineNowMillis(mapping);
  const scopes = scopeEntries(keys, input.binding, "attempt", input.policy);

  const initiallyAdmitted = yield* readScopeAdmission(
    mapping,
    input.moduleId,
    input.purpose,
    "attempt",
    scopes,
    now,
  );

  const actionOpen = initiallyAdmitted.some((entry) => entry.kind === "action");
  const admitted = actionOpen ? initiallyAdmitted : [];

  const series = actionOpen
    ? (yield* readSeries(mapping, input.moduleId, input.purpose, keys.series))[0]
    : undefined;

  const generation = (yield* readGeneration(mapping, input.moduleId, input.proofId))[0];
  const fc = failureColumns(mapping);

  const failureRows = yield* database
    .select({ total: count() })
    .from(mapping.failureEvent.table)
    .where(
      and(
        eq(fc.moduleId, input.moduleId),
        eq(fc.purpose, input.purpose),
        eq(fc.seriesKey, keys.series),
        gte(fc.occurredAt, mapping.encodeInstant(now - input.policy.abuse.attempts.windowMillis)),
      ),
    );

  const failures = Number(failureRows[0]?.total ?? 0);

  const storedBinding =
    generation === undefined ? undefined : yield* mapping.generation.decodeBinding(generation);

  const expires =
    generation === undefined
      ? undefined
      : yield* mapping.decodeInstant(generation[mapping.generation.expiresAt]);

  const currentGeneration =
    generation !== undefined &&
    generation[mapping.generation.purpose] === input.purpose &&
    generation[mapping.generation.state] === "active" &&
    series?.[mapping.series.activeProofId] === input.proofId &&
    storedBinding !== undefined &&
    sameBinding(storedBinding, input.binding) &&
    expires !== undefined &&
    expires > now;

  const candidateMatches =
    generation !== undefined &&
    input.candidate !== undefined &&
    generation[mapping.generation.verifierKeyId] === input.candidate.keyId &&
    generation[mapping.generation.verifierDigest] === input.candidate.digest;

  const accepted =
    current.current &&
    currentGeneration &&
    candidateMatches &&
    admitted.length === scopes.length &&
    failures < input.policy.maximumFailedAttempts;

  const retentionUntil = now + input.policy.requestRetentionMillis;
  const seriesVersion = yield* allocateVersion(mapping);

  const statements: Statement<any>[] = [
    ...(yield* anchorStatements(
      mapping,
      input.moduleId,
      input.purpose,
      "attempt",
      actionOpen ? scopes : scopes.slice(0, 1),
      keys.series,
      seriesVersion,
      actionOpen,
    )),
    ...(yield* insertScopeStatements(
      mapping,
      input.moduleId,
      input.purpose,
      "attempt",
      input.continuationId,
      admitted,
      now,
      retentionUntil,
      `effect-auth-proof-guard:attempt:${input.continuationId}`,
    )),
  ];

  const marker = `effect-auth-proof-guard:attempt:${input.continuationId}`;

  if (!accepted) {
    const prepared = prepare({ _tag: "Rejected" }, journal) as PreparedCommit<A>;

    if (
      admitted.length === scopes.length &&
      current.current &&
      currentGeneration &&
      !candidateMatches &&
      failures < input.policy.maximumFailedAttempts
    ) {
      const gc = generationColumns(mapping);
      const sc = seriesColumns(mapping);

      statements.push(
        yield* assertion(
          and(
            current.condition,
            sql`exists(select 1 from ${mapping.series.table} where ${sc.moduleId} = ${sql.param(input.moduleId, sc.moduleId)} and ${sc.purpose} = ${sql.param(input.purpose, sc.purpose)} and ${sc.scopeKey} = ${sql.param(keys.series, sc.scopeKey)} and ${sc.activeProofId} = ${sql.param(input.proofId, sc.activeProofId)})`,
            sql`exists(select 1 from ${mapping.generation.table} where ${gc.moduleId} = ${sql.param(input.moduleId, gc.moduleId)} and ${gc.proofId} = ${sql.param(input.proofId, gc.proofId)} and ${gc.state} = 'active' and ${gc.expiresAt} > ${mapping.d1.engineNow})`,
            failureCondition(mapping, input.moduleId, input.purpose, keys.series, input.policy),
          )!,
          marker,
        ),
        yield* statement(
          database.insert(mapping.failureEvent.table).values(
            driverValues(
              mapping.failureEvent.encodeInsert({
                moduleId: input.moduleId,
                purpose: input.purpose,
                seriesKey: keys.series,
                commandId: input.continuationId,
                occurredAtMillis: now,
                retentionUntilMillis: retentionUntil,
              }),
              [
                [mapping.failureEvent.occurredAt, mapping.d1.engineNow],
                [
                  mapping.failureEvent.retentionUntil,
                  mapping.d1.engineInstantPlus(input.policy.requestRetentionMillis),
                ],
              ],
            ),
          ),
        ),
      );
    }
    statements.push(
      yield* commandInsert(
        mapping,
        input.moduleId,
        input.continuationId,
        "attempt",
        "rejected",
        retentionUntil,
        mapping.d1.engineInstantPlus(input.policy.requestRetentionMillis),
      ),
    );

    return {
      receipt: prepared,
      statements,
      retryable: (cause: unknown) =>
        isMappedConstraintConflict(mapping.isCommandConflict, cause) ||
        isMappedConstraintConflict(mapping.isSeriesConflict, cause) ||
        isGuardFailure(cause, marker),
    };
  }
  const version = yield* allocateVersion(mapping);
  const continuationExpires = Math.min(expires!, now + input.policy.continuationLifetimeMillis);

  const continuation: ProofContinuationRecord = {
    moduleId: input.moduleId,
    purpose: input.purpose,
    continuationId: input.continuationId,
    digest: input.continuationDigest,
    proofId: input.proofId,
    seriesKey: keys.series,
    binding: input.binding,
    expiresAtMillis: continuationExpires,
    version,
  };

  const decision: ProofAttemptDecision = {
    _tag: "Accepted",
    continuation: {
      continuationId: input.continuationId,
      purpose: input.purpose,
      expiresAtMillis: continuationExpires,
    },
  };

  const prepared = prepare(decision, journal) as PreparedCommit<A>;
  const gc = generationColumns(mapping);
  const sc = seriesColumns(mapping);

  statements.push(
    yield* assertion(
      and(
        current.condition,
        failureCondition(mapping, input.moduleId, input.purpose, keys.series, input.policy),
        sql`exists(select 1 from ${mapping.series.table} where ${sc.moduleId} = ${sql.param(input.moduleId, sc.moduleId)} and ${sc.purpose} = ${sql.param(input.purpose, sc.purpose)} and ${sc.scopeKey} = ${sql.param(keys.series, sc.scopeKey)} and ${sc.activeProofId} = ${sql.param(input.proofId, sc.activeProofId)})`,
        sql`exists(select 1 from ${mapping.generation.table} where ${gc.moduleId} = ${sql.param(input.moduleId, gc.moduleId)} and ${gc.proofId} = ${sql.param(input.proofId, gc.proofId)} and ${gc.purpose} = ${sql.param(input.purpose, gc.purpose)} and ${gc.state} = 'active' and ${gc.verifierKeyId} = ${sql.param(input.candidate!.keyId, gc.verifierKeyId)} and ${gc.verifierDigest} = ${sql.param(input.candidate!.digest, gc.verifierDigest)} and ${gc.expiresAt} > ${mapping.d1.engineNow})`,
      )!,
      marker,
    ),
    yield* commandInsert(
      mapping,
      input.moduleId,
      input.continuationId,
      "attempt",
      "accepted",
      retentionUntil,
      mapping.d1.engineInstantPlus(input.policy.requestRetentionMillis),
    ),
    yield* statement(
      database
        .update(mapping.generation.table)
        .set(updateValues([[mapping.generation.state, "consumed"]]))
        .where(
          and(
            eq(gc.moduleId, input.moduleId),
            eq(gc.proofId, input.proofId),
            eq(gc.state, "active"),
          ),
        ),
    ),
    yield* statement(
      database.insert(mapping.continuation.table).values(
        driverValues(
          mapping.continuation.encodeInsert({
            ...continuation,
            retentionUntilMillis: retentionUntil,
          }),
          [
            [
              mapping.continuation.retentionUntil,
              mapping.d1.engineInstantPlus(input.policy.requestRetentionMillis),
            ],
          ],
        ),
      ),
    ),
  );

  return {
    receipt: prepared,
    statements,
    retryable: (cause: unknown) =>
      isMappedConstraintConflict(mapping.isCommandConflict, cause) ||
      isMappedConstraintConflict(mapping.isSeriesConflict, cause) ||
      isGuardFailure(cause, marker),
  };
});

const inspectD1Completion = Effect.fn("DrizzleD1Proof.inspectCompletion")(function* (
  mapping: Mapping,
  input: ProofCompletionPlan["input"],
) {
  const database = yield* CurrentD1PlanningDatabase;

  const keys = mapping.scopeKeys({
    moduleId: input.moduleId,
    purpose: input.purpose,
    binding: input.binding,
  });

  const current = yield* authority(mapping, input.moduleId, input.purpose, input.binding);
  const c = continuationColumns(mapping);

  const row = (yield* database
    .select()
    .from(mapping.continuation.table)
    .where(and(eq(c.moduleId, input.moduleId), eq(c.continuationId, input.continuationId)))
    .limit(1))[0];

  const now = yield* readEngineNowMillis(mapping);
  const record = row === undefined ? undefined : yield* mapping.continuation.decode(row);

  const accepted =
    current.current &&
    record !== undefined &&
    record.moduleId === input.moduleId &&
    record.continuationId === input.continuationId &&
    record.purpose === input.purpose &&
    record.digest === input.continuationDigest &&
    record.seriesKey === keys.series &&
    sameBinding(record.binding, input.binding) &&
    row[mapping.continuation.consumed] === false &&
    record.expiresAtMillis > now;

  const immutable = [
    mapping.continuation.moduleId,
    mapping.continuation.purpose,
    mapping.continuation.continuationId,
    mapping.continuation.digest,
    mapping.continuation.proofId,
    mapping.continuation.seriesKey,
    mapping.continuation.binding,
    mapping.continuation.expiresAt,
    mapping.continuation.version,
    mapping.continuation.retentionUntil,
  ];

  const exact =
    row === undefined
      ? sql`false`
      : and(...immutable.map((key) => eq(column(mapping.continuation.table, key), row[key])))!;

  return {
    accepted,
    record,
    row,
    columns: c,
    condition: and(
      current.condition,
      sql`exists(select 1 from ${mapping.continuation.table} where ${exact} and ${c.consumed} = ${sql.param(false, c.consumed)} and ${column(mapping.continuation.table, mapping.continuation.expiresAt)} > ${mapping.d1.engineNow})`,
    )!,
    appliedCondition:
      row === undefined
        ? sql`false`
        : sql`exists(select 1 from ${mapping.continuation.table} where ${exact} and ${c.consumed} = ${sql.param(true, c.consumed)} and ${column(mapping.continuation.table, mapping.continuation.expiresAt)} > ${mapping.d1.engineNow})`,
  };
});

/** Read-only preflight plus its exact final-engine-time batch predicate. */
export const checkD1ProofCompletion = Effect.fn("Drizzle.checkD1ProofCompletion")(function* (
  mapping: Mapping,
  input: ProofCompletionPlan["input"],
) {
  return yield* inspectD1Completion(mapping, input);
});

const completionPlan = Effect.fn("Drizzle.completionPlan")(function* <A>(
  mapping: Mapping,
  input: Parameters<ProofPersistence["Service"]["complete"]>[0],
  prepare: PrepareProofCommit<ProofCompletionDecision, A>,
) {
  const database = yield* CurrentD1PlanningDatabase;
  const journal = yield* CurrentCommitJournal;

  const inspected = yield* inspectD1Completion(mapping, input);
  const { accepted, record, columns: c } = inspected;
  const decision: ProofCompletionDecision = accepted ? "completed" : "rejected";
  const receipt = prepare(decision, journal) as PreparedCommit<A>;

  if (!accepted) return { receipt, statements: [] };

  const postconditions = [
    yield* assertion(
      and(
        inspected.appliedCondition,
        sql`exists(select 1 from ${mapping.command.table} where ${column(mapping.command.table, mapping.command.moduleId)} = ${sql.param(input.moduleId, column(mapping.command.table, mapping.command.moduleId))} and ${column(mapping.command.table, mapping.command.commandId)} = ${sql.param(input.continuationDigest, column(mapping.command.table, mapping.command.commandId))} and ${column(mapping.command.table, mapping.command.kind)} = ${sql.param("complete", column(mapping.command.table, mapping.command.kind))} and ${column(mapping.command.table, mapping.command.decision)} = ${sql.param("completed", column(mapping.command.table, mapping.command.decision))} and ${column(mapping.command.table, mapping.command.retentionUntil)} = ${sql.param(mapping.encodeInstant(record!.expiresAtMillis), column(mapping.command.table, mapping.command.retentionUntil))})`,
      )!,
      `effect-auth-proof-guard:complete:${input.continuationId}`,
    ),
  ];

  const statements = [
    yield* assertion(
      inspected.condition,
      `effect-auth-proof-guard:complete:${input.continuationId}`,
    ),
    yield* statement(
      database
        .update(mapping.continuation.table)
        .set(updateValues([[mapping.continuation.consumed, true]]))
        .where(
          and(
            eq(c.moduleId, input.moduleId),
            eq(c.continuationId, input.continuationId),
            eq(c.digest, input.continuationDigest),
            eq(c.consumed, false),
          ),
        ),
    ),
    yield* commandInsert(
      mapping,
      input.moduleId,
      input.continuationDigest,
      "complete",
      "completed",
      record!.expiresAtMillis,
    ),
    ...postconditions,
  ];

  return {
    receipt,
    statements,
    postconditions,
    retryable: (cause: unknown) =>
      isMappedConstraintConflict(mapping.isCommandConflict, cause) ||
      isGuardFailure(cause, `effect-auth-proof-guard:complete:${input.continuationId}`),
  };
});

const makeProofPlans = (mapping: Mapping) => {
  const run = <A, E, R>(plan: Effect.Effect<Planned<A>, E, R>) =>
    Effect.gen(function* () {
      if (!validConstraints(mapping)) return yield* unavailable();

      return yield* plan;
    });

  return {
    issue: <A>(
      input: Parameters<ProofPersistence["Service"]["issue"]>[0],
      prepare: PlanPrepare<ProofPersistence["Service"]["issue"], A>,
    ) =>
      run(
        Effect.gen(function* () {
          return yield* issuePlan(mapping, input, prepare);
        }),
      ),
    attempt: <A>(
      input: Parameters<ProofPersistence["Service"]["attempt"]>[0],
      prepare: PlanPrepare<ProofPersistence["Service"]["attempt"], A>,
    ) =>
      run(
        Effect.gen(function* () {
          return yield* attemptPlan(mapping, input, prepare);
        }),
      ),
    complete: <A>(
      input: Parameters<ProofPersistence["Service"]["complete"]>[0],
      prepare: PlanPrepare<ProofPersistence["Service"]["complete"], A>,
    ) =>
      run(
        Effect.gen(function* () {
          return yield* completionPlan(mapping, input, prepare);
        }),
      ),
    claimDelivery: <A>(
      input: Parameters<ProofPersistence["Service"]["claimDelivery"]>[0],
      prepare: PlanPrepare<ProofPersistence["Service"]["claimDelivery"], A>,
    ) =>
      Effect.gen(function* () {
        const database = yield* CurrentD1PlanningDatabase;

        return yield* run(
          Effect.gen(function* () {
            const journal = yield* CurrentCommitJournal;

            const row = (yield* readGeneration(mapping, input.moduleId, input.proofId))[0];
            const now = yield* readEngineNowMillis(mapping);
            const c = generationColumns(mapping);

            if (row === undefined)
              return { receipt: prepare({ _tag: "Declined" }, journal), statements: [] };
            const expires = yield* mapping.decodeInstant(row[mapping.generation.expiresAt]);

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

            const state = row[mapping.generation.deliveryState] as string;

            const expiredClaim =
              state === "claimed" && claimDeadline !== undefined && claimDeadline <= now;

            const effectiveState = expiredClaim ? "ambiguous" : state;

            const canClaim =
              row[mapping.generation.version] === input.version &&
              row[mapping.generation.deliveryId] === input.deliveryId &&
              row[mapping.generation.state] === "active" &&
              expires > now &&
              Number(row[mapping.generation.sendCount]) < input.policy.maximumDeliveryAttempts &&
              (effectiveState === "new" ||
                (effectiveState === "ambiguous" &&
                  input.allowAmbiguousRetry &&
                  (retryAt === undefined || retryAt <= now)));

            if (!canClaim) {
              const statements = expiredClaim
                ? [
                    yield* statement(
                      database
                        .update(mapping.generation.table)
                        .set(updateValues([[mapping.generation.deliveryState, "ambiguous"]]))
                        .where(
                          and(
                            eq(c.moduleId, input.moduleId),
                            eq(c.proofId, input.proofId),
                            eq(c.deliveryState, "claimed"),
                            lte(c.claimDeadline, mapping.d1.engineNow),
                          ),
                        ),
                    ),
                  ]
                : [];

              return { receipt: prepare({ _tag: "Declined" }, journal), statements };
            }
            const claimVersion = yield* allocateVersion(mapping);
            const decision: ProofDeliveryClaim = { _tag: "Claimed", claimVersion };

            const condition = and(
              eq(c.moduleId, input.moduleId),
              eq(c.proofId, input.proofId),
              eq(c.version, input.version),
              eq(c.deliveryId, input.deliveryId),
              eq(c.state, "active"),
              sql`${c.expiresAt} > ${mapping.d1.engineNow}`,
              sql`${c.sendCount} < ${input.policy.maximumDeliveryAttempts}`,
              effectiveState === "new"
                ? eq(c.deliveryState, "new")
                : and(
                    eq(c.deliveryState, "ambiguous"),
                    or(sql`${c.retryAt} is null`, lte(c.retryAt, mapping.d1.engineNow)),
                  ),
            )!;

            return {
              receipt: prepare(decision, journal),
              statements: [
                yield* assertion(
                  sql`exists(select 1 from ${mapping.generation.table} where ${condition})`,
                  `effect-auth-proof-guard:claim:${input.proofId}`,
                ),
                yield* statement(
                  database
                    .update(mapping.generation.table)
                    .set(
                      updateValues([
                        [
                          mapping.generation.sendCount,
                          Number(row[mapping.generation.sendCount]) + 1,
                        ],
                        [mapping.generation.deliveryState, "claimed"],
                        [mapping.generation.claimVersion, claimVersion],
                        [
                          mapping.generation.claimDeadline,
                          mapping.d1.engineInstantPlus(input.policy.deliveryClaimMillis),
                        ],
                        [
                          mapping.generation.retryAt,
                          mapping.d1.engineInstantPlus(input.policy.deliveryRetryMillis),
                        ],
                      ]),
                    )
                    .where(condition),
                ),
              ],
              retryable: (cause: unknown) =>
                isGuardFailure(cause, `effect-auth-proof-guard:claim:${input.proofId}`),
            };
          }),
        );
      }),
    settleDelivery: <A>(
      input: Parameters<ProofPersistence["Service"]["settleDelivery"]>[0],
      prepare: PlanPrepare<ProofPersistence["Service"]["settleDelivery"], A>,
    ) =>
      Effect.gen(function* () {
        const database = yield* CurrentD1PlanningDatabase;

        return yield* run(
          Effect.gen(function* () {
            const journal = yield* CurrentCommitJournal;

            const row = (yield* readGeneration(mapping, input.moduleId, input.proofId))[0];
            const receipt = prepare(undefined, journal);

            if (
              row === undefined ||
              row[mapping.generation.version] !== input.version ||
              row[mapping.generation.deliveryId] !== input.deliveryId ||
              row[mapping.generation.claimVersion] !== input.claimVersion ||
              row[mapping.generation.deliveryState] !== "claimed"
            )
              return { receipt, statements: [] };
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
                mapping.d1.engineInstantPlus(Number(row[mapping.generation.deliveryRetryMillis])),
              ]);
            if (outcome._tag === "DefiniteFailure")
              values.push([mapping.generation.state, "cancelled"]);

            const condition = and(
              eq(c.moduleId, input.moduleId),
              eq(c.proofId, input.proofId),
              eq(c.version, input.version),
              eq(c.deliveryId, input.deliveryId),
              eq(c.claimVersion, input.claimVersion),
              eq(c.deliveryState, "claimed"),
            );

            const statements: Statement<any>[] = [
              yield* statement(
                database
                  .update(mapping.generation.table)
                  .set(updateValues(values))
                  .where(condition),
              ),
            ];

            if (outcome._tag === "DefiniteFailure") {
              const sc = seriesColumns(mapping);

              statements.push(
                yield* statement(
                  database
                    .update(mapping.series.table)
                    .set(updateValues([[mapping.series.activeProofId, null]]))
                    .where(
                      and(
                        eq(sc.moduleId, input.moduleId),
                        eq(sc.purpose, row[mapping.generation.purpose]),
                        eq(sc.scopeKey, row[mapping.generation.seriesKey]),
                        eq(sc.activeProofId, input.proofId),
                        sql`exists(select 1 from ${mapping.generation.table} where ${c.moduleId} = ${sql.param(input.moduleId, c.moduleId)} and ${c.proofId} = ${sql.param(input.proofId, c.proofId)} and ${c.version} = ${sql.param(input.version, c.version)} and ${c.deliveryId} = ${sql.param(input.deliveryId, c.deliveryId)} and ${c.claimVersion} = ${sql.param(input.claimVersion, c.claimVersion)} and ${c.deliveryState} = 'failed' and ${c.state} = 'cancelled')`,
                      ),
                    ),
                ),
              );
            }

            return { receipt, statements };
          }),
        );
      }),
    cancel: <A>(
      input: Parameters<ProofPersistence["Service"]["cancel"]>[0],
      prepare: PlanPrepare<ProofPersistence["Service"]["cancel"], A>,
    ) =>
      Effect.gen(function* () {
        const database = yield* CurrentD1PlanningDatabase;

        return yield* run(
          Effect.gen(function* () {
            const journal = yield* CurrentCommitJournal;

            const keys = mapping.scopeKeys({
              moduleId: input.moduleId,
              purpose: input.purpose,
              binding: input.binding,
            });

            const current = yield* authority(mapping, input.moduleId, input.purpose, input.binding);

            const series = (yield* readSeries(
              mapping,
              input.moduleId,
              input.purpose,
              keys.series,
            ))[0];

            const receipt = prepare(undefined, journal);
            const active = series?.[mapping.series.activeProofId] as string | null | undefined;

            if (!current.current || active === null || active === undefined)
              return { receipt, statements: [] };
            const generation = (yield* readGeneration(mapping, input.moduleId, active))[0];

            const storedBinding =
              generation === undefined
                ? undefined
                : yield* mapping.generation.decodeBinding(generation);

            if (storedBinding === undefined || !sameBinding(storedBinding, input.binding))
              return { receipt, statements: [] };
            const gc = generationColumns(mapping);
            const sc = seriesColumns(mapping);
            const marker = `effect-auth-proof-guard:cancel:${active}`;

            return {
              receipt,
              statements: [
                yield* assertion(
                  and(
                    current.condition,
                    sql`exists(select 1 from ${mapping.series.table} where ${sc.moduleId} = ${sql.param(input.moduleId, sc.moduleId)} and ${sc.purpose} = ${sql.param(input.purpose, sc.purpose)} and ${sc.scopeKey} = ${sql.param(keys.series, sc.scopeKey)} and ${sc.activeProofId} = ${sql.param(active, sc.activeProofId)})`,
                    sql`exists(select 1 from ${mapping.generation.table} where ${gc.moduleId} = ${sql.param(input.moduleId, gc.moduleId)} and ${gc.proofId} = ${sql.param(active, gc.proofId)} and ${gc.state} = 'active')`,
                  )!,
                  marker,
                ),
                yield* statement(
                  database
                    .update(mapping.generation.table)
                    .set(updateValues([[mapping.generation.state, "cancelled"]]))
                    .where(
                      and(
                        eq(gc.moduleId, input.moduleId),
                        eq(gc.proofId, active),
                        eq(gc.state, "active"),
                      ),
                    ),
                ),
                yield* statement(
                  database
                    .update(mapping.series.table)
                    .set(updateValues([[mapping.series.activeProofId, null]]))
                    .where(
                      and(
                        eq(sc.moduleId, input.moduleId),
                        eq(sc.purpose, input.purpose),
                        eq(sc.scopeKey, keys.series),
                        eq(sc.activeProofId, active),
                      ),
                    ),
                ),
              ],
              retryable: (cause: unknown) => isGuardFailure(cause, marker),
            };
          }),
        );
      }),
    cleanup: <A>(
      input: Parameters<ProofPersistence["Service"]["cleanup"]>[0],
      prepare: PlanPrepare<ProofPersistence["Service"]["cleanup"], A>,
    ) =>
      Effect.gen(function* () {
        const database = yield* CurrentD1PlanningDatabase;

        return yield* run(
          Effect.gen(function* () {
            const journal = yield* CurrentCommitJournal;

            const now = yield* readEngineNowMillis(mapping);
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

            const take = <A>(effect: Effect.Effect<ReadonlyArray<A>, AdapterFailure>) =>
              effect.pipe(
                Effect.map((rows) => {
                  if (rows.length > remaining) hasMore = true;
                  const selected = rows.slice(0, remaining);

                  remaining -= selected.length;

                  return selected;
                }),
              );

            const continuations = yield* take(
              database
                .select({ continuationId: cc.continuationId })
                .from(mapping.continuation.table)
                .where(and(eq(cc.moduleId, input.moduleId), lte(cc.retentionUntil, nativeNow)))
                .limit(remaining + 1),
            );

            const generations = yield* take(
              database
                .select({ proofId: gc.proofId })
                .from(mapping.generation.table)
                .where(and(eq(gc.moduleId, input.moduleId), lte(gc.retentionUntil, nativeNow)))
                .limit(remaining + 1),
            );

            const requests = yield* take(
              database
                .select({ requestId: rc.requestId })
                .from(mapping.request.table)
                .where(and(eq(rc.moduleId, input.moduleId), lte(rc.retentionUntil, nativeNow)))
                .limit(remaining + 1),
            );

            const abuse = yield* take(
              database
                .select({
                  action: ac.action,
                  scopeKind: ac.scopeKind,
                  scopeKey: ac.scopeKey,
                  commandId: ac.commandId,
                })
                .from(mapping.abuseEvent.table)
                .where(and(eq(ac.moduleId, input.moduleId), lte(ac.retentionUntil, nativeNow)))
                .limit(remaining + 1),
            );

            const failures = yield* take(
              database
                .select({ seriesKey: fc.seriesKey, commandId: fc.commandId })
                .from(mapping.failureEvent.table)
                .where(and(eq(fc.moduleId, input.moduleId), lte(fc.retentionUntil, nativeNow)))
                .limit(remaining + 1),
            );

            const commands = yield* take(
              database
                .select({ commandId: mc.commandId })
                .from(mapping.command.table)
                .where(and(eq(mc.moduleId, input.moduleId), lte(mc.retentionUntil, nativeNow)))
                .limit(remaining + 1),
            );

            const series = yield* take(
              database
                .select({ purpose: sc.purpose, scopeKey: sc.scopeKey })
                .from(mapping.series.table)
                .where(
                  and(
                    eq(sc.moduleId, input.moduleId),
                    isNull(sc.activeProofId),
                    notExists(
                      database
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
                      database
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
                )
                .limit(remaining + 1),
            );

            const rateScopes = yield* take(
              database
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
                      database
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
                )
                .limit(remaining + 1),
            );

            const marker = `effect-auth-proof-guard:cleanup:${input.moduleId}:${now}`;
            const statements: Statement<any>[] = [];

            const guardedDelete = Effect.fn(function* (
              condition: SQL,
              query: { readonly toSQL: () => { sql: string; params: unknown[] } },
            ) {
              statements.push(yield* assertion(condition, marker), yield* statement(query));
            });

            for (const row of continuations) {
              const condition = and(
                eq(cc.moduleId, input.moduleId),
                eq(cc.continuationId, row.continuationId),
                lte(cc.retentionUntil, mapping.d1.engineNow),
              )!;

              yield* guardedDelete(
                sql`exists(select 1 from ${mapping.continuation.table} where ${condition})`,
                database.delete(mapping.continuation.table).where(condition),
              );
            }
            for (const row of generations) {
              const condition = and(
                eq(gc.moduleId, input.moduleId),
                eq(gc.proofId, row.proofId),
                lte(gc.retentionUntil, mapping.d1.engineNow),
              )!;

              yield* guardedDelete(
                sql`exists(select 1 from ${mapping.generation.table} where ${condition})`,
                database
                  .update(mapping.series.table)
                  .set(updateValues([[mapping.series.activeProofId, null]]))
                  .where(and(eq(sc.moduleId, input.moduleId), eq(sc.activeProofId, row.proofId))),
              );
              statements.push(
                yield* statement(database.delete(mapping.generation.table).where(condition)),
              );
            }
            for (const row of requests) {
              const condition = and(
                eq(rc.moduleId, input.moduleId),
                eq(rc.requestId, row.requestId),
                lte(rc.retentionUntil, mapping.d1.engineNow),
              )!;

              yield* guardedDelete(
                sql`exists(select 1 from ${mapping.request.table} where ${condition})`,
                database.delete(mapping.request.table).where(condition),
              );
            }
            for (const row of abuse) {
              const condition = and(
                eq(ac.moduleId, input.moduleId),
                eq(ac.action, row.action),
                eq(ac.scopeKind, row.scopeKind),
                eq(ac.scopeKey, row.scopeKey),
                eq(ac.commandId, row.commandId),
                lte(ac.retentionUntil, mapping.d1.engineNow),
              )!;

              yield* guardedDelete(
                sql`exists(select 1 from ${mapping.abuseEvent.table} where ${condition})`,
                database.delete(mapping.abuseEvent.table).where(condition),
              );
            }
            for (const row of failures) {
              const condition = and(
                eq(fc.moduleId, input.moduleId),
                eq(fc.seriesKey, row.seriesKey),
                eq(fc.commandId, row.commandId),
                lte(fc.retentionUntil, mapping.d1.engineNow),
              )!;

              yield* guardedDelete(
                sql`exists(select 1 from ${mapping.failureEvent.table} where ${condition})`,
                database.delete(mapping.failureEvent.table).where(condition),
              );
            }
            for (const row of commands) {
              const condition = and(
                eq(mc.moduleId, input.moduleId),
                eq(mc.commandId, row.commandId),
                lte(mc.retentionUntil, mapping.d1.engineNow),
              )!;

              yield* guardedDelete(
                sql`exists(select 1 from ${mapping.command.table} where ${condition})`,
                database.delete(mapping.command.table).where(condition),
              );
            }
            for (const row of series) {
              const condition = and(
                eq(sc.moduleId, input.moduleId),
                eq(sc.purpose, row.purpose),
                eq(sc.scopeKey, row.scopeKey),
                isNull(sc.activeProofId),
                notExists(
                  database
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
              )!;

              yield* guardedDelete(
                sql`exists(select 1 from ${mapping.series.table} where ${condition})`,
                database.delete(mapping.series.table).where(condition),
              );
            }
            for (const row of rateScopes) {
              const condition = and(
                eq(rsc.moduleId, input.moduleId),
                eq(rsc.purpose, row.purpose),
                eq(rsc.action, row.action),
                eq(rsc.scopeKind, row.scopeKind),
                eq(rsc.scopeKey, row.scopeKey),
                notExists(
                  database
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
              )!;

              yield* guardedDelete(
                sql`exists(select 1 from ${mapping.rateScope.table} where ${condition})`,
                database.delete(mapping.rateScope.table).where(condition),
              );
            }
            // Removing the final history row can make an anchor eligible only after this
            // transaction/batch commits. One extra page lets the caller reclaim it.
            hasMore ||= generations.length > 0 || failures.length > 0 || abuse.length > 0;
            const result: ProofCleanupResult = { removed: input.limit - remaining, hasMore };

            return {
              receipt: prepare(result, journal),
              statements,
              retryable: (cause: unknown) => isGuardFailure(cause, marker),
            };
          }),
        );
      }),
  };
};

export const makeD1ProofPersistenceServices = Effect.fnUntraced(function* <
  Rq extends AnySQLiteTable,
  S extends AnySQLiteTable,
  G extends AnySQLiteTable,
  Cn extends AnySQLiteTable,
  Rs extends AnySQLiteTable,
  A extends AnySQLiteTable,
  F extends AnySQLiteTable,
  C extends AnySQLiteTable,
  Sub extends AnySQLiteTable,
  I extends AnySQLiteTable,
  Cr extends AnySQLiteTable,
  NativeId,
>(mapping: D1ProofPersistenceMapping<Rq, S, G, Cn, Rs, A, F, C, Sub, I, Cr, NativeId>) {
  const database = yield* DatabaseService;

  yield* validateDrizzleStorage(mapping).pipe(
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
    Effect.mapError(unavailable),
  );

  const hooks = yield* LifecycleHooks;
  const plans = makeProofPlans(mapping as unknown as Mapping);

  const run = <Out, Err, Env>(plan: Effect.Effect<Planned<Out>, Err, Env>) =>
    Effect.gen(function* () {
      if (yield* hasCommitScope) return yield* unavailable();

      return yield* executeStandalone(plan, 2);
    }).pipe(
      Effect.provideService(CurrentD1PlanningDatabase, database),
      Effect.provideService(LifecycleHooks, hooks),
    );

  const service: ProofPersistence["Service"] = {
    issue: (input, prepare) => run(plans.issue(input, prepare)).pipe(translateIssueFailure),
    attempt: (input, prepare) => run(plans.attempt(input, prepare)).pipe(translateFailure),
    complete: (input, prepare) => run(plans.complete(input, prepare)).pipe(translateFailure),
    claimDelivery: (input, prepare) =>
      run(plans.claimDelivery(input, prepare)).pipe(translateFailure),
    settleDelivery: (input, prepare) =>
      run(plans.settleDelivery(input, prepare)).pipe(translateFailure),
    cancel: (input, prepare) => run(plans.cancel(input, prepare)).pipe(translateFailure),
    cleanup: (input, prepare) => run(plans.cleanup(input, prepare)).pipe(translateFailure),
  };

  return { proofPersistence: service };
});

type CoordinatorError<E> = E | ProofUnavailable | HookConfigurationError;

/**
 * Owns one proof transition plus application statements in one D1 batch. It
 * never replays the owner effect. A reserved guard or named race becomes
 * ProofUnavailable so the caller can retry the entire command with fresh secrets.
 */
export function coordinateD1ProofPersistence<
  Rq extends AnySQLiteTable,
  S extends AnySQLiteTable,
  G extends AnySQLiteTable,
  Cn extends AnySQLiteTable,
  Rs extends AnySQLiteTable,
  Aev extends AnySQLiteTable,
  F extends AnySQLiteTable,
  C extends AnySQLiteTable,
  Sub extends AnySQLiteTable,
  I extends AnySQLiteTable,
  Cr extends AnySQLiteTable,
  NativeId,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: D1ProofPersistenceMapping<Rq, S, G, Cn, Rs, Aev, F, C, Sub, I, Cr, NativeId>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  CoordinatorError<E> | DatabaseError,
  Exclude<R, ProofPersistence | D1BatchStatements> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    Effect.gen(function* () {
      yield* validateDrizzleStorage(options.mapping).pipe(Effect.mapError(unavailable));
      const hooks = yield* LifecycleHooks;

      if (yield* hasCommitScope) return yield* unavailable();

      const result = yield* coordinateCommit(
        () =>
          Effect.gen(function* () {
            const statements: Statement<any>[] = [];
            let mutation: Planned<any> | undefined;

            const nativeCollector = D1BatchStatements.of({
              append: (statement) => Effect.sync(() => statements.push(statement)),
            });

            const owner = yield* makeD1Owner(unavailable()).pipe(
              Effect.provideService(D1BatchStatements, nativeCollector),
            );

            const plans = makeProofPlans(options.mapping as unknown as Mapping);

            const run = <Out, Err, Env>(plan: Effect.Effect<Planned<Out>, Err, Env>) =>
              coordinateCommit(
                () =>
                  Effect.gen(function* () {
                    const journal = yield* CurrentCommitJournal;
                    const planned = yield* plan;

                    yield* owner.check;
                    if (mutation !== undefined) return yield* unavailable();
                    const guarded = { ...planned, journalGuard: journal.prepare(undefined) };

                    mutation = guarded;
                    statements.push(...guarded.statements);

                    return guarded.receipt;
                  }),
                { mode: "batch" },
              ).pipe(
                Effect.map((result) => result.value),
                Effect.provideService(CurrentD1PlanningDatabase, database),
                Effect.provideService(LifecycleHooks, hooks),
              );

            const service: ProofPersistence["Service"] = {
              issue: (input, prepare) =>
                owner.run(run(plans.issue(input, prepare)).pipe(translateIssueFailure)),
              attempt: (input, prepare) =>
                owner.run(run(plans.attempt(input, prepare)).pipe(translateFailure)),
              complete: (input, prepare) =>
                owner.run(run(plans.complete(input, prepare)).pipe(translateFailure)),
              claimDelivery: (input, prepare) =>
                owner.run(run(plans.claimDelivery(input, prepare)).pipe(translateFailure)),
              settleDelivery: (input, prepare) =>
                owner.run(run(plans.settleDelivery(input, prepare)).pipe(translateFailure)),
              cancel: (input, prepare) =>
                owner.run(run(plans.cancel(input, prepare)).pipe(translateFailure)),
              cleanup: (input, prepare) =>
                owner.run(run(plans.cleanup(input, prepare)).pipe(translateFailure)),
            };

            const provided = Context.make(ProofPersistence, service).pipe(
              Context.add(D1BatchStatements, owner.collector),
            );

            const value = yield* owner.close(Effect.provideContext(body, provided));

            if (mutation?.journalGuard !== undefined) {
              const status = yield* Effect.result(mutation.journalGuard.read);

              if (status._tag === "Success" || status.failure._tag !== "CommitPending")
                return yield* unavailable();
            }
            yield* database.$client.batch(statements).pipe(
              Effect.catchCause((cause) =>
                Effect.failCause(
                  Cause.map(cause, (error) =>
                    everyFailureMatches(cause, mutation?.retryable) ? unavailable() : error,
                  ),
                ),
              ),
              translateFailure,
            );

            return value;
          }),
        { mode: "batch" },
      ).pipe(Effect.provideService(LifecycleHooks, hooks));

      return result.value;
    }).pipe(Effect.provideService(NativeDatabase, database)),
  );
}

export interface D1ProtectedProofMutation {
  /** Conditional statements compiled by the owning method adapter. */
  readonly statements: ReadonlyArray<Statement<any>>;
  /** Postcondition proving the protected CAS and its invalidations all applied. */
  readonly appliedCondition: SQL;
}

export interface D1CompiledProofCompletion<A> {
  readonly receipt: PreparedCommit<A>;
  readonly statements: ReadonlyArray<Statement<any>>;
  readonly postconditions?: ReadonlyArray<Statement<any>>;
}

/** Private compiler seam for a future same-owner D1 password-reset batch. */
export const compileD1ProofCompletionPlan = Effect.fn("Drizzle.compileD1ProofCompletionPlan")(
  function* <
    Rq extends AnySQLiteTable,
    S extends AnySQLiteTable,
    G extends AnySQLiteTable,
    Cn extends AnySQLiteTable,
    Rs extends AnySQLiteTable,
    Aev extends AnySQLiteTable,
    F extends AnySQLiteTable,
    C extends AnySQLiteTable,
    Sub extends AnySQLiteTable,
    I extends AnySQLiteTable,
    Cr extends AnySQLiteTable,
    NativeId,
    A,
  >(
    mapping: D1ProofPersistenceMapping<Rq, S, G, Cn, Rs, Aev, F, C, Sub, I, Cr, NativeId>,
    plan: ProofCompletionPlan,
    protectedMutation: D1ProtectedProofMutation,
    project: (decision: ProofCompletionDecision) => A,
  ) {
    const planned = yield* completionPlan<A>(
      mapping as unknown as Mapping,
      plan.input,
      (decision, activeJournal) => plan.prepare(decision, activeJournal, project),
    );

    // A rejected completion has no protected mutation. For a predicted success,
    // preserve the fresh continuation/authority guard first, then prove the
    // method CAS before consuming the continuation and inserting its marker.
    if (planned.statements.length === 0) return planned;
    const [freshGuard, ...completionStatements] = planned.statements;
    const marker = `effect-auth-proof-guard:protected:${plan.input.continuationId}`;

    return {
      receipt: planned.receipt,
      statements: [
        freshGuard!,
        ...protectedMutation.statements,
        yield* assertion(protectedMutation.appliedCondition, marker),
        ...completionStatements,
      ],
      postconditions: [
        yield* assertion(protectedMutation.appliedCondition, marker),
        ...(planned.postconditions ?? []),
      ],
    };
  },
);

export type AnyD1ProofMapping = ProofPersistenceMapping<
  Table,
  Table,
  Table,
  Table,
  Table,
  Table,
  Table,
  Table,
  Table,
  Table,
  Table,
  unknown
>;

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

const executeStandalone = <A, E, R>(
  plan: Effect.Effect<Planned<A>, E, R>,
  retries = 2,
): Effect.Effect<
  A,
  E | import("@yielded/auth/Hooks").HookConfigurationError | import("effect/sql/SqlError").SqlError,
  Exclude<R, CurrentCommitJournal> | CurrentD1PlanningDatabase | LifecycleHooks
> =>
  Effect.suspend(() => {
    let retryable: ((cause: unknown) => boolean) | undefined;

    const once = coordinateCommit(
      () =>
        Effect.gen(function* () {
          const database = yield* CurrentD1PlanningDatabase;
          const planned = yield* plan;

          retryable = planned.retryable;
          yield* database.$client.batch(planned.statements);

          return planned.receipt;
        }),
      { mode: "batch" },
    ).pipe(Effect.map((result) => result.value));

    return once.pipe(
      Effect.catchCause((cause) =>
        retries > 0 && everyFailureMatches(cause, retryable)
          ? executeStandalone(plan, retries - 1)
          : Effect.failCause(cause),
      ),
    );
  });
