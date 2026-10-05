import { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import type { LifecycleHooks, HookConfigurationError } from "@yielded/auth/Hooks";
import type { PasswordUnavailable, PasswordPreparedPersistence } from "@yielded/auth/Password";
import type { AnyRelations } from "drizzle-orm";
import type { EffectPgDatabase as PgliteDatabase } from "drizzle-orm/effect-pglite";
import type { EffectPgDatabase as PostgresDatabase } from "drizzle-orm/effect-postgres";
import type { AnyPgTable } from "drizzle-orm/pg-core";
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
import { Database as DatabaseService } from "./pg-database";
import { pgPasswordConfiguration as configuration } from "./pg-passwords";
import { acquireTransactionService, transactionService } from "./standalone-guard";
import type { SuppliedService } from "./SuppliedService";
type Database = PostgresDatabase<AnyRelations> | PgliteDatabase<AnyRelations>;
type TransactionOf<D extends Database> = Parameters<Parameters<D["transaction"]>[0]>[0];

export const makePgPasswordPreparedPersistenceServices = <
  S extends AnyPgTable,
  I extends AnyPgTable,
  C extends AnyPgTable,
  AC extends AnyPgTable,
  A extends AnyPgTable,
  RS extends AnyPgTable,
  CE extends AnyPgTable,
  M extends AnyPgTable,
  T extends AnyPgTable,
  B extends AnyPgTable,
  NativeId,
  PS extends AnyPgTable = AnyPgTable,
  PC extends AnyPgTable = AnyPgTable,
  PM extends AnyPgTable = AnyPgTable,
  PSub extends AnyPgTable = AnyPgTable,
  PI extends AnyPgTable = AnyPgTable,
  PCr extends AnyPgTable = AnyPgTable,
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

export function coordinatePgPasswordPreparedPersistence<
  TargetId,
  D extends Database,
  S extends AnyPgTable,
  I extends AnyPgTable,
  C extends AnyPgTable,
  AC extends AnyPgTable,
  A extends AnyPgTable,
  RS extends AnyPgTable,
  CE extends AnyPgTable,
  M extends AnyPgTable,
  T extends AnyPgTable,
  B extends AnyPgTable,
  NativeId,
  PS extends AnyPgTable,
  PC extends AnyPgTable,
  PM extends AnyPgTable,
  PSub extends AnyPgTable,
  PI extends AnyPgTable,
  PCr extends AnyPgTable,
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

export function coordinatePgPasswordPreparedPersistence<
  TargetId,
  D extends Database,
  S extends AnyPgTable,
  I extends AnyPgTable,
  C extends AnyPgTable,
  AC extends AnyPgTable,
  A extends AnyPgTable,
  RS extends AnyPgTable,
  CE extends AnyPgTable,
  M extends AnyPgTable,
  T extends AnyPgTable,
  B extends AnyPgTable,
  NativeId,
  PS extends AnyPgTable,
  PC extends AnyPgTable,
  PM extends AnyPgTable,
  PSub extends AnyPgTable,
  PI extends AnyPgTable,
  PCr extends AnyPgTable,
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

export function coordinatePgPasswordPreparedPersistence<
  TargetId,
  D extends Database,
  S extends AnyPgTable,
  I extends AnyPgTable,
  C extends AnyPgTable,
  AC extends AnyPgTable,
  A extends AnyPgTable,
  RS extends AnyPgTable,
  CE extends AnyPgTable,
  M extends AnyPgTable,
  T extends AnyPgTable,
  B extends AnyPgTable,
  NativeId,
  PS extends AnyPgTable,
  PC extends AnyPgTable,
  PM extends AnyPgTable,
  PSub extends AnyPgTable,
  PI extends AnyPgTable,
  PCr extends AnyPgTable,
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
