import { LifecycleHooks } from "@yielded/auth/Hooks";
/* oxlint-disable no-explicit-any -- existing mapped-row bridge; public adapters preserve table, ID, and Effect types. */
import {
  PasskeyConfigurationError,
  PasskeyManagementPersistence,
  PasskeyManagementPolicy,
  PasskeyMethodPolicy,
  snapshotPasskeySync,
} from "@yielded/auth/Passkey";
import * as M from "@yielded/auth/Passkey";
import { SubjectId } from "@yielded/auth/Schema";
import { SessionInvalidationWindow } from "@yielded/auth/Sessions";
import { Effect, Layer, Schema } from "effect";
import type { Statement } from "effect/sql/Statement";

import type { PasskeyMappingSource } from "../models/passkey-model";
import type {
  PasskeyManagementServices,
  PasskeyRegistrationServices,
  PasskeyRegistrationWriter,
} from "../models/passkey-write-model";
import type { QueryOperations } from "../query-operations";
import type { makeTransactionExecutionKernel } from "../transaction-execution-kernel";
import type { NativeDatabase } from "../transaction-kernel";
import type { makePasskeyEnrollmentKernel } from "./enrollment";
import type { makePasskeyManagementKernel } from "./management";
import type { makePasskeyRegistrationWriteKernel } from "./registration-write";
import { CurrentPasskeyTransaction } from "./state";
import type { makePasskeyStateKernel } from "./state";
import type {
  PasskeyExecution,
  PasskeyCoordinatorError,
  PasskeyTargetConfiguration,
  makePasskeyTargetKernel,
} from "./target";

