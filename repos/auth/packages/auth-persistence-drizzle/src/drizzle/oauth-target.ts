import {
  captureOAuthMapping,
  makeNativeOAuthSignInServices,
  makeNativeOAuthAccountsServices,
  makeNativeOAuthRegistrationIntentServices,
  makeNativeOAuthRegistrationServices,
  makeNativeOAuthConnectedServices,
  makeNativeOAuthRevocationServices,
  type OAuthNativeReadMapping,
  type OAuthNativeAccountsMapping,
  type OAuthNativeRegistrationIntentMapping,
  type OAuthNativeRegistrationMapping,
  type OAuthNativeConnectedMapping,
  type OAuthNativeRevocationMapping,
} from "@yielded/auth-persistence/Adapter";
import type { LifecycleHooks } from "@yielded/auth/Hooks";
import { OAuthUnavailable } from "@yielded/auth/OAuth";
import { reportAuthDiagnostic } from "@yielded/auth/Persistence";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";

import type { D1BatchStatements } from "./D1BatchStatements";
import type { NativeDatabaseHandle } from "./native-database";
import {
  nativeTarget,
  coordinateNativeTarget,
  type NativeTargetConfiguration,
} from "./native-target";
import { validateDrizzleStorage } from "./storage-validation";

export {
  oauthAccountsPersistenceLayer,
  oauthSignInPersistenceLayer,
  oauthRegistrationIntentsLayer,
  oauthRegistrationAuthorityLayer,
  oauthConnectedPersistenceLayer,
  oauthConnectedRevocationsLayer,
} from "@yielded/auth-persistence/Adapter";

export type OAuthTargetConfiguration = NativeTargetConfiguration;

export type OAuthCoordinatorError<E> = E | OAuthUnavailable;
const unavailable = () => OAuthUnavailable.make({});

const mapped = Effect.fnUntraced(function* (
  original: unknown,
  configuration: OAuthTargetConfiguration,
) {
  const mapping = captureOAuthMapping(original);

  yield* validateDrizzleStorage(mapping).pipe(
    Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, unavailable))),
  );
  if (
    configuration.mode === "batch" &&
    !(
      typeof mapping === "object" &&
      mapping !== null &&
      "d1" in mapping &&
      typeof mapping.d1 === "object" &&
      mapping.d1 !== null &&
      "primary" in mapping.d1 &&
      mapping.d1.primary === true
    )
  ) {
    yield* reportAuthDiagnostic("persistence-validation", "configuration");

    return yield* unavailable();
  }

  return { mapping, ...(yield* nativeTarget(configuration)) };
});

export const makeTargetOAuthSignInServices = Effect.fnUntraced(function* (
  source: unknown,
  configuration: OAuthTargetConfiguration,
) {
  const target = yield* mapped(source, configuration);

  return yield* target.provide(
    makeNativeOAuthSignInServices(
      target.tables,
      target.mapping as OAuthNativeReadMapping,
      target.batch,
    ),
  );
});

export const makeTargetOAuthAccountsServices = Effect.fnUntraced(function* (
  source: unknown,
  configuration: OAuthTargetConfiguration,
) {
  const target = yield* mapped(source, configuration);

  return yield* target.provide(
    makeNativeOAuthAccountsServices(
      target.tables,
      target.mapping as OAuthNativeAccountsMapping,
      target.batch,
    ),
  );
});

export const makeTargetOAuthRegistrationIntentServices = Effect.fnUntraced(function* (
  source: unknown,
  configuration: OAuthTargetConfiguration,
) {
  const target = yield* mapped(source, configuration);

  return yield* target.provide(
    makeNativeOAuthRegistrationIntentServices(
      target.tables,
      target.mapping as OAuthNativeRegistrationIntentMapping,
      target.batch,
    ),
  );
});

export const makeTargetOAuthConnectedServices = Effect.fnUntraced(function* (
  source: unknown,
  configuration: OAuthTargetConfiguration,
) {
  const target = yield* mapped(source, configuration);

  return yield* target.provide(
    makeNativeOAuthConnectedServices(
      target.tables,
      target.mapping as OAuthNativeConnectedMapping,
      target.batch,
    ),
  );
});

