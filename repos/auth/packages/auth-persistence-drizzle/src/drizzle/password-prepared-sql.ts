import {
  type NativeDatabase,
  CurrentPasswordPreparedTransaction,
  PasswordPreparedPostconditions,
  PasswordPreparedJournalGuards,
} from "@yielded/auth-persistence/Adapter";
import { CurrentCommitJournal, LifecycleHooks, HookConfigurationError } from "@yielded/auth/Hooks";
import {
  PasswordUnavailable,
  PasswordRejected,
  PasswordPreparedVersion,
  decodePasswordPreparedReady,
  encodePasswordPreparedReady,
  snapshotPasswordPreparedReady,
  snapshotPasswordPreparedReservation,
  type PasswordPreparedReady,
  type PasswordPreparedReservation,
  snapshotPasswordCredential,
  snapshotPasswordRequirement,
  type PasswordMutationDecision,
  type PreparePasswordCommit,
  type PasswordPreparedPersistence,
  type PasswordPreparedMutation,
} from "@yielded/auth/Password";
import { reportPersistenceFailure } from "@yielded/auth/Persistence";
import { type ProofCompletionPlan, ProofUnavailable, ProofBinding } from "@yielded/auth/Proofs";
import { AuthenticationRevision } from "@yielded/auth/Sessions";
/* oxlint-disable no-explicit-any -- concrete driver makers retain consumer table types. */
import { and, count, eq, gt, isNotNull, isNull, lte, or, type SQL } from "drizzle-orm";
import { Cause, DateTime, Effect, Option, Predicate, Redacted, Schema } from "effect";

import { column } from "./model";
import {
  requiredPasswordPreparedConstraints,
  type AnyPasswordPreparedPersistenceMapping,
  type PasswordPreparedState,
} from "./password-prepared-model";
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
import {
  CurrentPasswordSql,
  passwordSqlKernel as kernel,
  type PasswordSqlConfiguration,
  type PasswordSqlQuery,
} from "./password-sql";
import { checkProofCompletionIn, completeProofPlanIn } from "./proof-sql";
import { validateDrizzleStorage } from "./storage-validation";

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

type Mapping = AnyPasswordPreparedPersistenceMapping;
const nowMillis = DateTime.now.pipe(Effect.map(DateTime.toEpochMillis));

const read = (query: PasswordSqlQuery, locking: boolean) =>
  locking && typeof query.for === "function" ? query.for("update") : query;

const columns = (mapping: Mapping) => {
  const table = mapping.intent;

  return {
    moduleId: column(table.table, table.moduleId),
    intentId: column(table.table, table.intentId),
    commandId: column(table.table, table.commandId),
    subjectId: column(table.table, table.subjectId),
    action: column(table.table, table.action),
    generation: column(table.table, table.generation),
    version: column(table.table, table.version),
    state: column(table.table, table.state),
    digest: column(table.table, table.digest),
    snapshot: column(table.table, table.snapshot),
    identifierScope: column(table.table, table.identifierScope),
    createdAt: column(table.table, table.createdAt),
    admittedAt: column(table.table, table.admittedAt),
    admissionRetainUntil: column(table.table, table.admissionRetainUntil),
    preparationExpiresAt: column(table.table, table.preparationExpiresAt),
    expiresAt: column(table.table, table.expiresAt),
    retainUntil: column(table.table, table.retainUntil),
  };
};

const valid = (mapping: Mapping) =>
  Object.entries(requiredPasswordPreparedConstraints).every(
    ([key, value]) =>
      mapping.constraints[key as keyof typeof requiredPasswordPreparedConstraints] === value,
  );

const lockAnchor = Effect.fn("DrizzlePasswordPrepared.lockAnchor")(function* (
  mapping: Mapping,
  configuration: PasswordSqlConfiguration,
  moduleId: string,
  create = true,
) {
  const database = yield* CurrentPasswordSql;

  const a = mapping.admission,
    key = column(a.table, a.moduleId);

  if (create)
    yield* configuration.insertIfAbsent(
      database.insert(a.table).values(a.encodeInsert(moduleId)),
      a.moduleId,
      moduleId,
    );

  const rows = yield* read(
    database.select().from(a.table).where(eq(key, moduleId)).limit(2),
    configuration.locking,
  );

  if (rows.length > 1 || (create && rows.length !== 1)) return yield* unavailable();

  return rows.length === 1;
});

