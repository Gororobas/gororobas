import { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import type { LifecycleHooks, HookConfigurationError } from "@yielded/auth/Hooks";
import type { PasswordUnavailable, PasswordPreparedPersistence } from "@yielded/auth/Password";
import type { AnyRelations } from "drizzle-orm";
import type { EffectMysql2Database } from "drizzle-orm/effect-mysql2";
import type { AnyMySqlTable } from "drizzle-orm/mysql-core";
import { Effect, Context } from "effect";
import type { SqlError } from "effect/sql/SqlError";

import { Database as DatabaseService } from "./mysql-database";
import { mysqlPasswordConfiguration as configuration } from "./mysql-passwords";
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
import { acquireTransactionService, transactionService } from "./standalone-guard";
import type { SuppliedService } from "./SuppliedService";
type Database = EffectMysql2Database<AnyRelations>;
type TransactionOf<D extends Database> = Parameters<Parameters<D["transaction"]>[0]>[0];

export const makeMySqlPasswordPreparedPersistenceServices = <
  S extends AnyMySqlTable,
  I extends AnyMySqlTable,
  C extends AnyMySqlTable,
  AC extends AnyMySqlTable,
  A extends AnyMySqlTable,
  RS extends AnyMySqlTable,
  CE extends AnyMySqlTable,
  M extends AnyMySqlTable,
  T extends AnyMySqlTable,
  B extends AnyMySqlTable,
  NativeId,
  PS extends AnyMySqlTable = AnyMySqlTable,
  PC extends AnyMySqlTable = AnyMySqlTable,
  PM extends AnyMySqlTable = AnyMySqlTable,
  PSub extends AnyMySqlTable = AnyMySqlTable,
  PI extends AnyMySqlTable = AnyMySqlTable,
  PCr extends AnyMySqlTable = AnyMySqlTable,
  PNativeId = unknown,
>(
  mapping: PasswordPreparedPersistenceMapping<S, I, C, AC, A, RS, CE, M, T, B, NativeId>,
  proofMapping?: PasswordPreparedProofMapping<PS, PC, PM, PSub, PI, PCr, PNativeId>,
) =>
  Effect.flatMap(
    Effect.map(acquireTransactionService(DatabaseService), configuration),
    (configuration) =>
      makeTargetPasswordPreparedPersistenceServices(mapping, configuration, proofMapping),
  ).pipe(
    Effect.provideServiceEffect(CurrentPasswordSql, nativeDatabase(DatabaseService)),
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
  );

export function coordinateMySqlPasswordPreparedPersistence<
  TargetId,
  D extends Database,
  S extends AnyMySqlTable,
  I extends AnyMySqlTable,
  C extends AnyMySqlTable,
  AC extends AnyMySqlTable,
  A extends AnyMySqlTable,
  RS extends AnyMySqlTable,
  CE extends AnyMySqlTable,
  M extends AnyMySqlTable,
  T extends AnyMySqlTable,
  B extends AnyMySqlTable,
  NativeId,
  PS extends AnyMySqlTable,
  PC extends AnyMySqlTable,
  PM extends AnyMySqlTable,
  PSub extends AnyMySqlTable,
  PI extends AnyMySqlTable,
  PCr extends AnyMySqlTable,
  PNativeId,
  Out,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: PasswordPreparedPersistenceMapping<S, I, C, AC, A, RS, CE, M, T, B, NativeId>;
    readonly proofMapping?:
      | PasswordPreparedProofMapping<PS, PC, PM, PSub, PI, PCr, PNativeId>
      | undefined;
    readonly target: SuppliedService<TargetId, PasswordPreparedPersistence>;
    readonly transaction?: never;
  },
  body: Effect.Effect<Out, E, R>,
): Effect.Effect<
  Out,
  E | PasswordUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, TargetId> | LifecycleHooks | DatabaseRequirements
>;

export function coordinateMySqlPasswordPreparedPersistence<
  TargetId,
  D extends Database,
  S extends AnyMySqlTable,
  I extends AnyMySqlTable,
  C extends AnyMySqlTable,
  AC extends AnyMySqlTable,
  A extends AnyMySqlTable,
  RS extends AnyMySqlTable,
  CE extends AnyMySqlTable,
  M extends AnyMySqlTable,
  T extends AnyMySqlTable,
  B extends AnyMySqlTable,
  NativeId,
  PS extends AnyMySqlTable,
  PC extends AnyMySqlTable,
  PM extends AnyMySqlTable,
  PSub extends AnyMySqlTable,
  PI extends AnyMySqlTable,
  PCr extends AnyMySqlTable,
  PNativeId,
  Out,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
  TxId,
  TxShape,
>(
  acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: PasswordPreparedPersistenceMapping<S, I, C, AC, A, RS, CE, M, T, B, NativeId>;
    readonly proofMapping?:
      | PasswordPreparedProofMapping<PS, PC, PM, PSub, PI, PCr, PNativeId>
      | undefined;
    readonly target: SuppliedService<TargetId, PasswordPreparedPersistence>;
    readonly transaction: SuppliedService<TxId, NoInfer<TransactionOf<D>>, TxShape>;
  },
  body: Effect.Effect<Out, E, R>,
): Effect.Effect<
  Out,
  E | PasswordUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, TargetId | TxId> | LifecycleHooks | DatabaseRequirements
>;

export function coordinateMySqlPasswordPreparedPersistence<
  TargetId,
  D extends Database,
  S extends AnyMySqlTable,
  I extends AnyMySqlTable,
  C extends AnyMySqlTable,
  AC extends AnyMySqlTable,
  A extends AnyMySqlTable,
  RS extends AnyMySqlTable,
  CE extends AnyMySqlTable,
  M extends AnyMySqlTable,
  T extends AnyMySqlTable,
  B extends AnyMySqlTable,
  NativeId,
  PS extends AnyMySqlTable,
  PC extends AnyMySqlTable,
  PM extends AnyMySqlTable,
  PSub extends AnyMySqlTable,
  PI extends AnyMySqlTable,
  PCr extends AnyMySqlTable,
  PNativeId,
  Out,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
  TxId,
  TxShape,
>(
  acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: PasswordPreparedPersistenceMapping<S, I, C, AC, A, RS, CE, M, T, B, NativeId>;
    readonly proofMapping?:
      | PasswordPreparedProofMapping<PS, PC, PM, PSub, PI, PCr, PNativeId>
      | undefined;
    readonly target: SuppliedService<TargetId, PasswordPreparedPersistence>;
    readonly transaction?: SuppliedService<TxId, NoInfer<TransactionOf<D>>, TxShape>;
  },
  body: Effect.Effect<Out, E, R>,
): Effect.Effect<
  Out,
  E | PasswordUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, TargetId> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetPasswordPreparedPersistence<TransactionOf<D>, Out, E, Exclude<R, TargetId>>(
      database,
      options.mapping,
      configuration(transactionService(database)),
      options.proofMapping,
      (
        transaction: TransactionOf<D>,
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
