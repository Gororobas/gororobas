import {
  makeNativePasswordServices,
  makeNativePasswordRegistrationServices,
  requireStandalone,
  type AnyPasswordPersistenceMapping as SharedPasswordMapping,
  type PasswordRegistrationAuthority,
} from "@yielded/auth-persistence/Adapter";
import { PasswordPersistence, PasswordUnavailable } from "@yielded/auth/Password";
import * as Cause from "effect/Cause";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { nativeClock } from "./native-clock";
import type { NativeDatabaseHandle } from "./native-database";
import {
  nativeTarget,
  coordinateNativeTarget,
  type NativeTargetConfiguration,
} from "./native-target";
import type {
  AnyPasswordPersistenceMapping,
  AnyPasswordRegistrationMapping,
} from "./password-model";
import type { AnyProofPersistenceMapping } from "./proof-model";
import { nativeProofMapping } from "./proof-target";
import { validateDrizzleStorage } from "./storage-validation";

const unavailable = () => PasswordUnavailable.make({});

export const sqlClientPasswordStandaloneGuard = (marker: Parameters<typeof requireStandalone>[1]) =>
  requireStandalone(unavailable, marker);

const mapped = (value: AnyPasswordPersistenceMapping): SharedPasswordMapping => ({
  ...value,
  clock: nativeClock(value.clock),
});

export const makeTargetPasswordPersistenceServices = Effect.fnUntraced(function* (
  mapping: AnyPasswordPersistenceMapping,
  configuration: NativeTargetConfiguration,
  proofs?: AnyProofPersistenceMapping,
) {
  yield* validateDrizzleStorage(mapping).pipe(
    Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, unavailable))),
  );
  if (proofs !== undefined)
    yield* validateDrizzleStorage(proofs).pipe(
      Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, unavailable))),
    );
  if (
    configuration.mode === "batch" &&
    (mapping.d1?.primary !== true || (proofs !== undefined && proofs.d1?.primary !== true))
  )
    return yield* unavailable();
  const target = yield* nativeTarget(configuration);

  return yield* target.provide(
    makeNativePasswordServices(
      target.tables,
      mapped(mapping),
      proofs === undefined ? undefined : nativeProofMapping(proofs),
    ),
  );
});

export const makeTargetPasswordRegistrationServices = Effect.fnUntraced(function* <Registration>(
  mapping: AnyPasswordRegistrationMapping<Registration>,
  configuration: NativeTargetConfiguration,
) {
  yield* validateDrizzleStorage(mapping).pipe(
    Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, unavailable))),
  );
  const target = yield* nativeTarget(configuration);

  return yield* target.provide(
    makeNativePasswordRegistrationServices(target.tables, mapping, target.batch),
  );
});

export const coordinateTargetPasswordPersistence = <Transaction, A, E, R>(
  database: NativeDatabaseHandle,
  mapping: AnyPasswordPersistenceMapping,
  configuration: NativeTargetConfiguration,
  body: (
    transaction: Transaction,
    services: { readonly passwordPersistence: PasswordPersistence["Service"] },
  ) => Effect.Effect<A, E, R>,
  proofs?: AnyProofPersistenceMapping,
) =>
  coordinateNativeTarget(
    unavailable,
    database,
    configuration,
    makeTargetPasswordPersistenceServices(mapping, configuration, proofs),
    body,
  );

export const coordinateTargetPasswordRegistration = <Registration, Transaction, A, E, R>(
  database: NativeDatabaseHandle,
  mapping: AnyPasswordRegistrationMapping<Registration>,
  configuration: NativeTargetConfiguration,
  body: (
    transaction: Transaction,
    services: { readonly registrationAuthority: PasswordRegistrationAuthority<Registration> },
  ) => Effect.Effect<A, E, R>,
) =>
  coordinateNativeTarget(
    unavailable,
    database,
    configuration,
    makeTargetPasswordRegistrationServices(mapping, configuration),
    body,
  );

export const passwordPersistenceLayer = <E, R>(
  services: Effect.Effect<{ readonly passwordPersistence: PasswordPersistence["Service"] }, E, R>,
) =>
  Layer.effect(
    PasswordPersistence,
    Effect.map(services, (value) => value.passwordPersistence),
  );

export const passwordRegistrationLayer = <Id, Registration, E, R>(
  target: Context.Key<Id, PasswordRegistrationAuthority<Registration>>,
  services: Effect.Effect<
    { readonly registrationAuthority: PasswordRegistrationAuthority<Registration> },
    E,
    R
  >,
) =>
  Layer.effect(
    target,
    Effect.map(services, (value) => value.registrationAuthority),
  );