const bindingJson = Schema.encodeSync(Schema.fromJsonString(ProofBinding));

const captureAuthority = Effect.fn("DrizzlePasswordPrepared.captureAuthority")(function* (
  mapping: Mapping,
  configuration: Pick<PasswordSqlConfiguration, "locking">,
  input: {
    readonly moduleId: string;
    readonly action: PasswordPreparedReservation["action"];
    readonly subjectId: string;
    readonly reset?: PasswordPreparedReservation["reset"];
  },
) {
  const database = yield* CurrentPasswordSql;

  const p = mapping.password;
  const locked = yield* kernel.lockSubject(p, input.subjectId, configuration.locking);

  if (locked.row === undefined || !p.subject.isActiveStatus(locked.row[p.subject.status]))
    return undefined;

  const ic = kernel.identifierColumns(p),
    ac = kernel.authorityCredentialColumns(p);

  let identifier: any;

  if (input.action !== "add-password") {
    if (input.reset !== undefined)
      identifier = (yield* kernel.lockIdentifier(
        p,
        input.reset.binding.identifier,
        configuration.locking,
      ))[0];
    else {
      const discovered = (yield* read(
        database
          .select()
          .from(p.identifier.table)
          .where(eq(ic.subjectId, locked.nativeSubjectId))
          .orderBy(ic.namespace, ic.value),
        false,
      )).find((row: any) => p.identifier.isCurrent(row));

      if (discovered !== undefined)
        identifier = (yield* kernel.lockIdentifier(
          p,
          {
            namespace: discovered[p.identifier.namespace],
            value: discovered[p.identifier.value],
          } as any,
          configuration.locking,
        ))[0];
    }
    if (
      identifier === undefined ||
      !p.identifier.isCurrent(identifier) ||
      !p.subjectId.equals(identifier[p.identifier.subjectId], locked.nativeSubjectId)
    )
      return undefined;
  }

  const credential = (yield* kernel.readPasswordCredential(
    p,
    input.moduleId,
    locked.nativeSubjectId,
    configuration.locking,
  ))[0];

  if ((input.action === "add-password") !== (credential === undefined)) return undefined;

  const snapshot =
    credential === undefined
      ? undefined
      : yield* p.credential
          .decode({ moduleId: input.moduleId, subject: locked.row, identifier, credential })
          .pipe(Effect.flatMap(snapshotPasswordCredential));

  if (
    snapshot !== undefined &&
    (snapshot.moduleId !== input.moduleId ||
      snapshot.revision.subjectId !== input.subjectId ||
      snapshot.revision.securityRevision !== locked.row[p.subject.securityRevision] ||
      snapshot.credentialId !== credential[p.credential.credentialId] ||
      snapshot.credentialRevision !== credential[p.credential.credentialRevision] ||
      snapshot.verifierVersion !== credential[p.credential.verifierVersion] ||
      Redacted.value(snapshot.verifier) !== credential[p.credential.verifier] ||
      snapshot.normalization !== credential[p.credential.normalization] ||
      snapshot.identifier.namespace !== identifier[p.identifier.namespace] ||
      snapshot.identifier.value !== identifier[p.identifier.value] ||
      snapshot.identifierBindingRevision !== identifier[p.identifier.bindingRevision])
  )
    return undefined;

  const factors = yield* read(
    database
      .select()
      .from(p.authorityCredential.table)
      .where(eq(ac.subjectId, locked.nativeSubjectId))
      .orderBy(ac.credentialId),
    configuration.locking,
  );

  const active = factors.filter(
    (row: any) =>
      p.authorityCredential.status === undefined ||
      p.authorityCredential.isActiveStatus?.(row[p.authorityCredential.status]) === true,
  );

  if (active.length > 64) return yield* unavailable();

  const revision =
    snapshot?.revision ??
    AuthenticationRevision.make({
      subjectId: input.subjectId as any,
      securityRevision: locked.row[p.subject.securityRevision],
      credentials: active.map((row: any) => ({
        credentialId: row[p.authorityCredential.credentialId],
        revision: row[p.authorityCredential.revision],
      })),
    });

  if (
    revision.credentials.some(
      (expected) =>
        !active.some(
          (row: any) =>
            row[p.authorityCredential.credentialId] === expected.credentialId &&
            row[p.authorityCredential.revision] === expected.revision,
        ),
    )
  )
    return undefined;

  const requirement = yield* p.subject
    .decodeActionRequirement(locked.row, input.action)
    .pipe(Effect.flatMap(snapshotPasswordRequirement));

  return { ...locked, identifier, snapshot, revision, requirement };
});