export const makePasskeyWriteTargetKernel = (
  operations: QueryOperations,
  enrollment: Pick<
    ReturnType<typeof makePasskeyEnrollmentKernel>,
    "completeEnrollment" | "issueEnrollment"
  >,
  management: Pick<
    ReturnType<typeof makePasskeyManagementKernel>,
    "inspectRemove" | "listCredentials" | "removeCredential" | "renameCredential"
  >,
  registrationWrite: Pick<
    ReturnType<typeof makePasskeyRegistrationWriteKernel>,
    "completeRegistration" | "inspectRegistration" | "issueRegistration"
  >,
  state: Pick<ReturnType<typeof makePasskeyStateKernel>, "invariant" | "nonce" | "unavailable">,
  target: Pick<
    ReturnType<typeof makePasskeyTargetKernel>,
    | "capturedMapping"
    | "capturedService"
    | "makePasskeyExecution"
    | "makePasskeyPersistence"
    | "observationalContext"
    | "prepareValue"
  >,
  execution: Pick<ReturnType<typeof makeTransactionExecutionKernel>, "coordinateTransactionOwner">,
) => {
  const { getTableColumns } = operations;
  const { completeEnrollment, issueEnrollment } = enrollment;
  const { inspectRemove, listCredentials, removeCredential, renameCredential } = management;
  const { completeRegistration, inspectRegistration, issueRegistration } = registrationWrite;
  const { nonce, unavailable } = state;
  const invariant: (value: unknown) => asserts value = state.invariant;

  const {
    capturedMapping,
    capturedService,
    makePasskeyExecution,
    makePasskeyPersistence,
    observationalContext,
    prepareValue,
  } = target;

  const { coordinateTransactionOwner } = execution;

  const passkeyManagementPersistenceLayer = <E, R>(
    services: Effect.Effect<PasskeyManagementServices, E, R>,
  ) =>
    Layer.effect(
      PasskeyManagementPersistence,
      Effect.map(services, (value) => value.passkeyManagementPersistence),
    );

  const issueSchema = Schema.Struct({
    ceremony: M.PasskeyCeremony,
    policy: PasskeyMethodPolicy,
    management: PasskeyManagementPolicy,
    authorization: M.PasskeyActionAuthorization,
  });

  const completeSchema = Schema.Struct({
    claim: M.PasskeyClaim,
    verified: M.PasskeyRegistrationVerified,
    authorization: M.PasskeyActionAuthorization,
    management: PasskeyManagementPolicy,
    nowMillis: M.PasskeyInstant,
  });

  const metadata = { moduleId: M.PasskeyModuleId, subjectId: SubjectId };

  const identity = {
    ...metadata,
    commandId: M.PasskeyCommandId,
    credentialId: M.PasskeyCredentialId,
  };

  const retention = { nowMillis: M.PasskeyInstant, retentionUntilMillis: M.PasskeyInstant };

  const managementSchemas = {
    list: Schema.Struct({
      ...metadata,
      cursor: Schema.optionalKey(M.PasskeyCredentialId),
      limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 64 })),
    }),
    issueEnrollment: issueSchema,
    completeEnrollment: completeSchema,
    inspectRemove: Schema.Struct(identity),
    rename: Schema.Struct({ ...identity, ...retention, name: M.PasskeyLabel }),
    remove: Schema.Struct({
      moduleId: M.PasskeyModuleId,
      commandId: M.PasskeyCommandId,
      credential: M.PasskeyCredential,
      authorization: M.PasskeyActionAuthorization,
      management: PasskeyManagementPolicy,
      invalidation: SessionInvalidationWindow,
      ...retention,
    }),
  };

  const enrolled = Schema.Union([
    Schema.TaggedStruct("Enrolled", { credential: M.PasskeyCredentialSummary }),
    Schema.TaggedStruct("Rejected", {}),
  ]);

  const renamed = Schema.Union([
    Schema.TaggedStruct("Renamed", {
      credential: M.PasskeyCredentialSummary,
      replayed: Schema.Boolean,
    }),
    Schema.TaggedStruct("Rejected", {}),
  ]);

  const removed = Schema.Union([
    Schema.TaggedStruct("Removed", { result: M.PasskeyRemoved }),
    Schema.TaggedStruct("Rejected", {}),
    Schema.TaggedStruct("LastSignInMethod", {}),
  ]);

  const registrationDecision = Schema.Union([
    M.PasskeyRegistrationResult,
    Schema.TaggedStruct("Rejected", {}),
  ]);

  const managementService = (
    mapping: any,
    execute: PasskeyExecution,
  ): PasskeyManagementPersistence["Service"] =>
    capturedService<PasskeyManagementPersistence["Service"]>(
      {
        list: (input) => execute.run(observationalContext(listCredentials(mapping, input)), false),
        inspectRemove: (input) =>
          execute.run(observationalContext(inspectRemove(mapping, input)), false),
        issueEnrollment: (input, prepare) =>
          execute.run(
            Effect.gen(function* () {
              return yield* prepareValue(
                snapshotPasskeySync(M.PasskeyIssueDecision, yield* issueEnrollment(mapping, input)),
                prepare,
              );
            }),
          ),
        completeEnrollment: (input, prepare) =>
          execute.run(
            Effect.gen(function* () {
              return yield* prepareValue(
                snapshotPasskeySync(enrolled, yield* completeEnrollment(mapping, input)),
                prepare,
              );
            }),
          ),
        rename: (input, prepare) =>
          execute.run(
            Effect.gen(function* () {
              return yield* prepareValue(
                snapshotPasskeySync(renamed, yield* renameCredential(mapping, input)),
                prepare,
              );
            }),
          ),
        remove: (input, prepare) =>
          execute.run(
            Effect.gen(function* () {
              return yield* prepareValue(
                snapshotPasskeySync(removed, yield* removeCredential(mapping, input)),
                prepare,
              );
            }),
          ),
      },
      managementSchemas,
      execute,
    );

  const registrationService = <R>(
    mapping: any,
    execute: PasskeyExecution,
  ): PasskeyRegistrationWriter<R> =>
    capturedService<PasskeyRegistrationWriter<R>>(
      {
        inspect: (registration) =>
          execute.run(observationalContext(inspectRegistration(mapping, registration)), false),
        issueRegistration: (input, prepare) =>
          execute.run(
            Effect.gen(function* () {
              return yield* prepareValue(
                snapshotPasskeySync(
                  M.PasskeyIssueDecision,
                  yield* issueRegistration(mapping, input),
                ),
                prepare,
              );
            }),
          ),
        completeRegistration: (input, prepare) =>
          execute.run(
            Effect.gen(function* () {
              return yield* prepareValue(
                snapshotPasskeySync(
                  registrationDecision,
                  yield* completeRegistration(mapping, input),
                ),
                prepare,
              );
            }),
          ),
      },
      {
        inspect: Schema.toType(mapping.registration.schema),
        issueRegistration: Schema.Struct({
          ceremony: M.PasskeyCeremony,
          policy: PasskeyMethodPolicy,
          registration: Schema.toType(mapping.registration.schema),
        }),
        completeRegistration: Schema.Struct({
          claim: M.PasskeyClaim,
          verified: M.PasskeyRegistrationVerified,
          nowMillis: M.PasskeyInstant,
        }),
      },
      execute,
    );

  const descriptor = (table: any) => {
    const columns = getTableColumns(table.table);

    for (const [field, name] of Object.entries(table))
      if (typeof name === "string" && !field.endsWith("State"))
        invariant(columns[name] !== undefined);
  };

  const writeMapping = <M, RSetup>(
    source: PasskeyMappingSource<M, RSetup>,
    configuration: PasskeyTargetConfiguration,
    registration: boolean,
  ) =>
    Effect.flatMap(capturedMapping(source, "assertion", configuration), (mapping) =>
      Effect.try({
        try: () => {
          const m = mapping as any;

          for (const name of [m.write.credential.name, m.write.credential.createdAt])
            invariant(getTableColumns(m.read.credential.table)[name] !== undefined);
          for (const name of m.write.policy.subjectColumns)
            invariant(getTableColumns(m.read.subject.table)[name] !== undefined);
          invariant(
            m.write.credential.activeStatus !== m.write.credential.removedStatus &&
              m.write.authority.activeStatus !== m.write.authority.removedStatus &&
              m.write.credentialOwnership.ownedState !== m.write.credentialOwnership.removedState,
          );
          invariant(
            m.read.credential.isActiveStatus(m.write.credential.activeStatus) &&
              !m.read.credential.isActiveStatus(m.write.credential.removedStatus) &&
              m.read.authority.isActiveStatus(m.write.authority.activeStatus) &&
              !m.read.authority.isActiveStatus(m.write.authority.removedStatus) &&
              m.read.credentialOwnership.isOwnedState(m.write.credentialOwnership.ownedState) &&
              !m.read.credentialOwnership.isOwnedState(m.write.credentialOwnership.removedState) &&
              m.read.handleOwnership.isOwnedState(m.write.handleOwnership.ownedState),
          );
          if (registration) {
            descriptor(m.intent);
            descriptor(m.handle);
            invariant(m.handle.table === m.read.handleOwnership.table);
            invariant(
              m.handle.reservedState !== m.write.handleOwnership.ownedState &&
                m.intent.pendingState !== m.intent.acceptedState &&
                m.intent.rejectedState !== m.intent.pendingState &&
                m.intent.rejectedState !== m.intent.acceptedState,
            );
            invariant(
              m.registrationConstraints.intentFlow.join("/") === "moduleId/flowId" &&
                m.registrationConstraints.intentCommand.join("/") === "moduleId/commandId" &&
                m.registrationConstraints.handle.join("/") === "handleKey",
            );
          } else {
            descriptor(m.command);
            invariant(m.managementConstraints.command.join("/") === "moduleId/commandId");
            snapshotPasskeySync(SessionInvalidationWindow, m.invalidation.window);
            invariant(
              m.invalidation.window.trigger === "credential-change" &&
                m.invalidation.mutations.length <= 32,
            );
          }

          return mapping;
        },
        catch: () => PasskeyConfigurationError.make({}),
      }),
    );

  const managementServices = (
    mapping: any,
    execute: PasskeyExecution,
    configuration: PasskeyTargetConfiguration,
  ): PasskeyManagementServices => ({
    passkeyManagementPersistence: managementService(mapping, execute),
    passkeyPersistence: makePasskeyPersistence(mapping, execute, configuration, false, true),
  });

  const registrationServices = <R>(
    mapping: any,
    execute: PasskeyExecution,
    configuration: PasskeyTargetConfiguration,
  ): PasskeyRegistrationServices<R> => ({
    passkeyRegistrationAuthority: registrationService<R>(mapping, execute),
    passkeyPersistence: makePasskeyPersistence(mapping, execute, configuration, true),
  });

  const makeTargetPasskeyManagement = <M, RSetup>(
    source: PasskeyMappingSource<M, RSetup>,
    configuration: PasskeyTargetConfiguration,
  ) =>
    Effect.gen(function* () {
      const mapping = yield* writeMapping(source, configuration, false);
      const execution = yield* makePasskeyExecution(configuration, mapping);

      return managementServices(mapping, execution, configuration);
    });

  const makeTargetPasskeyRegistrationWriter = <M, R, RSetup>(
    source: PasskeyMappingSource<M, RSetup>,
    configuration: PasskeyTargetConfiguration,
  ) =>
    Effect.gen(function* () {
      const mapping = yield* writeMapping(source, configuration, true);
      const execution = yield* makePasskeyExecution(configuration, mapping);

      return registrationServices<R>(mapping, execution, configuration);
    });

  const coordinateTargetPasskeyManagement = <M, RSetup, Transaction, A, E, R>(
    database: any,
    source: PasskeyMappingSource<M, RSetup>,
    configuration: PasskeyTargetConfiguration,
    body: (
      transaction: Transaction,
      services: PasskeyManagementServices,
      append: (statement: Statement<unknown>) => void,
    ) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, PasskeyCoordinatorError<E>, R | RSetup | LifecycleHooks | NativeDatabase> =>
    Effect.gen(function* () {
      const mapping = yield* writeMapping(source, configuration, false);
      const hooks = yield* LifecycleHooks;

      return yield* coordinateTransactionOwner(
        database,
        CurrentPasskeyTransaction,
        configuration,
        operations.validateStorage?.(mapping) ?? Effect.void,
        unavailable,
        nonce,
        (execute) =>
          managementServices(
            mapping,
            {
              ...execute,
              run: (operation, mutation) =>
                execute.run(operation, mutation).pipe(Effect.provideService(LifecycleHooks, hooks)),
            },
            configuration,
          ),
        body,
      ).pipe(Effect.provideService(LifecycleHooks, hooks));
    });

  const coordinateTargetPasskeyRegistrationWriter = <M, Value, RSetup, Transaction, A, E, R>(
    database: any,
    source: PasskeyMappingSource<M, RSetup>,
    configuration: PasskeyTargetConfiguration,
    body: (
      transaction: Transaction,
      services: PasskeyRegistrationServices<Value>,
      append: (statement: Statement<unknown>) => void,
    ) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, PasskeyCoordinatorError<E>, R | RSetup | LifecycleHooks | NativeDatabase> =>
    Effect.gen(function* () {
      const mapping = yield* writeMapping(source, configuration, true);
      const hooks = yield* LifecycleHooks;

      return yield* coordinateTransactionOwner(
        database,
        CurrentPasskeyTransaction,
        configuration,
        operations.validateStorage?.(mapping) ?? Effect.void,
        unavailable,
        nonce,
        (execute) =>
          registrationServices<Value>(
            mapping,
            {
              ...execute,
              run: (operation, mutation) =>
                execute.run(operation, mutation).pipe(Effect.provideService(LifecycleHooks, hooks)),
            },
            configuration,
          ),
        body,
      ).pipe(Effect.provideService(LifecycleHooks, hooks));
    });

  return {
    passkeyManagementPersistenceLayer,
    makeTargetPasskeyManagement,
    makeTargetPasskeyRegistrationWriter,
    coordinateTargetPasskeyManagement,
    coordinateTargetPasskeyRegistrationWriter,
  };
};
