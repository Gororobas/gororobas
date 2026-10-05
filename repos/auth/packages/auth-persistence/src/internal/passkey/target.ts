import { type PreparedCommit, LifecycleHooks } from "@yielded/auth/Hooks";
/* oxlint-disable no-explicit-any -- existing mapped-row bridge; public adapters preserve table, ID, and Effect types. */
import {
  PasskeyConfigurationError,
  type PasskeyUnavailable,
  type PasskeyCredentials,
  type PasskeyEnrollmentContext,
  type PasskeyPersistence,
  type PreparePasskeyCommit,
  PasskeyAccess,
  PasskeyAssertionVerified,
  PasskeyCeremony,
  PasskeyClaim,
  PasskeyClaimDecision,
  PasskeyCleanupResult,
  PasskeyCredential,
  PasskeyEnrollmentSnapshot,
  PasskeyEvidence,
  PasskeyInstant,
  PasskeyIssueDecision,
  PasskeyModuleId,
  PasskeyProfile,
  PasskeyProtocolCredentialId,
  PasskeySettlement,
  PasskeyMethodPolicy,
  snapshotPasskeySync,
} from "@yielded/auth/Passkey";
import { SubjectId } from "@yielded/auth/Schema";
import { Effect, Schema } from "effect";
import type { Statement } from "effect/sql/Statement";

import type { PersistenceMappingError } from "../mapping-error";
import type {
  PasskeyCredentialServices,
  PasskeyEnrollmentContextServices,
  PasskeyMappingSource,
  PasskeyPersistenceServices,
} from "../models/passkey-model";
import type { PasskeyRegistrationCeremonyServices } from "../models/passkey-registration-ceremony-model";
import type { QueryOperations } from "../query-operations";
import type {
  TransactionCoordinatorError,
  TransactionExecution,
  TransactionTargetConfiguration,
  makeTransactionExecutionKernel,
} from "../transaction-execution-kernel";
import type { NativeDatabase } from "../transaction-kernel";
import type { makePasskeyCredentialsKernel } from "./credentials";
import type { makePasskeyFlowKernel } from "./flow";
import type { makePasskeyRegistrationCeremonyKernel } from "./registration-ceremony";
import { CurrentPasskeyTransaction } from "./state";
import type { makePasskeyStateKernel } from "./state";

export type PasskeyTargetConfiguration = TransactionTargetConfiguration<PasskeyUnavailable>;

export type PasskeyCoordinatorError<E> =
  | TransactionCoordinatorError<E, PasskeyUnavailable>
  | PasskeyConfigurationError
  | PersistenceMappingError;

export type PasskeyExecution = TransactionExecution<
  PasskeyUnavailable,
  CurrentPasskeyTransaction,
  never
>;