const currentAuthority = Effect.fn("DrizzlePasswordPrepared.currentAuthority")(function* (
  mapping: Mapping,
  configuration: Pick<PasswordSqlConfiguration, "locking">,
  record: PasswordPreparedReservation | PasswordPreparedReady,
) {
  const current = yield* captureAuthority(mapping, configuration, {
    moduleId: record.moduleId,
    action: record.action,
    subjectId: record.revision.subjectId,
    ...(record.reset === undefined ? {} : { reset: record.reset }),
  });

  if (
    current === undefined ||
    !sameRevision(current.revision, record.revision) ||
    (current.snapshot === undefined
      ? record.credential !== undefined
      : record.credential === undefined ||
        !kernel.sameCredentialSnapshot(current.snapshot, record.credential))
  )
    return undefined;

  return current;
});

const rowCondition = (mapping: Mapping, row: any) => {
  const c = columns(mapping);

  return and(
    ...Object.entries(c).map(([key, value]) => {
      const field = mapping.intent[key as keyof typeof c],
        item = row[field];

      return Predicate.isNullish(item) ? isNull(value) : eq(value, item);
    }),
  )!;
};

const readIntent = Effect.fn("Drizzle.readIntent")(function* (
  mapping: Mapping,
  condition: SQL,
  locking: boolean,
) {
  const database = yield* CurrentPasswordSql;

  return yield* read(
    database.select().from(mapping.intent.table).where(condition).limit(2),
    locking,
  );
});

const recordMatches = Effect.fn("DrizzlePasswordPrepared.recordMatches")(function* (
  mapping: Mapping,
  row: any,
  record: PasswordPreparedReservation | PasswordPreparedReady,
  nativeSubjectId: unknown,
  snapshot: string,
) {
  const t = mapping.intent,
    p = mapping.password;

  if (
    row === undefined ||
    row[t.moduleId] !== record.moduleId ||
    row[t.intentId] !== record.intentId ||
    row[t.commandId] !== record.commandId ||
    !p.subjectId.equals(row[t.subjectId], nativeSubjectId) ||
    row[t.action] !== record.action ||
    row[t.generation] !== record.generation ||
    row[t.version] !== record.version ||
    row[t.state] !== t.states[record._tag] ||
    row[t.snapshot] !== snapshot ||
    row[t.identifierScope] !== identifierScope(record) ||
    (record._tag === "Ready"
      ? row[t.digest] !== record.digest
      : !Predicate.isNullish(row[t.digest]))
  )
    return false;
  for (const [key, instant] of [
    [t.createdAt, record.createdAtMillis],
    [t.preparationExpiresAt, record.preparationExpiresAtMillis],
    [t.retainUntil, record.retainUntilMillis],
  ] as const)
    if ((yield* p.decodeInstant(row[key])) !== instant) return false;

  return record._tag === "Ready"
    ? (yield* p.decodeInstant(row[t.expiresAt])) === record.expiresAtMillis
    : Predicate.isNullish(row[t.expiresAt]);
});

const terminal = Effect.fn("DrizzlePasswordPrepared.terminal")(function* (
  mapping: Mapping,
  row: any,
  state: Exclude<PasswordPreparedState, "Preparing" | "Ready">,
) {
  const database = yield* CurrentPasswordSql;

  yield* database
    .update(mapping.intent.table)
    .set(mapping.intent.encodeTerminal(state))
    .where(rowCondition(mapping, row));

  const c = columns(mapping),
    t = mapping.intent;

  const rows = yield* readIntent(
    mapping,
    and(eq(c.moduleId, row[t.moduleId]), eq(c.intentId, row[t.intentId]))!,
    false,
  );

  const expected = { ...row, [t.state]: t.states[state], [t.snapshot]: null, [t.digest]: null };

  if (
    rows.length !== 1 ||
    (yield* readIntent(mapping, rowCondition(mapping, expected), false)).length !== 1
  )
    return yield* unavailable();
});

