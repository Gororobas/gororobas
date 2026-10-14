import {
  makeNativeEmailAddressServices,
  makeNativeEmailSignInServices,
  makeNativeEmailRegistrationServices,
  requireStandalone,
  type AnyEmailAddressMapping as SharedEmailMapping,
  type EmailRegistrationAuthority,
} from "@yielded/auth-persistence/Adapter";
import { EmailAddressPersistence, EmailSignInTargets, EmailUnavailable } from "@yielded/auth/Email";
import { type Context, Effect, Layer } from "effect";

import type {
  AnyEmailAddressMapping,
  AnyEmailSignInMapping,
  AnyEmailRegistrationMapping,
} from "./email-model";
import { nativeClock } from "./native-clock";
import type { NativeDatabaseHandle } from "./native-database";
import {
  nativeTarget,
  coordinateNativeTarget,
  type NativeTargetConfiguration,
} from "./native-target";
import type { AnyProofPersistenceMapping } from "./proof-model";
import { nativeProofMapping } from "./proof-target";
import { validateDrizzleStorage } from "./storage-validation";

const unavailable = () => EmailUnavailable.make({});

export const sqlClientEmailStandaloneGuard = (marker: Parameters<typeof requireStandalone>[1]) =>
  requireStandalone(unavailable, marker);

const mapped = (value: AnyEmailAddressMapping): SharedEmailMapping => ({
  ...value,
  clock: nativeClock(value.clock),
});

export const makeTargetEmailAddressServices = Effect.fnUntraced(function* (
  mapping: AnyEmailAddressMapping,
  configuration: NativeTargetConfiguration,
  proofs?: AnyProofPersistenceMapping,
) {
  yield* validateDrizzleStorage(mapping).pipe(Effect.mapError(unavailable));
  if (proofs !== undefined)
    yield* validateDrizzleStorage(proofs).pipe(Effect.mapError(unavailable));
  if (
    configuration.mode === "batch" &&
    (mapping.d1?.primary !== true || (proofs !== undefined && proofs.d1?.primary !== true))
  )
    return yield* unavailable();
  const target = yield* nativeTarget(configuration);

  return yield* target.provide(
    makeNativeEmailAddressServices(
      target.tables,
      mapped(mapping),
      proofs === undefined ? undefined : nativeProofMapping(proofs),
    ),
  );
});

export const makeTargetEmailRegistrationServices = Effect.fnUntraced(function* <Registration>(
  mapping: AnyEmailRegistrationMapping<Registration>,
  configuration: NativeTargetConfiguration,
  proofs: AnyProofPersistenceMapping,
) {
  yield* validateDrizzleStorage(mapping).pipe(Effect.mapError(unavailable));
  yield* validateDrizzleStorage(proofs).pipe(Effect.mapError(unavailable));
  if (
    configuration.mode === "batch" &&
    (mapping.d1?.primary !== true || proofs.d1?.primary !== true)
  )
    return yield* unavailable();
  const target = yield* nativeTarget(configuration);

  return yield* target.provide(
    makeNativeEmailRegistrationServices(
      target.tables,
      {
        ...mapping,
        clock: nativeClock(mapping.clock),
      },
      nativeProofMapping(proofs),
      target.batch,
    ),
  );
});

export const coordinateTargetEmailAddress = <Transaction, A, E, R>(
  database: NativeDatabaseHandle,
  mapping: AnyEmailAddressMapping,
  configuration: NativeTargetConfiguration,
  body: (
    transaction: Transaction,
    services: { readonly emailAddressPersistence: EmailAddressPersistence["Service"] },
  ) => Effect.Effect<A, E, R>,
  proofs?: AnyProofPersistenceMapping,
) =>
  coordinateNativeTarget(
    unavailable,
    database,
    configuration,
    makeTargetEmailAddressServices(mapping, configuration, proofs),
    body,
  );

export const coordinateTargetEmailRegistration = <Registration, Transaction, A, E, R>(
  database: NativeDatabaseHandle,
  mapping: AnyEmailRegistrationMapping<Registration>,
  configuration: NativeTargetConfiguration,
  proofs: AnyProofPersistenceMapping,
  body: (
    transaction: Transaction,
    services: { readonly registrationAuthority: EmailRegistrationAuthority<Registration> },
  ) => Effect.Effect<A, E, R>,
) =>
  coordinateNativeTarget(
    unavailable,
    database,
    configuration,
    makeTargetEmailRegistrationServices(mapping, configuration, proofs),
    body,
  );

export const emailAddressPersistenceLayer = <E, R>(
  services: Effect.Effect<
    { readonly emailAddressPersistence: EmailAddressPersistence["Service"] },
    E,
    R
  >,
) =>
  Layer.effect(
    EmailAddressPersistence,
    Effect.map(services, (value) => value.emailAddressPersistence),
  );

export const emailRegistrationLayer = <Id, Registration, E, R>(
  target: Context.Key<Id, EmailRegistrationAuthority<Registration>>,
  services: Effect.Effect<
    { readonly registrationAuthority: EmailRegistrationAuthority<Registration> },
    E,
    R
  >,
) =>
  Layer.effect(
    target,
    Effect.map(services, (value) => value.registrationAuthority),
  );

export const makeTargetEmailSignInServices = Effect.fnUntraced(function* (
  mapping: AnyEmailSignInMapping,
  configuration: NativeTargetConfiguration,
) {
  yield* validateDrizzleStorage(mapping).pipe(Effect.mapError(unavailable));
  const target = yield* nativeTarget(configuration);

  return yield* target.provide(makeNativeEmailSignInServices(target.tables, mapping));
});

export const emailSignInTargetsLayer = <E, R>(
  services: Effect.Effect<{ readonly emailSignInTargets: EmailSignInTargets["Service"] }, E, R>,
) =>
  Layer.effect(
    EmailSignInTargets,
    Effect.map(services, (value) => value.emailSignInTargets),
  );
