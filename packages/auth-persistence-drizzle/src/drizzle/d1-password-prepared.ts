/* oxlint-disable no-explicit-any -- driver exports preserve concrete consumer mappings. */
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
import {
  PasswordRejected,
  PasswordUnavailable,
  PasswordPreparedVersion,
  decodePasswordPreparedReady,
  encodePasswordPreparedReady,
  snapshotPasswordPreparedReady,
  snapshotPasswordPreparedReservation,
  type PasswordPreparedReady,
  type PasswordPreparedReservation,
  type PasswordMutationDecision,
  type PreparePasswordCommit,
  type PasswordPreparedMutation,
  type PasswordPreparedPersistence,
} from "@yielded/auth/Password";
import { reportPersistenceFailure } from "@yielded/auth/Persistence";
import { type ProofCompletionPlan, ProofUnavailable, ProofBinding } from "@yielded/auth/Proofs";
import { eq, is, isNotNull, lte, or, SQL, sql, type AnyRelations, type Table } from "drizzle-orm";
import type { EffectSQLiteD1Database } from "drizzle-orm/effect-d1";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { Cause, DateTime, Effect, Predicate, Redacted, Schema, Context } from "effect";
import type { Statement } from "effect/sql/Statement";

import { Database as DatabaseService } from "./d1-database";
import { balancedD1And as and, compactD1GeneratedStatement } from "./d1-generated-statement";
import { passwordD1Kernel as kernel } from "./d1-passwords";
import { CurrentD1PlanningDatabase, makeD1Owner } from "./d1-planning";
import { checkD1ProofCompletion, compileD1ProofCompletionPlan } from "./d1-proofs";
import { D1BatchStatements } from "./D1BatchStatements";
import { PersistenceMappingError, column, updateValues } from "./model";
import { nativeDatabase } from "./native-database";
import type {
  D1PasswordPreparedPersistenceMapping,
  D1PasswordPreparedProofMapping,
} from "./password-prepared-model";
import { passwordPreparedSqlKernel as shared } from "./password-prepared-sql";
import {
  ContextInput,
  CompletionInput,
  encodeReservation,
  evidenceCurrent,
  identifierScope,
  reservationOf,
  sameRevision,
  snapshotMutation,
  snapshotReserve,
  unavailable,
} from "./password-prepared-state";
import { CurrentPasswordSql, type PasswordSqlDatabase } from "./password-sql";
import { validateDrizzleStorage } from "./storage-validation";
import type { SuppliedService } from "./SuppliedService";

type PlanPrepare<Method extends (...args: any[]) => any, A> = (
  value: Parameters<Parameters<Method>[1]>[0],
  journal: CommitJournal,
) => PreparedCommit<A>;

type Database = EffectSQLiteD1Database<AnyRelations> & { readonly $client: D1Client };
type Mapping = D1PasswordPreparedPersistenceMapping<
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
  readonly retryable?: (cause: unknown) => boolean;
  readonly receipt: PreparedCommit<A>;
  readonly statements: ReadonlyArray<Statement<any>>;
  readonly postconditions?: ReadonlyArray<Statement<any>>;
  readonly journalGuard?: PreparedCommit<void>;
}

const everyFailureMatches = (
  cause: Cause.Cause<unknown>,
  classify: ((cause: unknown) => boolean) | undefined,
): boolean =>
  classify !== undefined &&
  cause.reasons.length > 0 &&
  cause.reasons.every((reason) => Cause.isFailReason(reason) && classify(Cause.fail(reason.error)));

const bindingJson = Schema.encodeSync(Schema.fromJsonString(ProofBinding));

const authorityCondition = (mapping: Mapping, current: any, moduleId: string) => {
  const p = mapping.password,
    s = kernel.subjectColumns(p),
    i = kernel.identifierColumns(p),
    c = kernel.credentialColumns(p),
    ac = kernel.authorityColumns(p);

  const snapshot = current.snapshot,
    native = current.nativeSubjectId;

  const identifier =
    snapshot === undefined
      ? sql`true`
      : and(
          p.identifier.d1CurrentCondition({
            identifier: snapshot.identifier,
            nativeSubjectId: native,
          }),
          sql`exists(select 1 from ${p.identifier.table} where ${i.namespace} = ${sql.param(snapshot.identifier.namespace, i.namespace)} and ${i.value} = ${sql.param(snapshot.identifier.value, i.value)} and ${i.subjectId} = ${sql.param(native, i.subjectId)} and ${i.bindingRevision} = ${sql.param(snapshot.identifierBindingRevision, i.bindingRevision)} and ${Predicate.isNullish(current.identifier[p.identifier.verifiedAt]) ? sql`${i.verifiedAt} is null` : sql`${i.verifiedAt} = ${sql.param(current.identifier[p.identifier.verifiedAt], i.verifiedAt)}`})`,
        )!;

  return and(
    sql`exists(select 1 from ${p.subject.table} where ${s.id} = ${sql.param(native, s.id)} and ${s.status} = ${sql.param(p.subject.d1ActiveStatusValue, s.status)} and ${s.securityRevision} = ${sql.param(current.revision.securityRevision, s.securityRevision)})`,
    identifier,
    snapshot === undefined
      ? sql`not exists(select 1 from ${p.credential.table} where ${c.moduleId} = ${sql.param(moduleId, c.moduleId)} and ${c.subjectId} = ${sql.param(native, c.subjectId)})`
      : sql`exists(select 1 from ${p.credential.table} where ${c.moduleId} = ${sql.param(moduleId, c.moduleId)} and ${c.subjectId} = ${sql.param(native, c.subjectId)} and ${c.credentialId} = ${sql.param(snapshot.credentialId, c.credentialId)} and ${c.credentialRevision} = ${sql.param(snapshot.credentialRevision, c.credentialRevision)} and ${c.verifierVersion} = ${sql.param(snapshot.verifierVersion, c.verifierVersion)} and ${c.verifier} = ${sql.param(Redacted.value(snapshot.verifier), c.verifier)} and ${c.normalization} = ${sql.param(snapshot.normalization, c.normalization)})`,
    ...current.revision.credentials.map(
      (entry: any) =>
        sql`exists(select 1 from ${p.authorityCredential.table} where ${ac.subjectId} = ${sql.param(native, ac.subjectId)} and ${ac.credentialId} = ${sql.param(entry.credentialId, ac.credentialId)} and ${ac.revision} = ${sql.param(entry.revision, ac.revision)}${ac.status === undefined ? sql`` : sql` and ${ac.status} = ${sql.param(p.authorityCredential.d1ActiveStatusValue, ac.status)}`})`,
    ),
  )!;
};