export const makeSqlPasswordPreparedPersistence = Effect.fn("makeSqlPasswordPreparedPersistence")(
  function* (
    mapping: Mapping,
    configuration: PasswordSqlConfiguration,
  ): Effect.fn.Return<
    PasswordPreparedPersistence,
    PasswordUnavailable,
    LifecycleHooks | CurrentPasswordSql | NativeDatabase
  > {
    const database = yield* CurrentPasswordSql;

    if (!configuration.coordinated)
      yield* validateDrizzleStorage({
        ...mapping,
        proof: configuration.proof?.mapping,
      }).pipe(Effect.mapError(unavailable));
    const hooks = yield* LifecycleHooks;

    const p = mapping.password,
      c = columns(mapping),
      t = mapping.intent;

    const owned = <A, E, R>(body: Effect.Effect<A, E, R>) =>
      valid(mapping)
        ? kernel.owned(
            database,
            p,
            configuration,
            Effect.gen(function* () {
              const journal = yield* CurrentCommitJournal;
              const guards = yield* Effect.serviceOption(PasswordPreparedJournalGuards);

              if (Option.isSome(guards) && !guards.value.register(journal.prepare(undefined)))
                return yield* unavailable();

              return yield* body;
            }),
          )
        : Effect.fail(unavailable());

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
          (completion !== undefined && configuration.proof === undefined)
        )
          return yield* unavailable();

        return yield* owned(
          Effect.gen(function* () {
            const transaction = yield* CurrentPasswordSql;
            const journal = yield* CurrentCommitJournal;

            yield* lockAnchor(mapping, configuration, input.intent.moduleId);

            const authority = yield* kernel.validateMutationAuthority(
              p,
              configuration,
              input.mutation,
              input.intent.action,
            );

            if (authority === undefined) return prepare("rejected", journal);
            const current = yield* currentAuthority(mapping, configuration, input.intent);

            if (current === undefined) return prepare("rejected", journal);

            const rows = yield* readIntent(
              mapping,
              and(eq(c.moduleId, input.intent.moduleId), eq(c.intentId, input.intent.intentId))!,
              configuration.locking,
            );

            const row = rows[0],
              encoded = yield* encodePasswordPreparedReady(input.intent);

            if (
              rows.length !== 1 ||
              !(yield* recordMatches(
                mapping,
                row,
                input.intent,
                current.nativeSubjectId,
                encoded,
              )) ||
              !evidenceCurrent(input, current.requirement, yield* nowMillis) ||
              (yield* kernel.commandExists(
                p,
                input.intent.moduleId,
                input.intent.commandId,
                configuration.locking,
              )).length !== 0
            )
              return prepare("rejected", journal);
            if (
              completion !== undefined &&
              (input.intent.reset === undefined ||
                completion.input.continuationId !== input.intent.reset.continuationId ||
                bindingJson(completion.input.binding) !== bindingJson(input.intent.reset.binding) ||
                !kernel.proofCompletionMatchesPassword({ ...input.mutation, completion }))
            )
              return prepare("rejected", journal);

            const credentialRevision = yield* kernel.allocate(
              configuration.mode,
              p.allocateRevision,
              p.allocateRevisionSync,
            );

            const verifierVersion = yield* kernel.allocate(
              configuration.mode,
              p.allocateRevision,
              p.allocateRevisionSync,
            );

            const nextSecurityRevision = yield* kernel.allocateNextSecurityRevision(
              p,
              configuration.mode,
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
                ? yield* kernel.allocate(
                    configuration.mode,
                    p.allocateCredentialId,
                    p.allocateCredentialIdSync,
                  )
                : undefined;

            let appliedAt: number | undefined;

            const assertApplied = Effect.fn("DrizzlePasswordPrepared.assertApplied")(() =>
              Effect.flatMap(CurrentPasswordPreparedTransaction, (currentTransaction) =>
                Effect.gen(function* () {
                  if (appliedAt === undefined) return;

                  if (
                    !(yield* kernel.checkMutationApplied(
                      p,
                      input.mutation,
                      current.nativeSubjectId,
                      {
                        credentialId: credentialId ?? input.intent.credential!.credentialId,
                        credentialRevision,
                        verifierVersion,
                        nextSecurityRevision,
                      },
                      appliedAt,
                    )) ||
                    (yield* readIntent(
                      mapping,
                      rowCondition(mapping, {
                        ...row,
                        [t.state]: t.states.Consumed,
                        [t.snapshot]: null,
                        [t.digest]: null,
                      }),
                      false,
                    )).length !== 1 ||
                    !evidenceCurrent(input, current.requirement, yield* nowMillis)
                  )
                    return yield* unavailable();
                }).pipe(Effect.provideService(CurrentPasswordSql, currentTransaction)),
              ),
            );

            const validateApplied = Effect.gen(function* () {
              yield* assertApplied().pipe(
                Effect.provideService(CurrentPasswordPreparedTransaction, transaction),
              );
              if (appliedAt === undefined) return;
              const postconditions = yield* Effect.serviceOption(PasswordPreparedPostconditions);

              if (
                Option.isSome(postconditions) &&
                !postconditions.value.register(assertApplied().pipe(translateFailure))
              )
                return yield* unavailable();
            });

            const apply = Effect.fn("DrizzlePasswordPrepared.apply")(function* () {
              const finalNow = yield* nowMillis;

              if (!evidenceCurrent(input, current.requirement, finalNow)) return false;

              const changed =
                input.intent.action === "add-password"
                  ? yield* kernel.addPasswordIn(
                      p,
                      configuration,
                      input.mutation,
                      {
                        credentialId: credentialId!,
                        credentialRevision,
                        verifierVersion,
                        nextSecurityRevision,
                      },
                      finalNow,
                    )
                  : yield* kernel.writeReplacement(
                      p,
                      input.mutation,
                      current.nativeSubjectId,
                      { credentialRevision, verifierVersion, nextSecurityRevision },
                      finalNow,
                    );

              if (!changed) return yield* unavailable();
              appliedAt = finalNow;
              yield* terminal(mapping, row, "Consumed");
              if (!evidenceCurrent(input, current.requirement, yield* nowMillis))
                return yield* unavailable();

              return true;
            });

            if (completion !== undefined) {
              let receipt: ReturnType<typeof prepare> | undefined;

              yield* completeProofPlanIn(
                configuration.proof!.mapping,
                configuration.proof!.configuration,
                completion,
                Effect.gen(function* () {
                  return yield* apply();
                }),
                (decision) => {
                  receipt = prepare(decision === "completed" ? "changed" : "rejected", journal);

                  return decision;
                },
              );

              yield* validateApplied;

              return receipt ?? prepare("rejected", journal);
            }

            const changed = yield* apply();

            yield* validateApplied;

            return prepare(changed ? "changed" : "rejected", journal);
          }),
        );
      });

    const services: PasswordPreparedPersistence = {
      reserve: (uncaptured, prepare) =>
        Effect.gen(function* () {
          const input = yield* snapshotReserve(uncaptured);

          if (
            (input.action === "reset-password") !==
              (input.reset !== undefined && input.completion !== undefined) ||
            (input.action === "reset-password" && configuration.proof === undefined) ||
            input.generation !== input.policy.generation ||
            input.policy.retentionMillis <
              Math.max(
                input.policy.preparationLifetimeMillis + input.policy.lifetimeMillis,
                input.policy.admission.action.windowMillis,
                input.policy.admission.identifier.windowMillis,
                input.policy.admission.subject.windowMillis,
              ) ||
            (input.invalidation.existingSessions === "immediate" &&
              p.sessionInvalidation !== "same-authority-immediate")
          )
            return yield* unavailable();

          return yield* owned(
            Effect.gen(function* () {
              const transaction = yield* CurrentPasswordSql;
              const journal = yield* CurrentCommitJournal;

              yield* lockAnchor(mapping, configuration, input.moduleId);

              const version = PasswordPreparedVersion.make(
                yield* kernel.allocate(
                  configuration.mode,
                  mapping.allocateVersion,
                  mapping.allocateVersionSync,
                ),
              );

              const authority = yield* captureAuthority(mapping, configuration, input);

              if (authority === undefined) return yield* unavailable();
              if (input.reset !== undefined) {
                if (
                  input.completion === undefined ||
                  input.completion.moduleId !== `${input.moduleId}/reset` ||
                  input.completion.purpose !== "password-reset" ||
                  input.reset.continuationId !== input.completion.continuationId ||
                  bindingJson(input.reset.binding) !== bindingJson(input.completion.binding) ||
                  input.reset.binding._tag !== "Subject" ||
                  !sameRevision(input.reset.binding.revision, authority.revision) ||
                  authority.snapshot?.identifierVerifiedAtMillis === undefined ||
                  !(yield* checkProofCompletionIn(
                    configuration.proof!.mapping,
                    configuration.proof!.configuration,
                    input.completion,
                  ))
                )
                  return yield* unavailable();
              }
              if (
                (yield* readIntent(
                  mapping,
                  and(eq(c.moduleId, input.moduleId), eq(c.commandId, input.commandId))!,
                  configuration.locking,
                )).length
              )
                return prepare({ _tag: "Existing" }, journal);

              const now = yield* nowMillis,
                nativeNow = p.encodeInstant(now);

              const scope = identifierScope({
                ...(authority.snapshot === undefined ? {} : { credential: authority.snapshot }),
                revision: authority.revision,
              });

              const active =
                (yield* read(
                  transaction
                    .select({ total: count() })
                    .from(t.table)
                    .where(
                      and(
                        eq(c.moduleId, input.moduleId),
                        eq(c.subjectId, authority.nativeSubjectId),
                        or(
                          and(
                            eq(c.state, t.states.Preparing),
                            gt(c.preparationExpiresAt, nativeNow),
                          ),
                          and(eq(c.state, t.states.Ready), gt(c.expiresAt, nativeNow)),
                        ),
                      ),
                    ),
                  false,
                ))[0]?.total ?? 0;

              if (active >= input.policy.maximumPendingPerSubject) return yield* unavailable();
              for (const [condition, budget] of [
                [eq(c.action, input.action), input.policy.admission.action],
                [eq(c.identifierScope, scope), input.policy.admission.identifier],
                [eq(c.subjectId, authority.nativeSubjectId), input.policy.admission.subject],
              ] as const) {
                const total =
                  (yield* read(
                    transaction
                      .select({ total: count() })
                      .from(t.table)
                      .where(
                        and(
                          eq(c.moduleId, input.moduleId),
                          condition,
                          gt(c.admittedAt, p.encodeInstant(now - budget.windowMillis)),
                        ),
                      ),
                    false,
                  ))[0]?.total ?? 0;

                if (total >= budget.limit) return yield* unavailable();
              }

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

              const snapshot = yield* encodeReservation(reservation);

              yield* transaction.insert(t.table).values(
                t.encodeInsert({
                  reservation,
                  nativeSubjectId: authority.nativeSubjectId,
                  identifierScope: scope,
                  snapshot,
                  admittedAtMillis: now,
                  admissionRetainUntilMillis:
                    now +
                    Math.max(
                      input.policy.admission.action.windowMillis,
                      input.policy.admission.identifier.windowMillis,
                      input.policy.admission.subject.windowMillis,
                    ),
                }),
              );

              const rows = yield* readIntent(
                mapping,
                and(eq(c.moduleId, input.moduleId), eq(c.intentId, input.intentId))!,
                false,
              );

              if (
                rows.length !== 1 ||
                !(yield* recordMatches(
                  mapping,
                  rows[0],
                  reservation,
                  authority.nativeSubjectId,
                  snapshot,
                ))
              )
                return yield* unavailable();

              const admittedUntil =
                now +
                Math.max(
                  input.policy.admission.action.windowMillis,
                  input.policy.admission.identifier.windowMillis,
                  input.policy.admission.subject.windowMillis,
                );

              if (
                (yield* p.decodeInstant(rows[0][t.admittedAt])) !== now ||
                (yield* p.decodeInstant(rows[0][t.admissionRetainUntil])) !== admittedUntil ||
                (yield* nowMillis) >= reservation.preparationExpiresAtMillis ||
                (input.completion !== undefined &&
                  !(yield* checkProofCompletionIn(
                    configuration.proof!.mapping,
                    configuration.proof!.configuration,
                    input.completion,
                  )))
              )
                return yield* unavailable();

              return prepare({ _tag: "Reserved", reservation }, journal);
            }),
          );
        }).pipe(
          Effect.provideService(CurrentPasswordSql, database),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
      publishReady: (uncaptured, prepare) =>
        Effect.gen(function* () {
          const reservation = yield* snapshotPasswordPreparedReservation(uncaptured.reservation),
            ready = yield* snapshotPasswordPreparedReady(uncaptured.ready);

          const snapshot = yield* encodeReservation(reservation),
            readySnapshot = yield* encodePasswordPreparedReady(ready);

          if ((yield* encodeReservation(reservationOf(ready))) !== snapshot)
            return yield* unavailable();

          return yield* owned(
            Effect.gen(function* () {
              const transaction = yield* CurrentPasswordSql;
              const journal = yield* CurrentCommitJournal;

              yield* lockAnchor(mapping, configuration, reservation.moduleId);
              const authority = yield* currentAuthority(mapping, configuration, reservation);

              if (authority === undefined) return prepare("rejected", journal);

              const rows = yield* readIntent(
                  mapping,
                  and(eq(c.moduleId, reservation.moduleId), eq(c.intentId, reservation.intentId))!,
                  configuration.locking,
                ),
                row = rows[0];

              const now = yield* nowMillis;

              if (
                rows.length !== 1 ||
                !(yield* recordMatches(
                  mapping,
                  row,
                  reservation,
                  authority.nativeSubjectId,
                  snapshot,
                )) ||
                now < ready.issuedAtMillis ||
                now >= reservation.preparationExpiresAtMillis ||
                now >= ready.expiresAtMillis
              )
                return prepare("rejected", journal);
              yield* transaction
                .update(t.table)
                .set(t.encodeReady({ ready, snapshot: readySnapshot }))
                .where(rowCondition(mapping, row));

              const saved = yield* readIntent(
                mapping,
                and(eq(c.moduleId, ready.moduleId), eq(c.intentId, ready.intentId))!,
                false,
              );

              if (
                saved.length !== 1 ||
                !(yield* recordMatches(
                  mapping,
                  saved[0],
                  ready,
                  authority.nativeSubjectId,
                  readySnapshot,
                )) ||
                (yield* readIntent(
                  mapping,
                  and(
                    eq(c.moduleId, ready.moduleId),
                    eq(c.intentId, ready.intentId),
                    eq(c.admittedAt, row[t.admittedAt]),
                    eq(c.admissionRetainUntil, row[t.admissionRetainUntil]),
                  )!,
                  false,
                )).length !== 1
              )
                return yield* unavailable();
              if (
                (yield* nowMillis) >= reservation.preparationExpiresAtMillis ||
                (yield* nowMillis) >= ready.expiresAtMillis
              )
                return yield* unavailable();

              return prepare("published", journal);
            }),
          );
        }).pipe(
          Effect.provideService(CurrentPasswordSql, database),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
      context: (uncaptured) =>
        Effect.gen(function* () {
          const input = yield* Schema.decodeEffect(ContextInput)({ ...uncaptured }).pipe(
            Effect.mapError(unavailable),
          );

          const record = yield* kernel.safeRead(
            database,
            configuration,
            Effect.gen(function* () {
              if (
                !valid(mapping) ||
                !(yield* lockAnchor(mapping, configuration, input.moduleId, false))
              )
                return undefined;

              const rows = yield* readIntent(
                mapping,
                and(
                  eq(c.moduleId, input.moduleId),
                  eq(c.generation, input.generation),
                  eq(c.digest, input.digest),
                  eq(c.state, t.states.Ready),
                )!,
                false,
              );

              if (rows.length !== 1) return undefined;
              const selected = yield* decodePasswordPreparedReady(rows[0][t.snapshot]);
              const authority = yield* currentAuthority(mapping, configuration, selected);

              if (authority === undefined) return undefined;

              const locked = yield* readIntent(
                mapping,
                rowCondition(mapping, rows[0]),
                configuration.locking,
              );

              const now = yield* nowMillis;

              if (
                locked.length !== 1 ||
                now < selected.issuedAtMillis ||
                now >= selected.expiresAtMillis ||
                selected.moduleId !== input.moduleId ||
                selected.generation !== input.generation ||
                selected.digest !== input.digest ||
                !(yield* recordMatches(
                  mapping,
                  locked[0],
                  selected,
                  authority.nativeSubjectId,
                  yield* encodePasswordPreparedReady(selected),
                ))
              )
                return undefined;

              return { record: selected, currentRequirement: authority.requirement };
            }),
          );

          return record ?? (yield* PasswordRejected.make({}));
        }).pipe(
          Effect.provideService(CurrentPasswordSql, database),
          Effect.provideService(LifecycleHooks, hooks),
          translateContextFailure,
        ),
      complete: (input, prepare) =>
        complete(input, prepare).pipe(
          Effect.provideService(CurrentPasswordSql, database),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
      resetWithProof: (input, prepare) =>
        complete(input, prepare).pipe(
          Effect.provideService(CurrentPasswordSql, database),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
      cancel: (uncaptured, prepare) =>
        Effect.gen(function* () {
          const record = yield* snapshotPasswordPreparedReady(uncaptured.record),
            snapshot = yield* encodePasswordPreparedReady(record);

          return yield* owned(
            Effect.gen(function* () {
              const journal = yield* CurrentCommitJournal;

              yield* lockAnchor(mapping, configuration, record.moduleId);
              const authority = yield* currentAuthority(mapping, configuration, record);

              if (authority === undefined) return prepare(false, journal);

              const rows = yield* readIntent(
                mapping,
                and(eq(c.moduleId, record.moduleId), eq(c.intentId, record.intentId))!,
                configuration.locking,
              );

              const now = yield* nowMillis;

              if (
                rows.length !== 1 ||
                now < record.issuedAtMillis ||
                now >= record.expiresAtMillis ||
                !(yield* recordMatches(
                  mapping,
                  rows[0],
                  record,
                  authority.nativeSubjectId,
                  snapshot,
                ))
              )
                return prepare(false, journal);
              yield* terminal(mapping, rows[0], "Cancelled");

              return prepare(true, journal);
            }),
          );
        }).pipe(
          Effect.provideService(CurrentPasswordSql, database),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
      cleanup: (uncaptured, prepare) =>
        Effect.gen(function* () {
          const input = { ...uncaptured };

          if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 1000)
            return yield* unavailable();

          return yield* owned(
            Effect.gen(function* () {
              const transaction = yield* CurrentPasswordSql;
              const journal = yield* CurrentCommitJournal;

              if (!(yield* lockAnchor(mapping, configuration, input.moduleId, false)))
                return prepare({ removed: 0, hasMore: false }, journal);
              const now = p.encodeInstant(yield* nowMillis);

              const due = and(
                eq(c.moduleId, input.moduleId),
                or(
                  and(lte(c.retainUntil, now), lte(c.admissionRetainUntil, now)),
                  and(
                    isNotNull(c.snapshot),
                    or(
                      and(eq(c.state, t.states.Preparing), lte(c.preparationExpiresAt, now)),
                      and(eq(c.state, t.states.Ready), lte(c.expiresAt, now)),
                    ),
                  ),
                ),
              )!;

              const rows = yield* read(
                transaction
                  .select()
                  .from(t.table)
                  .where(due)
                  .orderBy(c.createdAt, c.intentId)
                  .limit(input.limit + 1),
                configuration.locking,
              );

              let removed = 0;

              for (const row of rows.slice(0, input.limit)) {
                const expired =
                  (yield* readIntent(
                    mapping,
                    and(
                      rowCondition(mapping, row),
                      lte(c.retainUntil, now),
                      lte(c.admissionRetainUntil, now),
                    )!,
                    false,
                  )).length === 1;

                if (expired) {
                  yield* transaction.delete(t.table).where(rowCondition(mapping, row));
                  if (
                    (yield* readIntent(
                      mapping,
                      and(eq(c.moduleId, input.moduleId), eq(c.intentId, row[t.intentId]))!,
                      false,
                    )).length
                  )
                    return yield* unavailable();
                  removed++;
                } else yield* terminal(mapping, row, "Expired");
              }

              return prepare(
                {
                  removed,
                  hasMore:
                    (yield* read(transaction.select().from(t.table).where(due).limit(1), false))
                      .length > 0,
                },
                journal,
              );
            }),
          );
        }).pipe(
          Effect.provideService(CurrentPasswordSql, database),
          Effect.provideService(LifecycleHooks, hooks),
          translateFailure,
        ),
    };

    return services;
  },
);

export const passwordPreparedSqlKernel = {
  columns,
  recordMatches,
  captureAuthority,
  currentAuthority,
  rowCondition,
  valid,
  identifierScope,
};
