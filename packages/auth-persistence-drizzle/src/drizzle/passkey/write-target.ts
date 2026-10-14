import {
  makePasskeyNativeManagement,
  makePasskeyNativeRegistration,
  type NativePasskeyManagementMapping,
  type NativePasskeyRegistrationMapping,
} from "@yielded/auth-persistence/Adapter";
import { PasskeyManagementPersistence } from "@yielded/auth/Passkey";
import { Effect, Layer } from "effect";

import type { NativeDatabaseHandle } from "../native-database";
import type { PasskeyMappingSource } from "../passkey-model";
import type {
  PasskeyManagementServices,
  PasskeyRegistrationServices,
} from "../passkey-write-model";
import {
  coordinatePasskeyOwner,
  makePasskeyMapped,
  type PasskeyTargetConfiguration,
} from "./target";

export const passkeyManagementPersistenceLayer = <E, R>(
  services: Effect.Effect<PasskeyManagementServices, E, R>,
) =>
  Layer.effect(
    PasskeyManagementPersistence,
    Effect.map(services, (value) => value.passkeyManagementPersistence),
  );

export const makeTargetPasskeyManagement = <M, R>(
  source: PasskeyMappingSource<M, R>,
  configuration: PasskeyTargetConfiguration,
) =>
  Effect.gen(function* () {
    const target = yield* makePasskeyMapped(source, configuration);
    const base = yield* target.base();

    return {
      passkeyPersistence: base.passkeyPersistence,
      ...makePasskeyNativeManagement(
        base,
        target.mapping as unknown as NativePasskeyManagementMapping,
      ),
    };
  });

export const makeTargetPasskeyRegistrationWriter = <M, Value, R>(
  source: PasskeyMappingSource<M, R>,
  configuration: PasskeyTargetConfiguration,
) =>
  Effect.gen(function* () {
    const target = yield* makePasskeyMapped(source, configuration);
    const base = yield* target.base();

    return {
      passkeyPersistence: base.passkeyPersistence,
      ...makePasskeyNativeRegistration(
        base,
        target.mapping as unknown as NativePasskeyRegistrationMapping<Value>,
      ),
    };
  });

export const coordinateTargetPasskeyManagement = <M, RSetup, Transaction, A, E, R>(
  database: NativeDatabaseHandle,
  source: PasskeyMappingSource<M, RSetup>,
  configuration: PasskeyTargetConfiguration,
  body: (transaction: Transaction, services: PasskeyManagementServices) => Effect.Effect<A, E, R>,
) =>
  coordinatePasskeyOwner(
    database,
    configuration,
    makeTargetPasskeyManagement(source, configuration),
    body,
  );

export const coordinateTargetPasskeyRegistrationWriter = <M, Value, RSetup, Transaction, A, E, R>(
  database: NativeDatabaseHandle,
  source: PasskeyMappingSource<M, RSetup>,
  configuration: PasskeyTargetConfiguration,
  body: (
    transaction: Transaction,
    services: PasskeyRegistrationServices<Value>,
  ) => Effect.Effect<A, E, R>,
) =>
  coordinatePasskeyOwner(
    database,
    configuration,
    makeTargetPasskeyRegistrationWriter<M, Value, RSetup>(source, configuration),
    body,
  );
