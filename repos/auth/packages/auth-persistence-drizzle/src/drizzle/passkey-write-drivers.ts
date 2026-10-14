import type { LifecycleHooks } from "@yielded/auth/Hooks";
import { PasskeyManagementPersistence, PasskeyPersistence } from "@yielded/auth/Passkey";
import type { Table } from "drizzle-orm";
import { type Crypto, Context, Effect } from "effect";

import type { D1BatchStatements } from "./D1BatchStatements";
import { NativeDatabase, nativeDatabase } from "./native-database";
import type { PasskeyMappingSource } from "./passkey-model";
import type {
  PasskeyManagementMapping,
  PasskeyRegistrationMapping,
  PasskeyRegistrationWriter,
} from "./passkey-write-model";
import type { PasskeyCoordinatorError, PasskeyTargetConfiguration } from "./passkey/target";
import {
  coordinateTargetPasskeyManagement,
  coordinateTargetPasskeyRegistrationWriter,
  makeTargetPasskeyManagement,
  makeTargetPasskeyRegistrationWriter,
} from "./passkey/write-target";
import type { SuppliedService } from "./SuppliedService";
// oxlint-disable-next-line no-explicit-any -- inspect the installed concrete transaction callback.
type TransactionOf<D> = D extends { readonly transaction: (...args: any[]) => any }
  ? Parameters<Parameters<D["transaction"]>[0]>[0]
  : never;

export const makePasskeyWriteTarget = <
  DatabaseId,
  D,
  T extends Table,
  Extra = unknown,
  Provided extends D1BatchStatements = never,
