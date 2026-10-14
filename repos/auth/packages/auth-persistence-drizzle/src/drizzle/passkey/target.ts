import {
  type SqlBatchCommit,
  makeBatchPasskeyServices,
  makeNativePasskeyCeremonyServices,
  makeNativePasskeyCredentialServices,
  makeNativePasskeyServices,
  type NativeSqlTables,
  type NativePasskeyCeremonyMapping,
  type PasskeyNativeMapping,
  type PasskeyNativeRead,
} from "@yielded/auth-persistence/Adapter";
import { LifecycleHooks } from "@yielded/auth/Hooks";
import { PasskeyConfigurationError, PasskeyUnavailable } from "@yielded/auth/Passkey";
import { type Crypto, Effect } from "effect";
import type { SqlClient } from "effect/sql";

import type { D1BatchStatements } from "../D1BatchStatements";
import type { PersistenceMappingError } from "../model";
import {
  NativeDatabase,
  type NativeDatabaseHandle,
  type NativePhysicalDatabase,
} from "../native-database";
import {
  nativeTarget,
  coordinateNativeTarget,
  type NativeTargetConfiguration,
} from "../native-target";
import type { PasskeyPersistenceServices, PasskeyMappingSource } from "../passkey-model";
import { validateDrizzleStorage } from "../storage-validation";
export type PasskeyTargetConfiguration = NativeTargetConfiguration;

export type PasskeyCoordinatorError<E> =
  | E
  | PasskeyUnavailable
  | PasskeyConfigurationError
  | PersistenceMappingError;

const unavailable = () => PasskeyUnavailable.make({});

const emptyHooks: LifecycleHooks["Service"] = {
  before: () => Effect.void,
  after: () => Effect.succeed([]),
};

// Mapped table/SQL generics end here. Persisted values are decoded by shared schemas.
export const capturePasskeyMapping = <M, R>(
  source: PasskeyMappingSource<M, R>,
  configuration: PasskeyTargetConfiguration,
) =>
  Effect.flatMap(Effect.isEffect(source) ? source : Effect.succeed(source), (mapping) =>
    validateDrizzleStorage(mapping).pipe(
      Effect.andThen(
        Effect.gen(function* () {
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
          )
            return yield* PasskeyConfigurationError.make({});

          return mapping;
        }),
      ),
    ),
  );

type NativePasskeyServices = Effect.Success<ReturnType<typeof makeNativePasskeyServices>>;

interface PasskeyMapped<M> {
  readonly mapping: M;
  readonly database: NativePhysicalDatabase;
  readonly tables: NativeSqlTables;
  readonly batch: SqlBatchCommit["Service"] | undefined;
  readonly provide: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, Exclude<Exclude<R, SqlClient.SqlClient>, SqlBatchCommit>>;
  readonly base: () => Effect.Effect<
    NativePasskeyServices,
    PasskeyUnavailable,
    Crypto.Crypto | LifecycleHooks
  >;
}

export const makePasskeyMapped = Effect.fnUntraced(function* <M, R>(
  source: PasskeyMappingSource<M, R>,
  configuration: PasskeyTargetConfiguration,
): Effect.fn.Return<
  PasskeyMapped<M>,
  PasskeyConfigurationError | PersistenceMappingError,
  R | NativeDatabase
> {
  const mapping = yield* capturePasskeyMapping(source, configuration);
  const database = yield* NativeDatabase;
  const { tables, batch, provide } = yield* nativeTarget(configuration);
  const native = mapping as unknown as PasskeyNativeMapping;

  return {
    mapping,
    database,
    tables,
    batch,
    provide,
    base: () =>
      provide(
        configuration.mode === "batch"
          ? makeBatchPasskeyServices(tables, native)
          : makeNativePasskeyServices(tables, native),
      ),
  };
});

export const makeTargetPasskeyCredentials = <M, R>(
  source: PasskeyMappingSource<M, R>,
  configuration: PasskeyTargetConfiguration,
) =>
  Effect.gen(function* () {
    const target = yield* makePasskeyMapped(source, configuration);

    return yield* target
      .provide(
        makeNativePasskeyCredentialServices(
          target.tables,
          target.mapping as unknown as PasskeyNativeRead,
        ),
      )
      .pipe(Effect.provideService(LifecycleHooks, emptyHooks));
  }).pipe(Effect.catchDefect(() => Effect.fail(PasskeyConfigurationError.make({}))));

export const makeTargetPasskeyPersistence = <M, R>(
  source: PasskeyMappingSource<M, R>,
  configuration: PasskeyTargetConfiguration,
) =>
  Effect.gen(function* () {
    const target = yield* makePasskeyMapped(source, configuration);

    const base = yield* target.base();

    return { passkeyPersistence: base.passkeyPersistence } satisfies PasskeyPersistenceServices;
  });

export const makeTargetPasskeyRegistration = <M, R>(
  source: PasskeyMappingSource<M, R>,
  configuration: PasskeyTargetConfiguration,
) =>
  Effect.gen(function* () {
    const target = yield* makePasskeyMapped(source, configuration);

    return yield* target.provide(
      makeNativePasskeyCeremonyServices(
        target.tables,
        target.mapping as unknown as NativePasskeyCeremonyMapping,
        configuration.mode === "batch" ? target.batch : undefined,
      ),
    );
  });

export const coordinatePasskeyOwner = <S, Transaction, A, E, R, ESetup, RSetup>(
  database: NativeDatabaseHandle,
  configuration: PasskeyTargetConfiguration,
  make: Effect.Effect<S, ESetup, RSetup>,
  body: (transaction: Transaction, services: S) => Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | PasskeyUnavailable,
  Exclude<R, D1BatchStatements> | RSetup | LifecycleHooks
> => coordinateNativeTarget(unavailable, database, configuration, make, body);

export const coordinateTargetPasskey = <M, RSetup, Transaction, A, E, R>(
  database: NativeDatabaseHandle,
  source: PasskeyMappingSource<M, RSetup>,
  configuration: PasskeyTargetConfiguration,
  body: (
    transaction: Transaction,
    services: Effect.Success<ReturnType<typeof makeTargetPasskeyPersistence>>,
  ) => Effect.Effect<A, E, R>,
) =>
  coordinatePasskeyOwner(
    database,
    configuration,
    makeTargetPasskeyPersistence(source, configuration),
    body,
  );

export const coordinateTargetPasskeyRegistration = <M, RSetup, Transaction, A, E, R>(
  database: NativeDatabaseHandle,
  source: PasskeyMappingSource<M, RSetup>,
  configuration: PasskeyTargetConfiguration,
  body: (
    transaction: Transaction,
    services: Effect.Success<ReturnType<typeof makeTargetPasskeyRegistration>>,
  ) => Effect.Effect<A, E, R>,
) =>
  coordinatePasskeyOwner(
    database,
    configuration,
    makeTargetPasskeyRegistration(source, configuration),
    body,
  );
