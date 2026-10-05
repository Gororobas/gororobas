import { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import type { LifecycleHooks } from "@yielded/auth/Hooks";
import { PasskeyPersistence } from "@yielded/auth/Passkey";
import type { Table } from "drizzle-orm";
import { Effect, Context } from "effect";

import { nativeDatabase } from "./native-database";
import type {
  PasskeyCredentialMapping,
  PasskeyEnrollmentContextMapping,
  PasskeyMappingSource,
  PasskeyPersistenceMapping,
  PasskeyPersistenceServices,
} from "./passkey-model";
import type {
  PasskeyRegistrationCeremonyMapping,
  PasskeyRegistrationCeremonyServices,
} from "./passkey-registration-ceremony-model";
import {
  type PasskeyCoordinatorError,
  coordinateTargetPasskey,
  coordinateTargetPasskeyRegistration,
  makeTargetPasskeyCredentials,
  makeTargetPasskeyEnrollmentContext,
  makeTargetPasskeyPersistence,
  makeTargetPasskeyRegistration,
  type PasskeyTargetConfiguration,
} from "./passkey-target";
import { makePasskeyWriteTarget } from "./passkey-write-drivers";
import type { SuppliedService } from "./SuppliedService";

// oxlint-disable-next-line no-explicit-any -- inspect only the concrete database's installed generic transaction callback.
type TransactionOf<D> = D extends { readonly transaction: (...args: any[]) => any }
  ? Parameters<Parameters<D["transaction"]>[0]>[0]
  : never;

export const makePasskeyTarget = <
  DatabaseId,
  D,
  T extends Table,
  Extra = unknown,
  Synchronous extends boolean = false,
>(
  databaseService: Context.Service<DatabaseId, D>,
  configuration: PasskeyTargetConfiguration,
) => {
  function coordinatePasskeyPersistence<
    Database extends D,
    S extends T,
    C extends T,
    F extends T,
    O extends T,
    H extends T,
    M extends T,
    Flow extends T,
    Admission extends T,
    Charge extends T,
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
        PasskeyPersistenceMapping<
          PasskeyCredentialMapping<S, C, F, O, H, N>,
          M,
          Flow,
          Admission,
          Charge,
          N
        > &
          Extra,
        RSetup
      >;
      readonly transaction?: never;
    },
    body: Effect.Effect<A, E, Synchronous extends true ? NoInfer<PasskeyPersistence> : R>,
  ): Effect.Effect<
    A,
    PasskeyCoordinatorError<E> | DatabaseError,
    | (Synchronous extends true ? never : Exclude<R, PasskeyPersistence>)
    | LifecycleHooks
    | DatabaseRequirements
    | RSetup
  >;
  function coordinatePasskeyPersistence<
    Database extends D,
    S extends T,
    C extends T,
    F extends T,
    O extends T,
    H extends T,
    M extends T,
    Flow extends T,
    Admission extends T,
    Charge extends T,
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
        PasskeyPersistenceMapping<
          PasskeyCredentialMapping<S, C, F, O, H, N>,
          M,
          Flow,
          Admission,
          Charge,
          N
        > &
          Extra,
        RSetup
      >;
      readonly transaction: SuppliedService<TxId, NoInfer<TransactionOf<Database>>, TxShape>;
    },
    body: Effect.Effect<A, E, Synchronous extends true ? NoInfer<PasskeyPersistence | TxId> : R>,
  ): Effect.Effect<
    A,
    PasskeyCoordinatorError<E> | DatabaseError,
    | (Synchronous extends true ? never : Exclude<R, PasskeyPersistence | TxId>)
    | LifecycleHooks
    | DatabaseRequirements
    | RSetup
  >;
  function coordinatePasskeyPersistence<
    Database extends D,
    S extends T,
    C extends T,
    F extends T,
    O extends T,
    H extends T,
    M extends T,
    Flow extends T,
    Admission extends T,
    Charge extends T,
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
        PasskeyPersistenceMapping<
          PasskeyCredentialMapping<S, C, F, O, H, N>,
          M,
          Flow,
          Admission,
          Charge,
          N
        > &
          Extra,
        RSetup
      >;
      readonly transaction?: SuppliedService<TxId, NoInfer<TransactionOf<Database>>, TxShape>;
    },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    PasskeyCoordinatorError<E> | DatabaseError,
    Exclude<R, PasskeyPersistence> | LifecycleHooks | DatabaseRequirements | RSetup
  > {
    return Effect.flatMap(nativeDatabase(acquire), (database) =>
      coordinateTargetPasskey(
        database,
        options.mapping,
        configuration,
        (transaction: TransactionOf<Database>, services: PasskeyPersistenceServices) => {
          const provided = Context.make(PasskeyPersistence, services.passkeyPersistence);
          const work = Effect.provideContext(body, provided);

          return options.transaction === undefined
            ? work
            : Effect.provideService(work, options.transaction, options.transaction.of(transaction));
        },
      ).pipe(Effect.provideService(NativeDatabase, database)),
    );
  }
  function coordinatePasskeyRegistrationCeremony<
    Database extends D,
    M extends T,
    Flow extends T,
    Admission extends T,
    Charge extends T,
    Intent extends T,
    H extends T,
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
        PasskeyRegistrationCeremonyMapping<M, Flow, Admission, Charge, Intent, H> & Extra,
        RSetup
      >;
      readonly transaction?: never;
    },
    body: Effect.Effect<A, E, Synchronous extends true ? NoInfer<PasskeyPersistence> : R>,
  ): Effect.Effect<
    A,
    PasskeyCoordinatorError<E> | DatabaseError,
    | (Synchronous extends true ? never : Exclude<R, PasskeyPersistence>)
    | LifecycleHooks
    | DatabaseRequirements
    | RSetup
  >;
  function coordinatePasskeyRegistrationCeremony<
    Database extends D,
    M extends T,
    Flow extends T,
    Admission extends T,
    Charge extends T,
    Intent extends T,
    H extends T,
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
        PasskeyRegistrationCeremonyMapping<M, Flow, Admission, Charge, Intent, H> & Extra,
        RSetup
      >;
      readonly transaction: SuppliedService<TxId, NoInfer<TransactionOf<Database>>, TxShape>;
    },
    body: Effect.Effect<A, E, Synchronous extends true ? NoInfer<PasskeyPersistence | TxId> : R>,
  ): Effect.Effect<
    A,
    PasskeyCoordinatorError<E> | DatabaseError,
    | (Synchronous extends true ? never : Exclude<R, PasskeyPersistence | TxId>)
    | LifecycleHooks
    | DatabaseRequirements
    | RSetup
  >;
  function coordinatePasskeyRegistrationCeremony<
    Database extends D,
    M extends T,
    Flow extends T,
    Admission extends T,
    Charge extends T,
    Intent extends T,
    H extends T,
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
        PasskeyRegistrationCeremonyMapping<M, Flow, Admission, Charge, Intent, H> & Extra,
        RSetup
      >;
      readonly transaction?: SuppliedService<TxId, NoInfer<TransactionOf<Database>>, TxShape>;
    },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    PasskeyCoordinatorError<E> | DatabaseError,
    Exclude<R, PasskeyPersistence> | LifecycleHooks | DatabaseRequirements | RSetup
  > {
    return Effect.flatMap(nativeDatabase(acquire), (database) =>
      coordinateTargetPasskeyRegistration(
        database,
        options.mapping,
        configuration,
        (transaction: TransactionOf<Database>, services: PasskeyRegistrationCeremonyServices) => {
          const provided = Context.make(PasskeyPersistence, services.passkeyPersistence);
          const work = Effect.provideContext(body, provided);

          return options.transaction === undefined
            ? work
            : Effect.provideService(work, options.transaction, options.transaction.of(transaction));
        },
      ).pipe(Effect.provideService(NativeDatabase, database)),
    );
  }

  return {
    ...makePasskeyWriteTarget<DatabaseId, D, T, Extra, Synchronous>(databaseService, configuration),
    makePasskeyCredentialServices: <
      S extends T,
      C extends T,
      F extends T,
      O extends T,
      H extends T,
      N,
      RSetup = never,
    >(
      mapping: PasskeyMappingSource<PasskeyCredentialMapping<S, C, F, O, H, N> & Extra, RSetup>,
    ) =>
      makeTargetPasskeyCredentials(mapping, configuration).pipe(
        Effect.provideServiceEffect(NativeDatabase, nativeDatabase(databaseService)),
      ),
    makePasskeyEnrollmentContextServices: <
      S extends T,
      C extends T,
      F extends T,
      O extends T,
      H extends T,
      M extends T,
      N,
      RSetup = never,
    >(
      mapping: PasskeyMappingSource<
        PasskeyEnrollmentContextMapping<PasskeyCredentialMapping<S, C, F, O, H, N>, M, N> & Extra,
        RSetup
      >,
    ) =>
      makeTargetPasskeyEnrollmentContext(mapping, configuration).pipe(
        Effect.provideServiceEffect(NativeDatabase, nativeDatabase(databaseService)),
      ),
    makePasskeyPersistenceServices: <
      S extends T,
      C extends T,
      F extends T,
      O extends T,
      H extends T,
      M extends T,
      Flow extends T,
      Admission extends T,
      Charge extends T,
      N,
      RSetup = never,
    >(
      mapping: PasskeyMappingSource<
        PasskeyPersistenceMapping<
          PasskeyCredentialMapping<S, C, F, O, H, N>,
          M,
          Flow,
          Admission,
          Charge,
          N
        > &
          Extra,
        RSetup
      >,
    ) =>
      makeTargetPasskeyPersistence(mapping, configuration).pipe(
        Effect.provideServiceEffect(NativeDatabase, nativeDatabase(databaseService)),
      ),
    makePasskeyRegistrationCeremonyServices: <
      M extends T,
      Flow extends T,
      Admission extends T,
      Charge extends T,
      Intent extends T,
      H extends T,
      RSetup = never,
    >(
      mapping: PasskeyMappingSource<
        PasskeyRegistrationCeremonyMapping<M, Flow, Admission, Charge, Intent, H> & Extra,
        RSetup
      >,
    ) =>
      makeTargetPasskeyRegistration(mapping, configuration).pipe(
        Effect.provideServiceEffect(NativeDatabase, nativeDatabase(databaseService)),
      ),
    coordinatePasskeyPersistence,
    coordinatePasskeyRegistrationCeremony,
  };
};