export const makePasskeyTargetKernel = (
  credentials: Pick<
    ReturnType<typeof makePasskeyCredentialsKernel>,
    "captureEnrollmentContext" | "lookupCredential"
  >,
  flow: Pick<
    ReturnType<typeof makePasskeyFlowKernel>,
    | "assertionPurposes"
    | "claimAssertion"
    | "cleanupCeremonies"
    | "contextAssertion"
    | "issueAssertion"
    | "settleAssertion"
  >,
  registrationCeremony: Pick<
    ReturnType<typeof makePasskeyRegistrationCeremonyKernel>,
    "claimRegistration" | "contextRegistration" | "settleRegistration"
  >,
  state: Pick<
    ReturnType<typeof makePasskeyStateKernel>,
    "captureMapping" | "invariant" | "nonce" | "unavailable" | "validateMapping"
  >,
  execution: Pick<
    ReturnType<typeof makeTransactionExecutionKernel>,
    | "coordinateTransactionOwner"
    | "makeTransactionExecution"
    | "sqlClientTransactionStandaloneGuard"
  >,
  operations: QueryOperations,
) => {
  const { captureEnrollmentContext, lookupCredential } = credentials;

  const {
    assertionPurposes,
    claimAssertion,
    cleanupCeremonies,
    contextAssertion,
    issueAssertion,
    settleAssertion,
  } = flow;

  const { claimRegistration, contextRegistration, settleRegistration } = registrationCeremony;
  const { captureMapping, nonce, unavailable, validateMapping } = state;
  const invariant: (value: unknown) => asserts value = state.invariant;

  const {
    coordinateTransactionOwner,
    makeTransactionExecution,
    sqlClientTransactionStandaloneGuard,
  } = execution;

  const sqlClientPasskeyStandaloneGuard = (
    transactionService: Parameters<typeof sqlClientTransactionStandaloneGuard>[1],
  ) => sqlClientTransactionStandaloneGuard(unavailable, transactionService);

  const emptyHooks: LifecycleHooks["Service"] = {
    before: () => Effect.void,
    after: () => Effect.succeed([]),
  };

  const makePasskeyExecution = Effect.fnUntraced(function* (
    configuration: PasskeyTargetConfiguration,
    mapping: unknown,
  ): Effect.fn.Return<
    PasskeyExecution,
    PasskeyConfigurationError,
    LifecycleHooks | NativeDatabase
  > {
    const hooks = yield* LifecycleHooks;

    yield* (operations.validateStorage?.(mapping) ?? Effect.void).pipe(
      Effect.mapError(() => PasskeyConfigurationError.make({})),
    );

    const execution = yield* makeTransactionExecution(
      CurrentPasskeyTransaction,
      configuration,
      unavailable,
      nonce,
    );

    return {
      ...execution,
      run: (operation, mutation) =>
        execution.run(operation, mutation).pipe(Effect.provideService(LifecycleHooks, hooks)),
    };
  });

  const issueInput = Schema.Struct({ ceremony: PasskeyCeremony, policy: PasskeyMethodPolicy });

  const claimInput = Schema.Struct({
    access: PasskeyAccess,
    policy: PasskeyMethodPolicy,
    ceremony: PasskeyCeremony,
    claimId: PasskeyClaim.fields.claimId,
    credential: Schema.optionalKey(PasskeyCredential),
  });

  const settleInput = Schema.Struct({
    claim: PasskeyClaim,
    nowMillis: PasskeyInstant,
    outcome: Schema.Union([
      Schema.TaggedStruct("Rejected", {}),
      Schema.TaggedStruct("Ambiguous", {}),
      Schema.TaggedStruct("Assertion", {
        credential: PasskeyCredential,
        assertion: PasskeyAssertionVerified,
        evidence: PasskeyEvidence,
      }),
    ]),
  });

  const cleanupInput = Schema.Struct({
    moduleId: PasskeyModuleId,
    nowMillis: PasskeyInstant,
    limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 })),
  });

  const lookupInput = Schema.Struct({
    rpId: PasskeyProfile.fields.rpId,
    protocolCredentialId: PasskeyProtocolCredentialId,
  });

  const contextInput = Schema.Struct({
    moduleId: PasskeyModuleId,
    rpId: PasskeyProfile.fields.rpId,
    subjectId: SubjectId,
  });

  const inputs = {
    issue: issueInput,
    context: PasskeyAccess,
    claim: claimInput,
    settle: settleInput,
    cleanup: cleanupInput,
  };

  const capturedService = <S>(
    service: S,
    schemas: Record<string, Schema.Codec<any, any, never, never>>,
    execute: PasskeyExecution,
  ): S =>
    Object.freeze(
      Object.fromEntries(
        Object.entries(
          service as Record<string, (...args: any[]) => Effect.Effect<any, PasskeyUnavailable>>,
        ).map(([name, method]) => [
          name,
          (original: any, prepare?: any) =>
            Effect.suspend(() => {
              invariant(execute.active());
              const input = snapshotPasskeySync(schemas[name]!, original);

              return method(input, prepare);
            }).pipe(
              Effect.onExit((exit) =>
                Effect.sync(() => {
                  if (exit._tag === "Failure") execute.poison();
                }),
              ),
              Effect.catchDefect(() => Effect.fail(unavailable())),
            ),
        ]),
      ),
    ) as S;

  const prepareValue = <Value, A>(
    value: Value,
    prepare: PreparePasskeyCommit<Value, A>,
  ): Effect.Effect<PreparedCommit<A>, never, CurrentPasskeyTransaction> =>
    Effect.flatMap(CurrentPasskeyTransaction, (owner) =>
      Effect.sync(() => {
        owner.guards.push(owner.journal.prepare(undefined));
        const receipt = prepare(value, owner.journal);

        invariant(
          receipt !== null &&
            typeof receipt === "object" &&
            receipt._tag === "PreparedCommit" &&
            typeof receipt.read === "object" &&
            Effect.isEffect(receipt.read),
        );
        owner.guards.push(receipt);

        return receipt;
      }),
    );

  const requirePurpose = (purpose: string, registration: boolean, enrollment = false) =>
    invariant(
      enrollment
        ? purpose === "enrollment"
        : registration
          ? purpose === "registration"
          : assertionPurposes.some((supported) => supported === purpose),
    );

  /** Context is advisory. Retain observations and final predicates without taking
   * later-ranked locks before a subsequent mutation acquires its full lock set. */
  const observationalContext = <A, E, R>(operation: Effect.Effect<A, E, R>) =>
    Effect.flatMap(CurrentPasskeyTransaction, (owner) =>
      operation.pipe(
        Effect.provideService(CurrentPasskeyTransaction, {
          ...owner,
          read: (table, where, options) => owner.read(table, where, { ...options, lock: false }),
        }),
      ),
    );

  const makePasskeyPersistence = (
    mapping: any,
    execute: PasskeyExecution,
    configuration: PasskeyTargetConfiguration,
    registration = false,
    enrollment = false,
  ): PasskeyPersistence["Service"] =>
    capturedService<PasskeyPersistence["Service"]>(
      {
        issue: (input, prepare) =>
          Effect.suspend(() => {
            invariant(!registration && !enrollment);
            requirePurpose(input.ceremony.purpose, false);

            return execute.run(
              Effect.gen(function* () {
                const value = yield* issueAssertion(mapping, input.ceremony, input.policy);

                return yield* prepareValue(
                  snapshotPasskeySync(PasskeyIssueDecision, value),
                  prepare,
                );
              }),
            );
          }),
        context: (access) =>
          Effect.suspend(() => {
            requirePurpose(access.purpose, registration, enrollment);

            return execute.run(
              observationalContext(
                registration
                  ? contextRegistration(mapping, access)
                  : contextAssertion(mapping, access),
              ),
              false,
            );
          }),
        claim: (input, prepare) =>
          Effect.suspend(() => {
            requirePurpose(input.access.purpose, registration, enrollment);
            requirePurpose(input.ceremony.purpose, registration, enrollment);
            invariant((!registration && !enrollment) || input.credential === undefined);

            return execute.run(
              Effect.gen(function* () {
                const value = yield* registration
                  ? claimRegistration(mapping, input)
                  : claimAssertion(mapping, input);

                return yield* prepareValue(
                  snapshotPasskeySync(PasskeyClaimDecision, value),
                  prepare,
                );
              }),
            );
          }),
        settle: (input, prepare) =>
          Effect.suspend(() => {
            requirePurpose(input.claim.ceremony.purpose, registration, enrollment);
            invariant((!registration && !enrollment) || input.outcome._tag !== "Assertion");

            return execute.run(
              Effect.gen(function* () {
                const value = yield* registration
                  ? settleRegistration(
                      mapping,
                      input.claim,
                      input.outcome._tag as "Rejected" | "Ambiguous",
                    )
                  : settleAssertion(mapping, input.claim, input.outcome, configuration.dialect);

                return yield* prepareValue(snapshotPasskeySync(PasskeySettlement, value), prepare);
              }),
            );
          }),
        cleanup: (input, prepare) =>
          execute.run(
            Effect.gen(function* () {
              const value = yield* cleanupCeremonies(
                mapping,
                input,
                registration ? ["registration"] : enrollment ? ["enrollment"] : assertionPurposes,
              );

              return yield* prepareValue(snapshotPasskeySync(PasskeyCleanupResult, value), prepare);
            }),
          ),
      },
      inputs,
      execute,
    );

  const credentialService = (
    mapping: any,
    execute: PasskeyExecution,
  ): PasskeyCredentials["Service"] =>
    capturedService<PasskeyCredentials["Service"]>(
      {
        lookup: (input) =>
          execute.run(lookupCredential(mapping, input.rpId, input.protocolCredentialId), false),
      },
      { lookup: lookupInput },
      execute,
    );

  const enrollmentService = (
    mapping: any,
    execute: PasskeyExecution,
  ): PasskeyEnrollmentContext["Service"] =>
    capturedService<PasskeyEnrollmentContext["Service"]>(
      {
        capture: (input) =>
          execute.run(
            Effect.map(captureEnrollmentContext(mapping, input), (value) =>
              value === undefined
                ? undefined
                : snapshotPasskeySync(PasskeyEnrollmentSnapshot, value),
            ),
            false,
          ),
      },
      { capture: contextInput },
      execute,
    );

  const registrationServices = (
    mapping: any,
    execute: PasskeyExecution,
    configuration: PasskeyTargetConfiguration,
  ): PasskeyRegistrationCeremonyServices => ({
    capabilities: Object.freeze({
      purposes: Object.freeze(["registration"] as const),
      issue: "registration-authority",
      assertionSettlement: false,
    }),
    passkeyPersistence: makePasskeyPersistence(mapping, execute, configuration, true),
  });

  const capturedMapping = <M, RSetup>(
    source: PasskeyMappingSource<M, RSetup>,
    kind: "read" | "context" | "assertion" | "registration",
    configuration: PasskeyTargetConfiguration,
  ): Effect.Effect<M, PasskeyConfigurationError | PersistenceMappingError, RSetup> =>
    Effect.flatMap(Effect.isEffect(source) ? source : Effect.succeed(source), (mapping) =>
      Effect.try({
        try: () => {
          const captured = captureMapping(mapping);

          validateMapping(captured, kind);
          if (configuration.mode === "batch") invariant((captured as any).d1?.primary === true);

          return captured;
        },
        catch: () => PasskeyConfigurationError.make({}),
      }),
    );

  const makeTargetPasskeyCredentials = <M, RSetup>(
    source: PasskeyMappingSource<M, RSetup>,
    configuration: PasskeyTargetConfiguration,
  ): Effect.Effect<
    PasskeyCredentialServices,
    PasskeyConfigurationError | PersistenceMappingError,
    RSetup | NativeDatabase
  > =>
    Effect.gen(function* () {
      const mapping = yield* capturedMapping(source, "read", configuration);

      const execution = yield* makePasskeyExecution(configuration, mapping).pipe(
        Effect.provideService(LifecycleHooks, emptyHooks),
      );

      return { passkeyCredentials: credentialService(mapping, execution) };
    });

  const makeTargetPasskeyEnrollmentContext = <M, RSetup>(
    source: PasskeyMappingSource<M, RSetup>,
    configuration: PasskeyTargetConfiguration,
  ): Effect.Effect<
    PasskeyEnrollmentContextServices,
    PasskeyConfigurationError | PersistenceMappingError,
    RSetup | NativeDatabase
  > =>
    Effect.gen(function* () {
      const mapping = yield* capturedMapping(source, "context", configuration);

      const execution = yield* makePasskeyExecution(configuration, mapping).pipe(
        Effect.provideService(LifecycleHooks, emptyHooks),
      );

      return { passkeyEnrollmentContext: enrollmentService(mapping, execution) };
    });

  const makeTargetPasskeyPersistence = <M, RSetup>(
    source: PasskeyMappingSource<M, RSetup>,
    configuration: PasskeyTargetConfiguration,
  ): Effect.Effect<
    PasskeyPersistenceServices,
    PasskeyConfigurationError | PersistenceMappingError,
    RSetup | LifecycleHooks | NativeDatabase
  > =>
    Effect.gen(function* () {
      const mapping = yield* capturedMapping(source, "assertion", configuration);
      const execution = yield* makePasskeyExecution(configuration, mapping);

      return {
        passkeyPersistence: makePasskeyPersistence(mapping, execution, configuration),
      };
    });

  const makeTargetPasskeyRegistration = <M, RSetup>(
    source: PasskeyMappingSource<M, RSetup>,
    configuration: PasskeyTargetConfiguration,
  ): Effect.Effect<
    PasskeyRegistrationCeremonyServices,
    PasskeyConfigurationError | PersistenceMappingError,
    RSetup | LifecycleHooks | NativeDatabase
  > =>
    Effect.gen(function* () {
      const mapping = yield* capturedMapping(source, "registration", configuration);
      const execution = yield* makePasskeyExecution(configuration, mapping);

      return registrationServices(mapping, execution, configuration);
    });

  const coordinateTargetPasskey = <M, RSetup, Transaction, A, E, R>(
    database: any,
    source: PasskeyMappingSource<M, RSetup>,
    configuration: PasskeyTargetConfiguration,
    owner: (
      transaction: Transaction,
      services: PasskeyPersistenceServices,
      append: (statement: Statement<unknown>) => void,
    ) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, PasskeyCoordinatorError<E>, R | RSetup | LifecycleHooks | NativeDatabase> =>
    Effect.flatMap(capturedMapping(source, "assertion", configuration), (mapping) =>
      Effect.flatMap(LifecycleHooks, (hooks) =>
        coordinateTransactionOwner(
          database,
          CurrentPasskeyTransaction,
          configuration,
          operations.validateStorage?.(mapping) ?? Effect.void,
          unavailable,
          nonce,
          (execution) => ({
            passkeyPersistence: makePasskeyPersistence(
              mapping,
              {
                ...execution,
                run: (operation, mutation) =>
                  execution
                    .run(operation, mutation)
                    .pipe(Effect.provideService(LifecycleHooks, hooks)),
              },
              configuration,
            ),
          }),
          owner,
        ).pipe(Effect.provideService(LifecycleHooks, hooks)),
      ),
    );

  const coordinateTargetPasskeyRegistration = <M, RSetup, Transaction, A, E, R>(
    database: any,
    source: PasskeyMappingSource<M, RSetup>,
    configuration: PasskeyTargetConfiguration,
    owner: (
      transaction: Transaction,
      services: PasskeyRegistrationCeremonyServices,
      append: (statement: Statement<unknown>) => void,
    ) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, PasskeyCoordinatorError<E>, R | RSetup | LifecycleHooks | NativeDatabase> =>
    Effect.flatMap(capturedMapping(source, "registration", configuration), (mapping) =>
      Effect.flatMap(LifecycleHooks, (hooks) =>
        coordinateTransactionOwner(
          database,
          CurrentPasskeyTransaction,
          configuration,
          operations.validateStorage?.(mapping) ?? Effect.void,
          unavailable,
          nonce,
          (execution) =>
            registrationServices(
              mapping,
              {
                ...execution,
                run: (operation, mutation) =>
                  execution
                    .run(operation, mutation)
                    .pipe(Effect.provideService(LifecycleHooks, hooks)),
              },
              configuration,
            ),
          owner,
        ).pipe(Effect.provideService(LifecycleHooks, hooks)),
      ),
    );

  return {
    sqlClientPasskeyStandaloneGuard,
    makePasskeyExecution,
    capturedService,
    prepareValue,
    observationalContext,
    makePasskeyPersistence,
    capturedMapping,
    makeTargetPasskeyCredentials,
    makeTargetPasskeyEnrollmentContext,
    makeTargetPasskeyPersistence,
    makeTargetPasskeyRegistration,
    coordinateTargetPasskey,
    coordinateTargetPasskeyRegistration,
  };
};