const existsRow = (mapping: Mapping, row: any) =>
  sql`exists(select 1 from ${mapping.intent.table} where ${shared.rowCondition(mapping, row)})`;

const terminalStatements = Effect.fn(function* (
  mapping: Mapping,
  row: any,
  state: "Consumed" | "Cancelled" | "Expired",
  marker: string,
) {
  const database = yield* CurrentD1PlanningDatabase;
  const t = mapping.intent;

  return [
    yield* kernel.statement(
      database
        .update(t.table)
        .set(t.encodeTerminal(state))
        .where(shared.rowCondition(mapping, row)),
    ),
    yield* kernel.assertion(
      existsRow(mapping, {
        ...row,
        [t.state]: t.states[state],
        [t.snapshot]: null,
        [t.digest]: null,
      }),
      marker,
    ),
  ];
});

const selectInsert = Effect.fn(function* (table: Table, values: object, condition: SQL) {
  const database = yield* CurrentD1PlanningDatabase;

  const selected = Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [
        key,
        (is(value, SQL) ? value : sql`${sql.param(value, column(table, key as never))}`).as(key),
      ]),
  );

  return database.insert(table as any).select(
    database
      .select(selected)
      .from(sql`(select 1)`)
      .where(condition),
  );
});

const makePreparedPlans = (mapping: Mapping, proofMapping?: any) => {
  const p = mapping.password,
    t = mapping.intent,
    c = shared.columns(mapping),
    config = { locking: false };

  const readRows = Effect.fn(function* (condition: SQL) {
    const database = yield* CurrentD1PlanningDatabase;

    return yield* database.select().from(t.table).where(condition).limit(2);
  });

  const run = <A, E, R>(plan: Effect.Effect<Planned<A>, E, R>) =>
    Effect.gen(function* () {
      const database = yield* CurrentD1PlanningDatabase;

      return yield* shared.valid(mapping)
        ? plan.pipe(
            Effect.flatMap((planned) =>
              Effect.try({
                try: () => ({
                  ...planned,
                  statements: planned.statements.map((statement) =>
                    compactD1GeneratedStatement(database.$client, statement, unavailable),
                  ),
                  ...(planned.postconditions === undefined
                    ? {}
                    : {
                        postconditions: planned.postconditions.map((statement) =>
                          compactD1GeneratedStatement(database.$client, statement, unavailable),
                        ),
                      }),
                }),
                catch: (cause) =>
                  Schema.is(PasswordUnavailable)(cause)
                    ? cause
                    : PersistenceMappingError.make({ operation: "mapping", cause }),
              }),
            ),
          )
        : Effect.fail(unavailable());
    });

  const current = (record: PasswordPreparedReservation | PasswordPreparedReady) =>
    shared.currentAuthority(mapping, config, record);

  const complete = <A>(
    uncaptured: PasswordPreparedMutation & { readonly completion?: ProofCompletionPlan },
    prepare: PreparePasswordCommit<PasswordMutationDecision, A>,
  ) =>
    Effect.gen(function* () {
      const input = yield* snapshotMutation(uncaptured);

      const completion =
        uncaptured.completion === undefined
          ? undefined
          : {
              prepare: uncaptured.completion.prepare,
              input: yield* Schema.encodeEffect(Schema.fromJsonString(CompletionInput))(
                uncaptured.completion.input,
              ).pipe(
                Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(CompletionInput))),
                Effect.mapError(unavailable),
              ),
            };

      if (
        (input.intent.action === "reset-password") !== (completion !== undefined) ||
        (completion !== undefined && proofMapping === undefined)
      )
        return yield* unavailable();

      const credentialRevision = yield* kernel.allocate(p.allocateRevision, p.allocateRevisionSync),
        verifierVersion = yield* kernel.allocate(p.allocateRevision, p.allocateRevisionSync),
        nextSecurityRevision = yield* kernel.allocateNextSecurityRevision(
          p,
          input.intent.revision.securityRevision,
        );

      if (
        nextSecurityRevision === input.intent.revision.securityRevision ||
        credentialRevision === input.intent.credential?.credentialRevision ||
        verifierVersion === input.intent.credential?.verifierVersion
      )
        return yield* unavailable();

      const credentialId =
        input.intent.action === "add-password"
          ? yield* kernel.allocate(p.allocateCredentialId, p.allocateCredentialIdSync)
          : undefined;

      return yield* run(
        Effect.gen(function* () {
          const journal = yield* CurrentCommitJournal;

          const authority = yield* current(input.intent),
            rows = yield* readRows(
              and(eq(c.moduleId, input.intent.moduleId), eq(c.intentId, input.intent.intentId))!,
            ),
            row = rows[0],
            now = yield* kernel.readEngineNowMillis(p);

          if (
            authority === undefined ||
            rows.length !== 1 ||
            !(yield* shared.recordMatches(
              mapping,
              row,
              input.intent,
              authority.nativeSubjectId,
              yield* encodePasswordPreparedReady(input.intent),
            )) ||
            !evidenceCurrent(input, authority.requirement, now)
          )
            return { receipt: prepare("rejected", journal), statements: [] };
          const marker = `effect-auth-password-prepared:complete:${input.intent.intentId}`;

          const requirements = [
            input.mutation.authorization.requirement,
            input.intent.capturedRequirement,
            input.capturedRequirement,
            authority.requirement,
            input.currentRequirement,
          ];

          const age = Math.min(...requirements.map((value) => value.maximumAgeMillis));

          const live = and(
            existsRow(mapping, row),
            authorityCondition(mapping, authority, input.intent.moduleId),
            sql`${p.d1.engineNowMillis} >= ${input.intent.issuedAtMillis} and ${p.d1.engineNowMillis} < ${input.intent.expiresAtMillis}`,
            ...requirements.map((requirement) =>
              kernel.assuranceCondition(p, input.mutation.authorization.evidence, requirement),
            ),
            ...(input.intent.baseEvidence?.proofs ?? []).map(
              (proof) =>
                sql`${p.d1.engineNowMillis} >= ${DateTime.toEpochMillis(proof.verifiedAt)} and ${p.d1.engineNowMillis} < ${DateTime.toEpochMillis(proof.verifiedAt) + age}`,
            ),
          )!;

          let mutation: ReadonlyArray<Statement<any>>;
          let passwordApplied: SQL;
          let mutationGuard: ((cause: unknown) => boolean) | undefined;

          if (input.intent.action === "add-password") {
            const compiled = yield* kernel.compileAddMutation(p, input.mutation, {
              credentialId: credentialId!,
              credentialRevision,
              verifierVersion,
              nextSecurityRevision,
            });

            if (compiled === undefined)
              return { receipt: prepare("rejected", journal), statements: [] };
            mutation = compiled.statements;
            mutationGuard = compiled.retryable;
            passwordApplied = compiled.appliedCondition;
          } else {
            const compiled = yield* kernel.compileReplacementMutation(
              p,
              input.mutation,
              input.intent.action,
              { credentialRevision, verifierVersion, nextSecurityRevision },
            );

            if (compiled === undefined)
              return { receipt: prepare("rejected", journal), statements: [] };
            passwordApplied = compiled.protectedMutation.appliedCondition;
            mutationGuard = (cause) => kernel.isGuardFailure(cause, compiled.marker);
            mutation = [
              ...compiled.protectedMutation.statements,
              yield* kernel.assertion(compiled.protectedMutation.appliedCondition, marker),
            ];
          }

          const terminal = {
            ...row,
            [t.state]: t.states.Consumed,
            [t.snapshot]: null,
            [t.digest]: null,
          };

          const protectedMutation = {
            statements: [
              yield* kernel.assertion(live, marker),
              ...mutation,
              ...(yield* terminalStatements(mapping, row, "Consumed", marker)),
            ],
            appliedCondition: and(
              passwordApplied,
              existsRow(mapping, terminal),
              sql`${p.d1.engineNowMillis} >= ${input.intent.issuedAtMillis} and ${p.d1.engineNowMillis} < ${input.intent.expiresAtMillis}`,
              ...(input.intent.baseEvidence?.proofs ?? []).map(
                (proof) =>
                  sql`${p.d1.engineNowMillis} >= ${DateTime.toEpochMillis(proof.verifiedAt)} and ${p.d1.engineNowMillis} < ${DateTime.toEpochMillis(proof.verifiedAt) + age}`,
              ),
              ...requirements.map((requirement) =>
                kernel.assuranceCondition(p, input.mutation.authorization.evidence, requirement),
              ),
            )!,
          };

          if (completion !== undefined) {
            if (
              input.intent.reset === undefined ||
              completion.input.continuationId !== input.intent.reset.continuationId ||
              bindingJson(completion.input.binding) !== bindingJson(input.intent.reset.binding) ||
              !kernel.completionMatchesPassword({ ...input.mutation, completion })
            )
              return { receipt: prepare("rejected", journal), statements: [] };
            let receipt: PreparedCommit<A> | undefined;

            const compiled = yield* compileD1ProofCompletionPlan(
              proofMapping,
              completion,
              protectedMutation,
              (decision) => {
                receipt = prepare(decision === "completed" ? "changed" : "rejected", journal);

                return decision;
              },
            );

            return {
              retryable: (cause: unknown) =>
                kernel.isGuardFailure(cause, marker) ||
                mutationGuard?.(cause) === true ||
                (completion !== undefined &&
                  (kernel.isGuardFailure(
                    cause,
                    `effect-auth-proof-guard:complete:${completion.input.continuationId}`,
                  ) ||
                    kernel.isGuardFailure(
                      cause,
                      `effect-auth-proof-guard:protected:${completion.input.continuationId}`,
                    ))),
              receipt: receipt ?? prepare("rejected", journal),
              statements: compiled.statements,
              ...(compiled.postconditions === undefined
                ? {}
                : { postconditions: compiled.postconditions }),
            };
          }

          const postconditions = [
            yield* kernel.assertion(protectedMutation.appliedCondition, marker),
          ];

          return {
            retryable: (cause: unknown) =>
              kernel.isGuardFailure(cause, marker) || mutationGuard?.(cause) === true,
            receipt: prepare("changed", journal),
            statements: [...protectedMutation.statements, ...postconditions],
            postconditions,
          };
        }),
      );
    });

  const services = {
    reserve: <A>(
      uncaptured: Parameters<PasswordPreparedPersistence["reserve"]>[0],
      prepare: PlanPrepare<PasswordPreparedPersistence["reserve"], A>,
    ) =>
      Effect.gen(function* () {
        const database = yield* CurrentD1PlanningDatabase;

        const input = yield* snapshotReserve(uncaptured);

        if (
          (input.action === "reset-password") !==
            (input.reset !== undefined && input.completion !== undefined) ||
          (input.action === "reset-password" && proofMapping === undefined) ||
          input.generation !== input.policy.generation ||
          input.policy.retentionMillis <
            Math.max(
              input.policy.preparationLifetimeMillis + input.policy.lifetimeMillis,
              input.policy.admission.action.windowMillis,
              input.policy.admission.subject.windowMillis,
              input.policy.admission.identifier.windowMillis,
            ) ||
          (input.invalidation.existingSessions === "immediate" &&
            p.sessionInvalidation !== "same-authority-immediate")
        )
          return yield* unavailable();

        const version = PasswordPreparedVersion.make(
          yield* kernel.allocate(mapping.allocateVersion, mapping.allocateVersionSync),
        );

        return yield* run(
          Effect.gen(function* () {
            const journal = yield* CurrentCommitJournal;

            const authority = yield* shared.captureAuthority(mapping, config, input);

            if (authority === undefined) return yield* unavailable();
            let proofCondition: SQL = sql`true`;

            if (input.reset !== undefined) {
              if (
                input.completion === undefined ||
                input.completion.moduleId !== `${input.moduleId}/reset` ||
                input.completion.purpose !== "password-reset" ||
                input.reset.continuationId !== input.completion.continuationId ||
                bindingJson(input.reset.binding) !== bindingJson(input.completion.binding) ||
                input.reset.binding._tag !== "Subject" ||
                !sameRevision(input.reset.binding.revision, authority.revision) ||
                authority.snapshot?.identifierVerifiedAtMillis === undefined
              )
                return yield* unavailable();
              const inspected = yield* checkD1ProofCompletion(proofMapping, input.completion);

              if (!inspected.accepted) return yield* unavailable();
              proofCondition = inspected.condition;
            }

            const ownerCurrent = and(
              authorityCondition(mapping, authority, input.moduleId),
              proofCondition,
            )!;

            const marker = `effect-auth-password-prepared:reserve:${input.intentId}`;

            const existing = yield* readRows(
              and(eq(c.moduleId, input.moduleId), eq(c.commandId, input.commandId))!,
            );

            if (existing.length)
              return {
                retryable: (cause: unknown) => kernel.isGuardFailure(cause, marker),
                receipt: prepare({ _tag: "Existing" }, journal),
                statements: [
                  yield* kernel.assertion(
                    and(ownerCurrent, existsRow(mapping, existing[0]))!,
                    marker,
                  ),
                ],
              };

            const now = yield* kernel.readEngineNowMillis(p),
              scope = identifierScope({
                ...(authority.snapshot === undefined ? {} : { credential: authority.snapshot }),
                revision: authority.revision,
              });

            const reservation = yield* snapshotPasswordPreparedReservation({
              _tag: "Preparing",
              moduleId: input.moduleId,
              generation: input.generation,
              intentId: input.intentId,
              version,
              commandId: input.commandId,
              action: input.action,
              revision: authority.revision,
              ...(authority.snapshot === undefined ? {} : { credential: authority.snapshot }),
              capturedRequirement: authority.requirement,
              ...(input.reset === undefined ? {} : { reset: input.reset }),
              invalidation: input.invalidation,
              createdAtMillis: now,
              preparationExpiresAtMillis: now + input.policy.preparationLifetimeMillis,
              retainUntilMillis: now + input.policy.retentionMillis,
            });

            const snapshot = yield* encodeReservation(reservation),
              window = Math.max(
                input.policy.admission.action.windowMillis,
                input.policy.admission.identifier.windowMillis,
                input.policy.admission.subject.windowMillis,
              );

            const a = mapping.admission,
              am = column(a.table, a.moduleId),
              ai = column(a.table, a.intentId),
              at = column(a.table, a.admittedAt),
              ar = column(a.table, a.admissionRetainUntil);

            const stamp = sql`(select ${at} from ${a.table} where ${am} = ${sql.param(input.moduleId, am)})`,
              retention = sql`(select ${ar} from ${a.table} where ${am} = ${sql.param(input.moduleId, am)})`;

            const active = sql`(select count(*) from ${t.table} where ${c.moduleId} = ${sql.param(input.moduleId, c.moduleId)} and ${c.subjectId} = ${sql.param(authority.nativeSubjectId, c.subjectId)} and ((${c.state} = ${sql.param(t.states.Preparing, c.state)} and ${c.preparationExpiresAt} > ${p.d1.engineNow}) or (${c.state} = ${sql.param(t.states.Ready, c.state)} and ${c.expiresAt} > ${p.d1.engineNow}))) < ${input.policy.maximumPendingPerSubject}`;

            const budgets = [
              [eq(c.action, input.action), input.policy.admission.action],
              [eq(c.identifierScope, scope), input.policy.admission.identifier],
              [eq(c.subjectId, authority.nativeSubjectId), input.policy.admission.subject],
            ] as const;

            const admissionDecision = and(
              ownerCurrent,
              active,
              ...budgets.map(
                ([condition, budget]) =>
                  sql`(select count(*) from ${t.table} where ${c.moduleId} = ${sql.param(input.moduleId, c.moduleId)} and ${condition} and ${c.admittedAt} > ${p.d1.engineInstantMinus(budget.windowMillis)}) < ${budget.limit}`,
              ),
              sql`not exists(select 1 from ${t.table} where ${c.moduleId} = ${sql.param(input.moduleId, c.moduleId)} and ${c.commandId} = ${sql.param(input.commandId, c.commandId)})`,
              sql`${p.d1.engineNowMillis} >= ${now} and ${p.d1.engineNowMillis} < ${reservation.preparationExpiresAtMillis}`,
            )!;

            const admittedMillis = mapping.admissionClock.toMillis(stamp),
              retainedMillis = mapping.admissionClock.toMillis(retention);

            const clockGuard = and(
              sql`exists(select 1 from ${a.table} where ${am} = ${sql.param(input.moduleId, am)} and ${ai} = ${sql.param(input.intentId, ai)})`,
              sql`${admittedMillis} >= ${now} and ${admittedMillis} <= ${p.d1.engineNowMillis}`,
              sql`${retainedMillis} = ${admittedMillis} + ${window}`,
            )!;

            const guard = and(sql`changes() = 1`, clockGuard)!;

            const values = {
              ...t.encodeInsert({
                reservation,
                nativeSubjectId: authority.nativeSubjectId,
                identifierScope: scope,
                snapshot,
                admittedAtMillis: now,
                admissionRetainUntilMillis: now + window,
              }),
              [t.admittedAt]: stamp,
              [t.admissionRetainUntil]: retention,
            };

            const expected = {
              [t.moduleId]: input.moduleId,
              [t.intentId]: input.intentId,
              [t.commandId]: input.commandId,
              [t.subjectId]: authority.nativeSubjectId,
              [t.action]: input.action,
              [t.generation]: input.generation,
              [t.version]: version,
              [t.state]: t.states.Preparing,
              [t.digest]: null,
              [t.snapshot]: snapshot,
              [t.identifierScope]: scope,
              [t.createdAt]: p.encodeInstant(now),
              [t.preparationExpiresAt]: p.encodeInstant(reservation.preparationExpiresAtMillis),
              [t.expiresAt]: null,
              [t.retainUntil]: p.encodeInstant(reservation.retainUntilMillis),
              [t.admittedAt]: stamp,
              [t.admissionRetainUntil]: retention,
            };

            return {
              retryable: (cause: unknown) => kernel.isGuardFailure(cause, marker),
              receipt: prepare({ _tag: "Reserved", reservation }, journal),
              statements: [
                yield* kernel.statement(
                  database
                    .insert(a.table)
                    .values(a.encodeInsert(input.moduleId))
                    .onConflictDoNothing(),
                ),
                yield* kernel.statement(
                  database
                    .update(a.table)
                    .set(
                      updateValues([
                        [a.intentId, input.intentId],
                        [a.admittedAt, p.d1.engineNow],
                        [a.admissionRetainUntil, p.d1.engineInstantPlus(window)],
                      ]),
                    )
                    .where(and(eq(am, input.moduleId), admissionDecision)),
                ),
                yield* kernel.statement(yield* selectInsert(t.table, values, guard)),
                yield* kernel.assertion(existsRow(mapping, expected), marker),
                yield* kernel.assertion(
                  and(
                    ownerCurrent,
                    clockGuard,
                    sql`${p.d1.engineNowMillis} < ${reservation.preparationExpiresAtMillis}`,
                    sql`(select count(*) from ${t.table} where ${c.moduleId} = ${sql.param(input.moduleId, c.moduleId)} and ${c.subjectId} = ${sql.param(authority.nativeSubjectId, c.subjectId)} and ((${c.state} = ${sql.param(t.states.Preparing, c.state)} and ${c.preparationExpiresAt} > ${p.d1.engineNow}) or (${c.state} = ${sql.param(t.states.Ready, c.state)} and ${c.expiresAt} > ${p.d1.engineNow}))) <= ${input.policy.maximumPendingPerSubject}`,
                    ...budgets.map(
                      ([condition, budget]) =>
                        sql`(select count(*) from ${t.table} where ${c.moduleId} = ${sql.param(input.moduleId, c.moduleId)} and ${condition} and ${c.admittedAt} > ${p.d1.engineInstantMinus(budget.windowMillis)}) <= ${budget.limit}`,
                    ),
                  )!,
                  marker,
                ),
              ],
            };
          }),
        );
      }),
    publishReady: <A>(
      uncaptured: Parameters<PasswordPreparedPersistence["publishReady"]>[0],
      prepare: PlanPrepare<PasswordPreparedPersistence["publishReady"], A>,
    ) =>
      Effect.gen(function* () {
        const database = yield* CurrentD1PlanningDatabase;

        const reservation = yield* snapshotPasswordPreparedReservation(uncaptured.reservation),
          ready = yield* snapshotPasswordPreparedReady(uncaptured.ready),
          snapshot = yield* encodeReservation(reservation),
          readySnapshot = yield* encodePasswordPreparedReady(ready);

        if ((yield* encodeReservation(reservationOf(ready))) !== snapshot)
          return yield* unavailable();

        return yield* run(
          Effect.gen(function* () {
            const journal = yield* CurrentCommitJournal;

            const authority = yield* current(reservation),
              rows = yield* readRows(
                and(eq(c.moduleId, reservation.moduleId), eq(c.intentId, reservation.intentId))!,
              ),
              row = rows[0];

            if (
              authority === undefined ||
              rows.length !== 1 ||
              !(yield* shared.recordMatches(
                mapping,
                row,
                reservation,
                authority.nativeSubjectId,
                snapshot,
              ))
            )
              return { receipt: prepare("rejected", journal), statements: [] };

            const marker = `effect-auth-password-prepared:ready:${ready.intentId}`,
              live = and(
                authorityCondition(mapping, authority, ready.moduleId),
                sql`${p.d1.engineNowMillis} >= ${ready.issuedAtMillis} and ${p.d1.engineNowMillis} < ${reservation.preparationExpiresAtMillis} and ${p.d1.engineNowMillis} < ${ready.expiresAtMillis}`,
              )!;

            const expected = {
              ...row,
              [t.state]: t.states.Ready,
              [t.snapshot]: readySnapshot,
              [t.digest]: ready.digest,
              [t.expiresAt]: p.encodeInstant(ready.expiresAtMillis),
            };

            return {
              retryable: (cause: unknown) => kernel.isGuardFailure(cause, marker),
              receipt: prepare("published", journal),
              statements: [
                yield* kernel.assertion(and(live, existsRow(mapping, row))!, marker),
                yield* kernel.statement(
                  database
                    .update(t.table)
                    .set(t.encodeReady({ ready, snapshot: readySnapshot }))
                    .where(shared.rowCondition(mapping, row)),
                ),
                yield* kernel.assertion(and(live, existsRow(mapping, expected))!, marker),
              ],
            };
          }),
        );
      }),
    context: (uncaptured: Parameters<PasswordPreparedPersistence["context"]>[0]) =>
      Effect.gen(function* () {
        const database = yield* CurrentD1PlanningDatabase;

        if (yield* hasCommitScope) return yield* unavailable();

        const input = yield* Schema.decodeEffect(ContextInput)({ ...uncaptured }).pipe(
            Effect.mapError(unavailable),
          ),
          rows = yield* readRows(
            and(
              eq(c.moduleId, input.moduleId),
              eq(c.generation, input.generation),
              eq(c.digest, input.digest),
              eq(c.state, t.states.Ready),
            )!,
          );

        if (rows.length !== 1) return yield* PasswordRejected.make({});

        const record = yield* decodePasswordPreparedReady(rows[0][t.snapshot]),
          authority = yield* current(record);

        if (
          authority === undefined ||
          record.moduleId !== input.moduleId ||
          record.generation !== input.generation ||
          record.digest !== input.digest ||
          !(yield* shared.recordMatches(
            mapping,
            rows[0],
            record,
            authority.nativeSubjectId,
            yield* encodePasswordPreparedReady(record),
          ))
        )
          return yield* PasswordRejected.make({});

        const condition = and(
          shared.rowCondition(mapping, rows[0]),
          authorityCondition(mapping, authority, record.moduleId),
          sql`${p.d1.engineNowMillis} >= ${record.issuedAtMillis} and ${p.d1.engineNowMillis} < ${record.expiresAtMillis}`,
        )!;

        const guardStatement = yield* kernel.assertion(
          sql`exists(select 1 from ${t.table} where ${condition})`,
          `effect-auth-password-prepared:context:${record.intentId}`,
        );

        const guard = yield* Effect.try({
          try: () => compactD1GeneratedStatement(database.$client, guardStatement, unavailable),
          catch: (cause) =>
            Schema.is(PasswordUnavailable)(cause)
              ? cause
              : PersistenceMappingError.make({ operation: "mapping", cause }),
        });

        yield* database.$client
          .batch([guard])
          .pipe(
            Effect.catchCause(
              (
                cause,
              ): Effect.Effect<never, PasswordRejected | import("effect/sql/SqlError").SqlError> =>
                everyFailureMatches(cause, (failure) =>
                  kernel.isGuardFailure(
                    failure,
                    `effect-auth-password-prepared:context:${record.intentId}`,
                  ),
                )
                  ? Effect.fail(PasswordRejected.make({}))
                  : Effect.failCause(cause),
            ),
          );

        return { record, currentRequirement: authority.requirement };
      }),
    complete,
    resetWithProof: complete,
    cancel: <A>(
      uncaptured: Parameters<PasswordPreparedPersistence["cancel"]>[0],
      prepare: PlanPrepare<PasswordPreparedPersistence["cancel"], A>,
    ) =>
      Effect.gen(function* () {
        const record = yield* snapshotPasswordPreparedReady(uncaptured.record);

        return yield* run(
          Effect.gen(function* () {
            const journal = yield* CurrentCommitJournal;

            const authority = yield* current(record),
              rows = yield* readRows(
                and(eq(c.moduleId, record.moduleId), eq(c.intentId, record.intentId))!,
              ),
              row = rows[0];

            if (
              authority === undefined ||
              rows.length !== 1 ||
              !(yield* shared.recordMatches(
                mapping,
                row,
                record,
                authority.nativeSubjectId,
                yield* encodePasswordPreparedReady(record),
              ))
            )
              return { receipt: prepare(false, journal), statements: [] };
            const marker = `effect-auth-password-prepared:cancel:${record.intentId}`;

            return {
              retryable: (cause: unknown) => kernel.isGuardFailure(cause, marker),
              receipt: prepare(true, journal),
              statements: [
                yield* kernel.assertion(
                  and(
                    existsRow(mapping, row),
                    authorityCondition(mapping, authority, record.moduleId),
                    sql`${p.d1.engineNowMillis} >= ${record.issuedAtMillis} and ${p.d1.engineNowMillis} < ${record.expiresAtMillis}`,
                  )!,
                  marker,
                ),
                ...(yield* terminalStatements(mapping, row, "Cancelled", marker)),
              ],
            };
          }),
        );
      }),
    cleanup: <A>(
      uncaptured: Parameters<PasswordPreparedPersistence["cleanup"]>[0],
      prepare: PlanPrepare<PasswordPreparedPersistence["cleanup"], A>,
    ) =>
      Effect.gen(function* () {
        const database = yield* CurrentD1PlanningDatabase;

        const input = { ...uncaptured };

        if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 1000)
          return yield* unavailable();

        return yield* run(
          Effect.gen(function* () {
            const journal = yield* CurrentCommitJournal;

            const due = and(
              eq(c.moduleId, input.moduleId),
              or(
                and(
                  lte(c.retainUntil, p.d1.engineNow),
                  lte(c.admissionRetainUntil, p.d1.engineNow),
                ),
                and(
                  isNotNull(c.snapshot),
                  or(
                    and(
                      eq(c.state, t.states.Preparing),
                      lte(c.preparationExpiresAt, p.d1.engineNow),
                    ),
                    and(eq(c.state, t.states.Ready), lte(c.expiresAt, p.d1.engineNow)),
                  ),
                ),
              ),
            )!;

            const rows = yield* database
              .select()
              .from(t.table)
              .where(due)
              .orderBy(c.createdAt, c.intentId)
              .limit(input.limit + 1);

            const now = yield* kernel.readEngineNowMillis(p),
              statements: Statement<any>[] = [],
              marker = `effect-auth-password-prepared:cleanup:${input.moduleId}`;

            let removed = 0;

            for (const row of rows.slice(0, input.limit)) {
              const retained = yield* p.decodeInstant(row[t.retainUntil]),
                charge = yield* p.decodeInstant(row[t.admissionRetainUntil]);

              statements.push(
                yield* kernel.assertion(
                  and(
                    existsRow(mapping, row),
                    sql`exists(select 1 from ${t.table} where ${shared.rowCondition(mapping, row)} and ${due})`,
                  )!,
                  marker,
                ),
              );
              if (retained <= now && charge <= now) {
                statements.push(
                  yield* kernel.statement(
                    database
                      .delete(t.table)
                      .where(
                        and(
                          shared.rowCondition(mapping, row),
                          lte(c.retainUntil, p.d1.engineNow),
                          lte(c.admissionRetainUntil, p.d1.engineNow),
                        ),
                      ),
                  ),
                  yield* kernel.assertion(
                    sql`not exists(select 1 from ${t.table} where ${c.moduleId} = ${sql.param(input.moduleId, c.moduleId)} and ${c.intentId} = ${sql.param(row[t.intentId], c.intentId)})`,
                    marker,
                  ),
                );
                removed++;
              } else
                statements.push(...(yield* terminalStatements(mapping, row, "Expired", marker)));
            }
            const hasMore = rows.length > input.limit;

            statements.push(
              yield* kernel.assertion(
                hasMore
                  ? sql`exists(select 1 from ${t.table} where ${due})`
                  : sql`not exists(select 1 from ${t.table} where ${due})`,
                marker,
              ),
            );

            return {
              retryable: (cause: unknown) => kernel.isGuardFailure(cause, marker),
              receipt: prepare({ removed, hasMore }, journal),
              statements,
            };
          }),
        );
      }),
  };

  return services;
};

