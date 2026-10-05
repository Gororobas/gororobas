import { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import type { LifecycleHooks, HookConfigurationError } from "@yielded/auth/Hooks";
import { type ProofUnavailable, ProofPersistence } from "@yielded/auth/Proofs";
import type { AnyRelations } from "drizzle-orm";
import type { EffectMysql2Database } from "drizzle-orm/effect-mysql2";
import type { AnyMySqlTable } from "drizzle-orm/mysql-core";
import { Effect, Context } from "effect";
import type { SqlError } from "effect/sql/SqlError";

import { updateValues } from "./model";
import { Database as DatabaseService } from "./mysql-database";
import { nativeDatabase } from "./native-database";
import type { ProofPersistenceMapping } from "./proof-model";
import { CurrentProofSql } from "./proof-sql";
import type { ProofSqlQuery } from "./proof-sql";
import {
  coordinateTargetProofPersistence,
  makeTargetProofPersistenceServices,
  sqlClientProofStandaloneGuard,
} from "./proof-target";
import {
  type TransactionService,
  acquireTransactionService,
  transactionService,
} from "./standalone-guard";
import type { SuppliedService } from "./SuppliedService";

type Database = EffectMysql2Database<AnyRelations>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Mapping<
  Rq extends AnyMySqlTable,
  S extends AnyMySqlTable,
  G extends AnyMySqlTable,
  Cn extends AnyMySqlTable,
  Rs extends AnyMySqlTable,
  A extends AnyMySqlTable,
  F extends AnyMySqlTable,
  C extends AnyMySqlTable,
  Sub extends AnyMySqlTable,
  I extends AnyMySqlTable,
  Cr extends AnyMySqlTable,
  NativeId,
> = ProofPersistenceMapping<Rq, S, G, Cn, Rs, A, F, C, Sub, I, Cr, NativeId>;

const configuration = (service: TransactionService | undefined) => ({
  mode: "interactive" as const,
  locking: true,
  standaloneGuard: sqlClientProofStandaloneGuard(service),
  insertIfAbsent: (query: ProofSqlQuery, selfKey: string, selfValue: unknown) =>
    query.onDuplicateKeyUpdate({
      set: updateValues([[selfKey, selfValue]]),
    }),
});

export const makeMysqlProofPersistenceServices = <
  Rq extends AnyMySqlTable,
  S extends AnyMySqlTable,
  G extends AnyMySqlTable,
  Cn extends AnyMySqlTable,
  Rs extends AnyMySqlTable,
  A extends AnyMySqlTable,
  F extends AnyMySqlTable,
  C extends AnyMySqlTable,
  Sub extends AnyMySqlTable,
  I extends AnyMySqlTable,
  Cr extends AnyMySqlTable,
  NativeId,
>(
  mapping: Mapping<Rq, S, G, Cn, Rs, A, F, C, Sub, I, Cr, NativeId>,
) =>
  Effect.flatMap(
    Effect.map(acquireTransactionService(DatabaseService), configuration),
    (configuration) => makeTargetProofPersistenceServices(mapping, configuration),
  ).pipe(
    Effect.provideServiceEffect(CurrentProofSql, nativeDatabase(DatabaseService)),
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
  );

export function coordinateMysqlProofPersistence<
  D extends Database,
  Rq extends AnyMySqlTable,
  S extends AnyMySqlTable,
  G extends AnyMySqlTable,
  Cn extends AnyMySqlTable,
  Rs extends AnyMySqlTable,
  Aev extends AnyMySqlTable,
  F extends AnyMySqlTable,
  C extends AnyMySqlTable,
  Sub extends AnyMySqlTable,
  I extends AnyMySqlTable,
  Cr extends AnyMySqlTable,
  NativeId,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
>(
  acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: Mapping<Rq, S, G, Cn, Rs, Aev, F, C, Sub, I, Cr, NativeId>;
    readonly transaction?: never;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | ProofUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, ProofPersistence> | LifecycleHooks | DatabaseRequirements
>;

export function coordinateMysqlProofPersistence<
  D extends Database,
  Rq extends AnyMySqlTable,
  S extends AnyMySqlTable,
  G extends AnyMySqlTable,
  Cn extends AnyMySqlTable,
  Rs extends AnyMySqlTable,
  Aev extends AnyMySqlTable,
  F extends AnyMySqlTable,
  C extends AnyMySqlTable,
  Sub extends AnyMySqlTable,
  I extends AnyMySqlTable,
  Cr extends AnyMySqlTable,
  NativeId,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
  TxId,
  TxShape,
>(
  acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: Mapping<Rq, S, G, Cn, Rs, Aev, F, C, Sub, I, Cr, NativeId>;
    readonly transaction: SuppliedService<TxId, NoInfer<Transaction>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | ProofUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, ProofPersistence | TxId> | LifecycleHooks | DatabaseRequirements
>;

export function coordinateMysqlProofPersistence<
  D extends Database,
  Rq extends AnyMySqlTable,
  S extends AnyMySqlTable,
  G extends AnyMySqlTable,
  Cn extends AnyMySqlTable,
  Rs extends AnyMySqlTable,
  Aev extends AnyMySqlTable,
  F extends AnyMySqlTable,
  C extends AnyMySqlTable,
  Sub extends AnyMySqlTable,
  I extends AnyMySqlTable,
  Cr extends AnyMySqlTable,
  NativeId,
  A,
  E,
  R,
  DatabaseError,
  DatabaseRequirements,
  TxId,
  TxShape,
>(
  acquire: Effect.Effect<D, DatabaseError, DatabaseRequirements>,
  options: {
    readonly mapping: Mapping<Rq, S, G, Cn, Rs, Aev, F, C, Sub, I, Cr, NativeId>;
    readonly transaction?: SuppliedService<TxId, NoInfer<Transaction>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | ProofUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, ProofPersistence> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetProofPersistence<Transaction, A, E, Exclude<R, ProofPersistence>>(
      database,
      options.mapping,
      configuration(transactionService(database)),
      (
        transaction: Transaction,
        services: { readonly proofPersistence: ProofPersistence["Service"] },
      ) => {
        const provided = Context.make(ProofPersistence, services.proofPersistence);
        const work = Effect.provideContext(body, provided);

        return options.transaction === undefined
          ? work
          : Effect.provideService(work, options.transaction, options.transaction.of(transaction));
      },
    ).pipe(Effect.provideService(NativeDatabase, database)),
  );
}
