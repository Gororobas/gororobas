import { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import type { LifecycleHooks, HookConfigurationError } from "@yielded/auth/Hooks";
import type { PasswordUnavailable, PasswordPreparedPersistence } from "@yielded/auth/Password";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { Effect, Context } from "effect";
import type { SqlError } from "effect/sql/SqlError";

import { nativeDatabase } from "./native-database";
import type {
  PasswordPreparedPersistenceMapping,
  PasswordPreparedProofMapping,
} from "./password-prepared-model";
import {
  makeTargetPasswordPreparedPersistenceServices,
  coordinateTargetPasswordPreparedPersistence,
} from "./password-prepared-target";
import { CurrentPasswordSql } from "./password-sql";
import type { PasswordTargetConfiguration } from "./password-target";
import type { SqlitePasswordDatabase } from "./sqlite-passwords";
import {
  type TransactionService,
  acquireTransactionService,
  transactionService,
} from "./standalone-guard";
import type { SuppliedService } from "./SuppliedService";
type TransactionOf<D extends SqlitePasswordDatabase> = Parameters<
  Parameters<D["transaction"]>[0]
>[0];

export const makeSqlitePasswordPreparedTarget = <
  DatabaseId,
  D extends SqlitePasswordDatabase,
  Synchronous extends boolean = false,
>(
  databaseService: Context.Service<DatabaseId, D>,
  configuration:
    | PasswordTargetConfiguration
    | ((service: TransactionService | undefined) => PasswordTargetConfiguration),
) => {
  const configurationFor = (database: D) =>
    typeof configuration === "function"
      ? configuration(transactionService(database))
      : configuration;

  const standaloneConfiguration =
    typeof configuration === "function"
      ? Effect.map(acquireTransactionService(databaseService), configuration)
      : Effect.succeed(configuration);

  function coordinatePasswordPreparedPersistence<
    Database extends D,
    TargetId,
    S extends AnySQLiteTable,
    I extends AnySQLiteTable,
    C extends AnySQLiteTable,
    AC extends AnySQLiteTable,
    A extends AnySQLiteTable,
    RS extends AnySQLiteTable,
    CE extends AnySQLiteTable,
    M extends AnySQLiteTable,
    T extends AnySQLiteTable,
    B extends AnySQLiteTable,
    NativeId,
    PS extends AnySQLiteTable,
    PC extends AnySQLiteTable,
    PM extends AnySQLiteTable,
    PSub extends AnySQLiteTable,
    PI extends AnySQLiteTable,
    PCr extends AnySQLiteTable,
    PNativeId,
    Out,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: PasswordPreparedPersistenceMapping<
        S,
        I,
        C,
        AC,
        A,
        RS,
        CE,
        M,
        T,
        B,
        NativeId
      >;
      readonly proofMapping?:
        | PasswordPreparedProofMapping<PS, PC, PM, PSub, PI, PCr, PNativeId>
        | undefined;
      readonly target: SuppliedService<TargetId, PasswordPreparedPersistence>;
      readonly transaction?: never;
    },
    body: Effect.Effect<Out, E, Synchronous extends true ? NoInfer<TargetId> : R>,
  ): Effect.Effect<
    Out,
    E | PasswordUnavailable | HookConfigurationError | SqlError | DatabaseError,
    | (Synchronous extends true ? never : Exclude<R, TargetId>)
    | LifecycleHooks
    | DatabaseRequirements
  >;
  function coordinatePasswordPreparedPersistence<
    Database extends D,
    TargetId,
    S extends AnySQLiteTable,
    I extends AnySQLiteTable,
    C extends AnySQLiteTable,
    AC extends AnySQLiteTable,
    A extends AnySQLiteTable,
    RS extends AnySQLiteTable,
    CE extends AnySQLiteTable,
    M extends AnySQLiteTable,
    T extends AnySQLiteTable,
    B extends AnySQLiteTable,
    NativeId,
    PS extends AnySQLiteTable,
    PC extends AnySQLiteTable,
    PM extends AnySQLiteTable,
    PSub extends AnySQLiteTable,
    PI extends AnySQLiteTable,
    PCr extends AnySQLiteTable,
    PNativeId,
    Out,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
    TxId,
    TxShape,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: PasswordPreparedPersistenceMapping<
        S,
        I,
        C,
        AC,
        A,
        RS,
        CE,
        M,
        T,
        B,
        NativeId
      >;
      readonly proofMapping?:
        | PasswordPreparedProofMapping<PS, PC, PM, PSub, PI, PCr, PNativeId>
        | undefined;
      readonly target: SuppliedService<TargetId, PasswordPreparedPersistence>;
      readonly transaction: SuppliedService<TxId, NoInfer<TransactionOf<Database>>, TxShape>;
    },
    body: Effect.Effect<Out, E, Synchronous extends true ? NoInfer<TargetId | TxId> : R>,
  ): Effect.Effect<
    Out,
    E | PasswordUnavailable | HookConfigurationError | SqlError | DatabaseError,
    | (Synchronous extends true ? never : Exclude<R, TargetId | TxId>)
    | LifecycleHooks
    | DatabaseRequirements
  >;
  function coordinatePasswordPreparedPersistence<
    Database extends D,
    TargetId,
    S extends AnySQLiteTable,
    I extends AnySQLiteTable,
    C extends AnySQLiteTable,
    AC extends AnySQLiteTable,
    A extends AnySQLiteTable,
    RS extends AnySQLiteTable,
    CE extends AnySQLiteTable,
    M extends AnySQLiteTable,
    T extends AnySQLiteTable,
    B extends AnySQLiteTable,
    NativeId,
    PS extends AnySQLiteTable,
    PC extends AnySQLiteTable,
    PM extends AnySQLiteTable,
    PSub extends AnySQLiteTable,
    PI extends AnySQLiteTable,
    PCr extends AnySQLiteTable,
    PNativeId,
    Out,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
    TxId,
    TxShape,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: PasswordPreparedPersistenceMapping<
        S,
        I,
        C,
        AC,
        A,
        RS,
        CE,
        M,
        T,
        B,
        NativeId
      >;
      readonly proofMapping?:
        | PasswordPreparedProofMapping<PS, PC, PM, PSub, PI, PCr, PNativeId>
        | undefined;
      readonly target: SuppliedService<TargetId, PasswordPreparedPersistence>;
      readonly transaction?: SuppliedService<TxId, NoInfer<TransactionOf<Database>>, TxShape>;
    },
    body: Effect.Effect<Out, E, R>,
  ): Effect.Effect<
    Out,
    E | PasswordUnavailable | HookConfigurationError | SqlError | DatabaseError,
    Exclude<R, TargetId> | LifecycleHooks | DatabaseRequirements
  > {
    return Effect.flatMap(nativeDatabase(acquire), (database) =>
      coordinateTargetPasswordPreparedPersistence<
        TransactionOf<Database>,
        Out,
        E,
        Exclude<R, TargetId>
      >(
        database,
        options.mapping,
        configurationFor(database),
        options.proofMapping,
        (
          transaction: TransactionOf<Database>,
          services: { readonly passwordPreparedPersistence: PasswordPreparedPersistence },
        ) => {
          const provided = Context.make(options.target, services.passwordPreparedPersistence);
          const work = Effect.provideContext(body, provided);

          return options.transaction === undefined
            ? work
            : Effect.provideService(work, options.transaction, options.transaction.of(transaction));
        },
      ).pipe(Effect.provideService(NativeDatabase, database)),
    );
  }

  return {
    makePasswordPreparedPersistenceServices: <
      S extends AnySQLiteTable,
      I extends AnySQLiteTable,
      C extends AnySQLiteTable,
      AC extends AnySQLiteTable,
      A extends AnySQLiteTable,
      RS extends AnySQLiteTable,
      CE extends AnySQLiteTable,
      M extends AnySQLiteTable,
      T extends AnySQLiteTable,
      B extends AnySQLiteTable,
      NativeId,
      PS extends AnySQLiteTable = AnySQLiteTable,
      PC extends AnySQLiteTable = AnySQLiteTable,
      PM extends AnySQLiteTable = AnySQLiteTable,
      PSub extends AnySQLiteTable = AnySQLiteTable,
      PI extends AnySQLiteTable = AnySQLiteTable,
      PCr extends AnySQLiteTable = AnySQLiteTable,
      PNativeId = unknown,
    >(
      mapping: PasswordPreparedPersistenceMapping<S, I, C, AC, A, RS, CE, M, T, B, NativeId>,
      proofMapping?: PasswordPreparedProofMapping<PS, PC, PM, PSub, PI, PCr, PNativeId>,
    ) =>
      Effect.flatMap(standaloneConfiguration, (configuration) =>
        makeTargetPasswordPreparedPersistenceServices(mapping, configuration, proofMapping),
      ).pipe(
        Effect.provideServiceEffect(CurrentPasswordSql, nativeDatabase(databaseService)),
        Effect.provideServiceEffect(NativeDatabase, nativeDatabase(databaseService)),
      ),
    coordinatePasswordPreparedPersistence,
  };
};