export const makeD1PasswordPreparedPersistenceServices = Effect.fnUntraced(function* <
  S extends AnySQLiteTable,
  I extends AnySQLiteTable,
  C extends AnySQLiteTable,
  AC extends AnySQLiteTable,
  At extends AnySQLiteTable,
  RS extends AnySQLiteTable,
  CE extends AnySQLiteTable,
  M extends AnySQLiteTable,
  T extends AnySQLiteTable,
  B extends AnySQLiteTable,
  NativeId,
  PS extends AnySQLiteTable = AnySQLiteTable,
  PC extends AnySQLiteTable = AnySQLiteTable,
  PM extends AnySQLiteTable = AnySQLiteTable,
  PSub extends AnySQLiteTable = AnySQLiteTable,
  PI extends AnySQLiteTable = AnySQLiteTable,
  PCr extends AnySQLiteTable = AnySQLiteTable,
  PNativeId = unknown,
>(
  mapping: D1PasswordPreparedPersistenceMapping<S, I, C, AC, At, RS, CE, M, T, B, NativeId>,
  proofMapping?: D1PasswordPreparedProofMapping<PS, PC, PM, PSub, PI, PCr, PNativeId>,
) {
  const database = yield* DatabaseService;

  yield* validateDrizzleStorage({ ...mapping, proof: proofMapping }).pipe(
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
    Effect.mapError(unavailable),
  );

  const hooks = yield* LifecycleHooks;
  const plans = makePreparedPlans(mapping as unknown as Mapping, proofMapping);

  const run = <Out, Err, Env>(plan: Effect.Effect<Planned<Out>, Err, Env>) =>
    Effect.gen(function* () {
      if (yield* hasCommitScope) return yield* unavailable();

      return yield* executeStandalone(plan);
    }).pipe(
      Effect.provideService(CurrentD1PlanningDatabase, database),
      Effect.provideService(CurrentPasswordSql, database as unknown as PasswordSqlDatabase),
      Effect.provideService(LifecycleHooks, hooks),
    );

  const service: PasswordPreparedPersistence = {
    reserve: (input, prepare) => run(plans.reserve(input, prepare)).pipe(translateFailure),
    publishReady: (input, prepare) =>
      run(plans.publishReady(input, prepare)).pipe(translateFailure),
    context: (input) =>
      plans
        .context(input)
        .pipe(
          Effect.provideService(CurrentD1PlanningDatabase, database),
          Effect.provideService(CurrentPasswordSql, database as unknown as PasswordSqlDatabase),
          Effect.provideService(LifecycleHooks, hooks),
          translateContextFailure,
        ),
    complete: (input, prepare) => run(plans.complete(input, prepare)).pipe(translateFailure),
    resetWithProof: (input, prepare) =>
      run(plans.resetWithProof(input, prepare)).pipe(translateFailure),
    cancel: (input, prepare) => run(plans.cancel(input, prepare)).pipe(translateFailure),
    cleanup: (input, prepare) => run(plans.cleanup(input, prepare)).pipe(translateFailure),
  };

  return { passwordPreparedPersistence: service };
});