>(
  databaseService: Context.Service<DatabaseId, D>,
  configuration: PasskeyTargetConfiguration,
) => {
  function coordinatePasskeyManagement<
    Database extends D,
    S extends T,
    C extends T,
    F extends T,
    Flow extends T,
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
      readonly mapping: PasskeyMappingSource<
        PasskeyManagementMapping<S, C, F, Flow, N> & Extra,
        RSetup
      >;
      readonly transaction?: never;
    },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    PasskeyCoordinatorError<E> | DatabaseError,
    | Exclude<R, PasskeyPersistence | PasskeyManagementPersistence | Provided>
    | Crypto.Crypto
    | LifecycleHooks
    | RSetup
    | DatabaseRequirements
  >;
  function coordinatePasskeyManagement<
    Database extends D,
    S extends T,
    C extends T,
    F extends T,
    Flow extends T,
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
      readonly mapping: PasskeyMappingSource<
        PasskeyManagementMapping<S, C, F, Flow, N> & Extra,
        RSetup
      >;
      readonly transaction: SuppliedService<
        TxId,
        NoInfer<[Provided] extends [never] ? TransactionOf<Database> : never>,
        TxShape
      >;
    },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    PasskeyCoordinatorError<E> | DatabaseError,
    | Exclude<R, PasskeyPersistence | PasskeyManagementPersistence | TxId | Provided>
    | Crypto.Crypto
    | LifecycleHooks
    | RSetup
    | DatabaseRequirements
  >;
  function coordinatePasskeyManagement<
    Database extends D,
    S extends T,
    C extends T,
    F extends T,
    Flow extends T,
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
      readonly mapping: PasskeyMappingSource<
        PasskeyManagementMapping<S, C, F, Flow, N> & Extra,
        RSetup
      >;
      readonly transaction?: SuppliedService<TxId, NoInfer<TransactionOf<Database>>, TxShape>;
    },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    PasskeyCoordinatorError<E> | DatabaseError,
    | Exclude<R, PasskeyPersistence | PasskeyManagementPersistence>
    | Crypto.Crypto
    | LifecycleHooks
    | RSetup
    | DatabaseRequirements
  > {
    return Effect.flatMap(nativeDatabase(acquire), (database) =>
      coordinateTargetPasskeyManagement(
        database,
        options.mapping,
        configuration,
        (
          transaction: TransactionOf<Database>,
          services,
        ): Effect.Effect<A, E, Exclude<R, PasskeyPersistence | PasskeyManagementPersistence>> => {
          const context = Context.make(PasskeyPersistence, services.passkeyPersistence).pipe(
            Context.add(PasskeyManagementPersistence, services.passkeyManagementPersistence),
          );

          const work = Effect.provideContext(body, context);

          return options.transaction === undefined
            ? work
            : Effect.provideService(work, options.transaction, options.transaction.of(transaction));
        },
      ).pipe(Effect.provideService(NativeDatabase, database)),
    );
  }

  const makePasskeyManagementServices = <
    S extends T,
    C extends T,
    F extends T,
    Flow extends T,
    N,
    RSetup = never,
  >(
    mapping: PasskeyMappingSource<PasskeyManagementMapping<S, C, F, Flow, N> & Extra, RSetup>,
  ) =>
    makeTargetPasskeyManagement(mapping, configuration).pipe(
      Effect.provideServiceEffect(NativeDatabase, nativeDatabase(databaseService)),
    );

  function coordinatePasskeyRegistration<
    Database extends D,
    S extends T,
    C extends T,
    F extends T,
    Flow extends T,
    N,
    Value,
    A,
    E,
    R,
    AuthorityId,
    RSetup = never,
    DatabaseError = never,
    DatabaseRequirements = never,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: PasskeyMappingSource<
        PasskeyRegistrationMapping<S, C, F, Flow, N, Value> & Extra,
        RSetup
      >;
      readonly authority: Context.Key<AuthorityId, PasskeyRegistrationWriter<Value>>;
      readonly transaction?: never;
    },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    PasskeyCoordinatorError<E> | DatabaseError,
    | Exclude<R, PasskeyPersistence | AuthorityId | Provided>
    | Crypto.Crypto
    | LifecycleHooks
    | RSetup
    | DatabaseRequirements
  >;
  function coordinatePasskeyRegistration<
    Database extends D,
    S extends T,
    C extends T,
    F extends T,
    Flow extends T,
    N,
    Value,
    A,
    E,
    R,
    AuthorityId,
    TxId,
    TxShape,
    RSetup = never,
    DatabaseError = never,
    DatabaseRequirements = never,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: PasskeyMappingSource<
        PasskeyRegistrationMapping<S, C, F, Flow, N, Value> & Extra,
        RSetup
      >;
      readonly authority: Context.Key<AuthorityId, PasskeyRegistrationWriter<Value>>;
      readonly transaction: SuppliedService<
        TxId,
        NoInfer<[Provided] extends [never] ? TransactionOf<Database> : never>,
        TxShape
      >;
    },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    PasskeyCoordinatorError<E> | DatabaseError,
    | Exclude<R, PasskeyPersistence | AuthorityId | TxId | Provided>
    | Crypto.Crypto
    | LifecycleHooks
    | RSetup
    | DatabaseRequirements
  >;
  function coordinatePasskeyRegistration<
    Database extends D,
    S extends T,
    C extends T,
    F extends T,
    Flow extends T,
    N,
    Value,
    A,
    E,
    R,
    AuthorityId,
    TxId,
    TxShape,
    RSetup = never,
    DatabaseError = never,
    DatabaseRequirements = never,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: PasskeyMappingSource<
        PasskeyRegistrationMapping<S, C, F, Flow, N, Value> & Extra,
        RSetup
      >;
      readonly authority: Context.Key<AuthorityId, PasskeyRegistrationWriter<Value>>;
      readonly transaction?: SuppliedService<TxId, NoInfer<TransactionOf<Database>>, TxShape>;
    },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    PasskeyCoordinatorError<E> | DatabaseError,
    | Exclude<R, PasskeyPersistence | AuthorityId>
    | Crypto.Crypto
    | LifecycleHooks
    | RSetup
    | DatabaseRequirements
  > {
    return Effect.flatMap(nativeDatabase(acquire), (database) =>
      coordinateTargetPasskeyRegistrationWriter(
        database,
        options.mapping,
        configuration,
        (
          transaction: TransactionOf<Database>,
          services: import("./passkey-write-model").PasskeyRegistrationServices<Value>,
        ) => {
          const context = Context.make(PasskeyPersistence, services.passkeyPersistence).pipe(
            Context.add(options.authority, services.passkeyRegistrationAuthority),
          );

          const work = Effect.provideContext(body, context);

          return options.transaction === undefined
            ? work
            : Effect.provideService(work, options.transaction, options.transaction.of(transaction));
        },
      ).pipe(Effect.provideService(NativeDatabase, database)),
    );
  }

  const makePasskeyRegistrationServices = <
    S extends T,
    C extends T,
    F extends T,
    Flow extends T,
    N,
    Value,
    RSetup = never,
  >(
    mapping: PasskeyMappingSource<
      PasskeyRegistrationMapping<S, C, F, Flow, N, Value> & Extra,
      RSetup
    >,
  ) =>
    makeTargetPasskeyRegistrationWriter<
      PasskeyRegistrationMapping<S, C, F, Flow, N, Value> & Extra,
      Value,
      RSetup
    >(mapping, configuration).pipe(
      Effect.provideServiceEffect(NativeDatabase, nativeDatabase(databaseService)),
    );

  return {
    makePasskeyManagementServices,
    makePasskeyRegistrationServices,
    coordinatePasskeyManagement,
    coordinatePasskeyRegistration,
  };
};