export const makeTargetOAuthConnectedRevocationServices = Effect.fnUntraced(function* (
  source: unknown,
  configuration: OAuthTargetConfiguration,
) {
  const target = yield* mapped(source, configuration);

  return yield* target.provide(
    makeNativeOAuthRevocationServices(
      target.tables,
      target.mapping as OAuthNativeRevocationMapping,
      target.batch,
    ),
  );
});

export const makeTargetOAuthRegistrationServices = Effect.fnUntraced(function* <Registration>(
  source: unknown,
  configuration: OAuthTargetConfiguration,
) {
  const target = yield* mapped(source, configuration);

  return yield* target.provide(
    makeNativeOAuthRegistrationServices(
      target.tables,
      target.mapping as OAuthNativeRegistrationMapping<Registration>,
      target.batch,
    ),
  );
});

const coordinateOwner = <Services, Transaction, A, E, R, ES, RS>(
  database: NativeDatabaseHandle,
  configuration: OAuthTargetConfiguration,
  make: Effect.Effect<Services, ES, RS>,
  body: (transaction: Transaction, services: Services) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | OAuthUnavailable, Exclude<R, D1BatchStatements> | RS | LifecycleHooks> =>
  coordinateNativeTarget(unavailable, database, configuration, make, body);

export const coordinateTargetOAuthSignIn = <Transaction, A, E, R>(
  database: NativeDatabaseHandle,
  mapping: unknown,
  configuration: OAuthTargetConfiguration,
  body: (
    transaction: Transaction,
    services: Effect.Success<ReturnType<typeof makeTargetOAuthSignInServices>>,
  ) => Effect.Effect<A, E, R>,
) =>
  coordinateOwner(
    database,
    configuration,
    makeTargetOAuthSignInServices(mapping, configuration),
    body,
  );

export const coordinateTargetOAuthAccounts = <Transaction, A, E, R>(
  database: NativeDatabaseHandle,
  mapping: unknown,
  configuration: OAuthTargetConfiguration,
  body: (
    transaction: Transaction,
    services: Effect.Success<ReturnType<typeof makeTargetOAuthAccountsServices>>,
  ) => Effect.Effect<A, E, R>,
) =>
  coordinateOwner(
    database,
    configuration,
    makeTargetOAuthAccountsServices(mapping, configuration),
    body,
  );

export const coordinateTargetOAuthRegistrationIntents = <Transaction, A, E, R>(
  database: NativeDatabaseHandle,
  mapping: unknown,
  configuration: OAuthTargetConfiguration,
  body: (
    transaction: Transaction,
    services: Effect.Success<ReturnType<typeof makeTargetOAuthRegistrationIntentServices>>,
  ) => Effect.Effect<A, E, R>,
) =>
  coordinateOwner(
    database,
    configuration,
    makeTargetOAuthRegistrationIntentServices(mapping, configuration),
    body,
  );

export const coordinateTargetOAuthConnected = <Transaction, A, E, R>(
  database: NativeDatabaseHandle,
  mapping: unknown,
  configuration: OAuthTargetConfiguration,
  body: (
    transaction: Transaction,
    services: Effect.Success<ReturnType<typeof makeTargetOAuthConnectedServices>>,
  ) => Effect.Effect<A, E, R>,
) =>
  coordinateOwner(
    database,
    configuration,
    makeTargetOAuthConnectedServices(mapping, configuration),
    body,
  );

export const coordinateTargetOAuthConnectedRevocations = <Transaction, A, E, R>(
  database: NativeDatabaseHandle,
  mapping: unknown,
  configuration: OAuthTargetConfiguration,
  body: (
    transaction: Transaction,
    services: Effect.Success<ReturnType<typeof makeTargetOAuthConnectedRevocationServices>>,
  ) => Effect.Effect<A, E, R>,
) =>
  coordinateOwner(
    database,
    configuration,
    makeTargetOAuthConnectedRevocationServices(mapping, configuration),
    body,
  );

export const coordinateTargetOAuthRegistration = <Registration, Transaction, A, E, R>(
  database: NativeDatabaseHandle,
  mapping: unknown,
  configuration: OAuthTargetConfiguration,
  body: (
    transaction: Transaction,
    services: Effect.Success<ReturnType<typeof makeTargetOAuthRegistrationServices<Registration>>>,
  ) => Effect.Effect<A, E, R>,
) =>
  coordinateOwner(
    database,
    configuration,
    makeTargetOAuthRegistrationServices<Registration>(mapping, configuration),
    body,
  );