export function coordinateD1PasswordPreparedPersistence<
  TargetId,
  S extends AnySQLiteTable,
  I extends AnySQLiteTable,
  C extends AnySQLiteTable,
  AC extends AnySQLiteTable,
  At extends AnySQLiteTable,
  RS extends AnySQLiteTable,
  CE extends AnySQLiteTable,
  M extends AnySQLiteTable,
  T extends AnySQLiteTable,
  B extends AnySQLiteTable,
  NativeId,
  PS extends AnySQLiteTable,
  PC extends AnySQLiteTable,
  PM extends AnySQLiteTable,
  PSub extends AnySQLiteTable,
  PI extends AnySQLiteTable,
  PCr extends AnySQLiteTable,
  PNativeId,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: D1PasswordPreparedPersistenceMapping<
      S,
      I,
      C,
      AC,
      At,
      RS,
      CE,
      M,
      T,
      B,
      NativeId
    >;
    readonly proofMapping?:
      | D1PasswordPreparedProofMapping<PS, PC, PM, PSub, PI, PCr, PNativeId>
      | undefined;
    readonly target: SuppliedService<TargetId, PasswordPreparedPersistence>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | PasswordUnavailable | HookConfigurationError | DatabaseError,
  Exclude<R, TargetId | D1BatchStatements> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    Effect.gen(function* () {
      yield* validateDrizzleStorage({
        ...options.mapping,
        proof: options.proofMapping,
      }).pipe(Effect.mapError(unavailable));
      const hooks = yield* LifecycleHooks;

      if (yield* hasCommitScope) return yield* unavailable();

      const result = yield* coordinateCommit(
        () =>
          Effect.gen(function* () {
            const statements: Statement<any>[] = [];
            let mutation: Planned<any> | undefined;
            let poisoned = false;

            const nativeCollector = D1BatchStatements.of({
              append: (statement) => Effect.sync(() => statements.push(statement)),
            });

            const owner = yield* makeD1Owner(unavailable()).pipe(
              Effect.provideService(D1BatchStatements, nativeCollector),
            );

            const protect = <Out, Err, Env>(effect: Effect.Effect<Out, Err, Env>) =>
              effect.pipe(
                Effect.onError(() =>
                  Effect.sync(() => {
                    poisoned = true;
                  }),
                ),
              );

            const plans = makePreparedPlans(
              options.mapping as unknown as Mapping,
              options.proofMapping,
            );

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
                Effect.provideService(
                  CurrentPasswordSql,
                  database as unknown as PasswordSqlDatabase,
                ),
                Effect.provideService(LifecycleHooks, hooks),
              );

            const service: PasswordPreparedPersistence = {
              reserve: (input, prepare) =>
                owner.run(protect(run(plans.reserve(input, prepare)).pipe(translateFailure))),
              publishReady: (input, prepare) =>
                owner.run(protect(run(plans.publishReady(input, prepare)).pipe(translateFailure))),
              context: (input) =>
                owner.run(
                  protect(
                    plans
                      .context(input)
                      .pipe(
                        Effect.provideService(CurrentD1PlanningDatabase, database),
                        Effect.provideService(
                          CurrentPasswordSql,
                          database as unknown as PasswordSqlDatabase,
                        ),
                        Effect.provideService(LifecycleHooks, hooks),
                        translateContextFailure,
                      ),
                  ),
                ),
              complete: (input, prepare) =>
                owner.run(protect(run(plans.complete(input, prepare)).pipe(translateFailure))),
              resetWithProof: (input, prepare) =>
                owner.run(
                  protect(run(plans.resetWithProof(input, prepare)).pipe(translateFailure)),
                ),
              cancel: (input, prepare) =>
                owner.run(protect(run(plans.cancel(input, prepare)).pipe(translateFailure))),
              cleanup: (input, prepare) =>
                owner.run(protect(run(plans.cleanup(input, prepare)).pipe(translateFailure))),
            };

            const provided = Context.make(options.target, service).pipe(
              Context.add(D1BatchStatements, owner.collector),
            );

            const value = yield* owner.close(Effect.provideContext(body, provided));

            if (poisoned) return yield* unavailable();
            if (mutation?.journalGuard !== undefined) {
              const status = yield* Effect.result(mutation.journalGuard.read);

              if (status._tag === "Success" || status.failure._tag !== "CommitPending")
                return yield* unavailable();
            }
            yield* database.$client
              .batch([...statements, ...(mutation?.postconditions ?? [])])
              .pipe(
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

const translateFailure = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, PasswordUnavailable, R> =>
  reportPersistenceFailure(
    effect,
    (error) =>
      Schema.is(PasswordUnavailable)(error) ||
      Schema.is(ProofUnavailable)(error) ||
      Schema.is(HookConfigurationError)(error),
  ).pipe(Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, () => unavailable()))));

const translateContextFailure = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, PasswordUnavailable | PasswordRejected, R> =>
  reportPersistenceFailure(
    effect,
    (error) =>
      Schema.is(PasswordUnavailable)(error) ||
      Schema.is(PasswordRejected)(error) ||
      Schema.is(ProofUnavailable)(error) ||
      Schema.is(HookConfigurationError)(error),
  ).pipe(
    Effect.catchCause((cause) =>
      Effect.failCause(
        Cause.map(cause, (error) => (Schema.is(PasswordRejected)(error) ? error : unavailable())),
      ),
    ),
  );

const executeStandalone = <A, E, R>(plan: Effect.Effect<Planned<A>, E, R>) =>
  Effect.suspend(() => {
    let retryable: ((cause: unknown) => boolean) | undefined;

    return coordinateCommit(
      () =>
        Effect.gen(function* () {
          const database = yield* CurrentD1PlanningDatabase;
          const planned = yield* plan;

          retryable = planned.retryable;
          yield* database.$client.batch([...planned.statements, ...(planned.postconditions ?? [])]);

          return planned.receipt;
        }),
      { mode: "batch" },
    ).pipe(
      Effect.map((result) => result.value),
      Effect.catchCause((cause) =>
        Effect.failCause(
          Cause.map(cause, (error) =>
            everyFailureMatches(cause, retryable) ? unavailable() : error,
          ),
        ),
      ),
    );
  });
