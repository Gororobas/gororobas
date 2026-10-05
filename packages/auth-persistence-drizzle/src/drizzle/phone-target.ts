import { randomId } from "@yielded/auth-crypto";
import { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import { LifecycleHooks } from "@yielded/auth/Hooks";
import {
  PhoneConfigurationError,
  PhoneLifecyclePolicy,
  PhoneAdmissionPolicy,
  PhoneLifecycleTarget,
  PhoneActionAuthorization,
  PhoneAdmission,
  type PhoneMutation,
  PhonePersistence,
  PhoneSignInTargets,
  type PhoneOtpUnavailable as PhoneUnavailable,
} from "@yielded/auth/PhoneOtp";
import { ProofBinding } from "@yielded/auth/Proofs";
import { sql, type Table } from "drizzle-orm";
/* oxlint-disable no-explicit-any -- shared native implementation; driver entrypoints retain exact database and table types. */
import { Context, Effect, Schema } from "effect";
import type { Statement } from "effect/sql/Statement";

import { CurrentD1PlanningDatabase } from "./d1-planning";
import { compileD1ProofCompletionPlan } from "./d1-proofs";
import type { PersistenceMappingError } from "./model";
import { nativeDatabase } from "./native-database";
import {
  phoneProofs,
  type PhoneMapping,
  type PhoneMappingSource,
  type PhonePersistenceServices,
  type PhoneProofCompletionMapping,
  requiredPhoneConstraints,
} from "./phone-model";
import {
  capturePhone,
  lookupPhone,
  admitPhone,
  cleanupPhoneAdmission,
  CurrentPhoneTransaction,
  invariant,
  equal,
  preparePhoneMutation,
  unavailable,
} from "./phone-state";
import { requiredProofConstraints } from "./proof-model";
import { completeProofPlanIn, CurrentProofSql } from "./proof-sql";
import { validateDrizzleStorage } from "./storage-validation";
import type { SuppliedService } from "./SuppliedService";
import {
  coordinateTransactionOwner,
  makeTransactionExecution,
  sqlClientTransactionStandaloneGuard,
  type TransactionExecution,
  type TransactionTargetConfiguration,
  type TransactionCoordinatorError,
} from "./transaction-execution";
import type { TransactionNativeDatabase } from "./transaction-owner";
export type PhoneTargetConfiguration = TransactionTargetConfiguration<PhoneUnavailable>;

export type PhoneCoordinatorError<E> =
  | TransactionCoordinatorError<E, PhoneUnavailable>
  | PhoneConfigurationError
  | PersistenceMappingError;

export const sqlClientPhoneStandaloneGuard = (
  service: Parameters<typeof sqlClientTransactionStandaloneGuard>[1],
) => sqlClientTransactionStandaloneGuard(unavailable, service);

const validateMapping = <M>(original: M, configuration: PhoneTargetConfiguration): M => {
  const mapping = original as any;

  invariant(mapping.moduleId.length > 0);
  Schema.decodeSync(PhoneLifecyclePolicy)(mapping.policy);
  Schema.decodeSync(PhoneAdmissionPolicy)(mapping.admission);
  invariant(mapping.admission.requestRetentionMillis >= mapping.admission.windowMillis);
  const proofs = phoneProofs(mapping.proofs);

  invariant(proofs !== undefined);
  for (const [key, value] of Object.entries(requiredProofConstraints))
    invariant((proofs.constraints as any)?.[key] === value);
  if (configuration.mode === "synchronous") invariant(proofs.allocateVersionSync !== undefined);
  if (configuration.mode === "batch")
    invariant(
      proofs.d1 !== undefined && proofs.authority.identifier.d1CurrentCondition !== undefined,
    );
  for (const [key, value] of Object.entries(requiredPhoneConstraints))
    invariant(mapping.constraints?.[key] === value);
  if (configuration.mode === "batch") invariant(mapping.d1?.primary === true);

  return Object.freeze({
    ...mapping,
    policy: Object.freeze({ ...mapping.policy }),
    subject: Object.freeze({ ...mapping.subject }),
    state: Object.freeze({ ...mapping.state }),
    identifier: Object.freeze({ ...mapping.identifier }),
    admission: Object.freeze({ ...mapping.admission }),
    credential: Object.freeze({ ...mapping.credential }),
    subjectIds: Object.freeze({ ...mapping.subjectIds }),
  });
};

const services = Effect.fnUntraced(function* (
  mapping: any,
  execution: TransactionExecution<PhoneUnavailable, CurrentPhoneTransaction>,
  configuration: PhoneTargetConfiguration,
): Effect.fn.Return<PhonePersistenceServices, never, LifecycleHooks> {
  const hooks = yield* LifecycleHooks;

  const run = <A, E, R>(effect: Effect.Effect<A, E, R>, mutation = true) =>
    execution.admit.pipe(
      Effect.andThen(execution.run(effect, mutation)),
      Effect.provideService(LifecycleHooks, hooks),
    );

  return {
    phoneAdmission: PhoneAdmission.of({
      admit: (input) => run(admitPhone(mapping, { ...input })),
      cleanup: (input) => run(cleanupPhoneAdmission(mapping, { ...input })),
    }),
    phoneSignInTargets: PhoneSignInTargets.of({
      lookup: (input) => run(lookupPhone(mapping, { ...input }), false),
    }),
    phonePersistence: PhonePersistence.of({
      target: (input) =>
        run(
          Effect.gen(function* () {
            invariant(input.moduleId === mapping.moduleId);

            return (yield* capturePhone(mapping, { ...input })).target;
          }),
          false,
        ),
      mutate: (original, prepare) =>
        Effect.suspend(() => {
          const input: PhoneMutation = {
            ...original,
            target: Schema.decodeSync(Schema.toCodecIso(PhoneLifecycleTarget))(
              Schema.encodeSync(Schema.toCodecIso(PhoneLifecycleTarget))(original.target),
            ),
            policy: { ...original.policy },
            ...(original.authorization === undefined
              ? {}
              : {
                  authorization: Schema.decodeSync(Schema.toCodecIso(PhoneActionAuthorization))(
                    Schema.encodeSync(Schema.toCodecIso(PhoneActionAuthorization))(
                      original.authorization,
                    ),
                  ),
                }),
            completion: {
              input: {
                ...original.completion.input,
                binding: Schema.decodeSync(Schema.toCodecIso(ProofBinding))(
                  Schema.encodeSync(Schema.toCodecIso(ProofBinding))(
                    original.completion.input.binding,
                  ),
                ),
              },
              prepare: original.completion.prepare,
            },
          };

          return run(
            Effect.gen(function* () {
              const owner = yield* CurrentPhoneTransaction,
                candidate = yield* preparePhoneMutation(mapping, input);

              if (candidate.mutate === undefined) {
                const receipt = prepare(candidate.decision, owner.journal);

                owner.guards.push(receipt as any);

                return receipt;
              }
              const cn = phoneProofs(mapping.proofs).continuation;

              const observed = yield* owner.read(
                cn.table,
                equal(cn.table, {
                  [cn.moduleId]: input.completion.input.moduleId,
                  [cn.continuationId]: input.completion.input.continuationId,
                }),
                { limit: 1 },
              );

              let completed = false;

              const plan = {
                ...input.completion,
                prepare: (decision: any, journal: any) => {
                  completed = decision === "completed";
                  const proofReceipt = input.completion.prepare(decision, journal, () => undefined);

                  owner.guards.push(proofReceipt);

                  return prepare(
                    decision === "completed" ? candidate.decision : { _tag: "Rejected" },
                    journal,
                  );
                },
              };

              let receipt;

              if (owner.batch) {
                const offset = owner.statements.length;

                yield* candidate.mutate;
                const statements = owner.statements.splice(offset);

                const compiled = yield* compileD1ProofCompletionPlan(
                  phoneProofs(mapping.proofs) as any,
                  plan as any,
                  { statements, appliedCondition: candidate.appliedCondition! },
                  (x) => x,
                ).pipe(Effect.provideService(CurrentD1PlanningDatabase, owner.database));

                // Mutation observations describe an accepted plan. A stale proof aborts this owner.
                invariant(compiled.statements.length !== 0);
                owner.statements.push(...compiled.statements, ...(compiled.postconditions ?? []));
                receipt = compiled.receipt;
              } else {
                receipt = yield* completeProofPlanIn(
                  phoneProofs(mapping.proofs),
                  {
                    mode: configuration.mode === "synchronous" ? "synchronous" : "interactive",
                    locking: configuration.locking,
                    standaloneGuard: Effect.void,
                    coordinated: true,
                    insertIfAbsent: (query: any, key, value) =>
                      configuration.dialect === "mysql"
                        ? query.onDuplicateKeyUpdate({ set: { [key]: value } })
                        : query.onConflictDoNothing(),
                  },
                  plan as any,
                  candidate.mutate,
                  (x) => x,
                ).pipe(Effect.provideService(CurrentProofSql, owner.database));
              }
              if (completed) {
                invariant(observed.rows.length === 1);
                const record = yield* cn.decode(observed.rows[0]!);

                observed.rows = observed.rows.map((row) => ({ ...row, [cn.consumed]: true }));
                const command = phoneProofs(mapping.proofs).command;

                owner.postconditions.push(
                  sql`${mapping.engineNowMillis} < ${record.expiresAtMillis}`,
                  sql`exists(select 1 from ${command.table} where ${equal(command.table, { [command.moduleId]: input.completion.input.moduleId, [command.commandId]: input.completion.input.continuationDigest, [command.kind]: "complete", [command.decision]: "completed", [command.retentionUntil]: phoneProofs(mapping.proofs).encodeInstant(record.expiresAtMillis) })})`,
                );
              }
              invariant(receipt?._tag === "PreparedCommit");
              owner.guards.push(receipt as any);

              return receipt as ReturnType<typeof prepare>;
            }),
          );
        }).pipe(Effect.catchDefect(() => Effect.fail(unavailable()))),
    }),
  };
});

export const makeTargetPhonePersistence = <
  S extends Table,
  I extends Table,
  F extends Table,
  C extends Table,
  N,
  RSetup = never,
>(
  source: PhoneMappingSource<PhoneMapping<S, I, C, F, N>, RSetup>,
  configuration: PhoneTargetConfiguration,
) =>
  Effect.gen(function* () {
    const original = yield* Effect.isEffect(source) ? source : Effect.succeed(source);

    const mapping = yield* Effect.try({
      try: () => validateMapping(original, configuration),
      catch: () => PhoneConfigurationError.make({}),
    });

    yield* validateDrizzleStorage({
      ...mapping,
      proofs: phoneProofs(mapping.proofs),
    }).pipe(Effect.mapError(() => PhoneConfigurationError.make({})));

    const execution = yield* makeTransactionExecution(
      CurrentPhoneTransaction,
      configuration,
      unavailable,
      randomId,
    );

    return yield* services(mapping, execution, configuration);
  });

export const coordinateTargetPhone = <
  M extends { readonly proofs: PhoneProofCompletionMapping },
  A,
  E,
  R,
  RSetup = never,
>(
  database: TransactionNativeDatabase,
  source: PhoneMappingSource<M, RSetup>,
  configuration: PhoneTargetConfiguration,
  body: (
    transaction: any,
    services: PhonePersistenceServices,
    append: (statement: Statement<any>) => void,
  ) => Effect.Effect<A, E, R>,
): Effect.Effect<A, PhoneCoordinatorError<E>, R | RSetup | LifecycleHooks | NativeDatabase> =>
  Effect.gen(function* () {
    const original = yield* Effect.isEffect(source) ? source : Effect.succeed(source);

    const mapping = yield* Effect.try({
      try: () => validateMapping(original, configuration),
      catch: () => PhoneConfigurationError.make({}),
    });

    yield* validateDrizzleStorage({
      ...mapping,
      proofs: phoneProofs(mapping.proofs),
    }).pipe(Effect.mapError(() => PhoneConfigurationError.make({})));

    return yield* coordinateTransactionOwner(
      database,
      CurrentPhoneTransaction,
      configuration,
      Effect.void,
      unavailable,
      randomId,
      (execution) => services(mapping, execution, configuration),
      (transaction, acquireServices, append) =>
        Effect.flatMap(acquireServices, (boundServices) =>
          body(transaction, boundServices, append),
        ),
    );
  });

type TransactionOf<D> = D extends { readonly transaction: (...args: any[]) => any }
  ? Parameters<Parameters<D["transaction"]>[0]>[0]
  : never;

/** Concrete driver wrappers select transaction mode; cryptography always precedes these owners. */
export const makePhoneTarget = <
  DatabaseId,
  D extends { readonly transaction: any },
  T extends Table,
  Extra = unknown,
  Synchronous extends boolean = false,
>(
  databaseService: Context.Service<DatabaseId, D>,
  configuration: PhoneTargetConfiguration,
) => {
  function coordinatePhonePersistence<
    Database extends D,
    S extends T,
    I extends T,
    F extends T,
    C extends T,
    N,
    A,
    E,
    R,
    RSetup = never,
    DatabaseError = never,
    DatabaseRequirements = never,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: PhoneMappingSource<PhoneMapping<S, I, C, F, N> & Extra, RSetup>;
      readonly transaction?: never;
    },
    body: Effect.Effect<
      A,
      E,
      Synchronous extends true ? NoInfer<PhonePersistence | PhoneAdmission | PhoneSignInTargets> : R
    >,
  ): Effect.Effect<
    A,
    PhoneCoordinatorError<E> | DatabaseError,
    | (Synchronous extends true
        ? never
        : Exclude<R, PhonePersistence | PhoneAdmission | PhoneSignInTargets>)
    | LifecycleHooks
    | RSetup
    | DatabaseRequirements
  >;
  function coordinatePhonePersistence<
    Database extends D,
    S extends T,
    I extends T,
    F extends T,
    C extends T,
    N,
    A,
    E,
    R,
    TxId,
    TxShape,
    RSetup = never,
    DatabaseError = never,
    DatabaseRequirements = never,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: PhoneMappingSource<PhoneMapping<S, I, C, F, N> & Extra, RSetup>;
      readonly transaction: SuppliedService<TxId, NoInfer<TransactionOf<Database>>, TxShape>;
    },
    body: Effect.Effect<
      A,
      E,
      Synchronous extends true
        ? NoInfer<PhonePersistence | PhoneAdmission | PhoneSignInTargets | TxId>
        : R
    >,
  ): Effect.Effect<
    A,
    PhoneCoordinatorError<E> | DatabaseError,
    | (Synchronous extends true
        ? never
        : Exclude<R, PhonePersistence | PhoneAdmission | PhoneSignInTargets | TxId>)
    | LifecycleHooks
    | RSetup
    | DatabaseRequirements
  >;
  function coordinatePhonePersistence<
    Database extends D,
    S extends T,
    I extends T,
    F extends T,
    C extends T,
    N,
    A,
    E,
    R,
    TxId,
    TxShape,
    RSetup = never,
    DatabaseError = never,
    DatabaseRequirements = never,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: PhoneMappingSource<PhoneMapping<S, I, C, F, N> & Extra, RSetup>;
      readonly transaction?: SuppliedService<TxId, NoInfer<TransactionOf<Database>>, TxShape>;
    },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    PhoneCoordinatorError<E> | DatabaseError,
    | Exclude<R, PhonePersistence | PhoneAdmission | PhoneSignInTargets>
    | LifecycleHooks
    | RSetup
    | DatabaseRequirements
  > {
    return Effect.flatMap(nativeDatabase(acquire), (database) =>
      coordinateTargetPhone(
        database as any,
        options.mapping,
        configuration,
        (
          transaction: TransactionOf<Database>,
          services,
        ): Effect.Effect<
          A,
          E,
          Exclude<R, PhonePersistence | PhoneAdmission | PhoneSignInTargets>
        > => {
          const provided = Context.make(PhonePersistence, services.phonePersistence).pipe(
            Context.add(PhoneAdmission, services.phoneAdmission),
            Context.add(PhoneSignInTargets, services.phoneSignInTargets),
          );

          const work = Effect.provideContext(body, provided);

          return options.transaction === undefined
            ? work
            : Effect.provideService(work, options.transaction, options.transaction.of(transaction));
        },
      ).pipe(Effect.provideService(NativeDatabase, database)),
    );
  }

  return {
    makePhonePersistenceServices: <
      S extends T,
      I extends T,
      F extends T,
      C extends T,
      N,
      RSetup = never,
    >(
      mapping: PhoneMappingSource<PhoneMapping<S, I, C, F, N> & Extra, RSetup>,
    ) =>
      makeTargetPhonePersistence(mapping, configuration).pipe(
        Effect.provideServiceEffect(NativeDatabase, nativeDatabase(databaseService)),
      ),
    coordinatePhonePersistence,
  };
};
