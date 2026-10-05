import { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import type { LifecycleHooks, HookConfigurationError } from "@yielded/auth/Hooks";
import { type ProofUnavailable, ProofPersistence } from "@yielded/auth/Proofs";
import type { AnyRelations } from "drizzle-orm";
import type { EffectLibsqlDatabase } from "drizzle-orm/effect-libsql";
import type { EffectSQLiteBunDatabase } from "drizzle-orm/effect-sqlite-bun";
import type { EffectSQLiteDoDatabase } from "drizzle-orm/effect-sqlite-do";
import type { EffectSQLiteNodeDatabase } from "drizzle-orm/effect-sqlite-node";
import type { EffectSQLiteWasmDatabase } from "drizzle-orm/effect-sqlite-wasm";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { Effect, Context } from "effect";
import type { SqlError } from "effect/sql/SqlError";

import { nativeDatabase } from "./native-database";
import type { ProofPersistenceMapping } from "./proof-model";
import { CurrentProofSql } from "./proof-sql";
import {
  coordinateTargetProofPersistence,
  makeTargetProofPersistenceServices,
  type ProofTargetConfiguration,
} from "./proof-target";
import {
  type TransactionService,
  acquireTransactionService,
  transactionService,
} from "./standalone-guard";
import type { SuppliedService } from "./SuppliedService";

type Database =
  | EffectLibsqlDatabase<AnyRelations>
  | EffectSQLiteBunDatabase<AnyRelations>
  | EffectSQLiteDoDatabase<AnyRelations>
  | EffectSQLiteNodeDatabase<AnyRelations>
  | EffectSQLiteWasmDatabase<AnyRelations>;
type TransactionOf<D extends Database> = Parameters<Parameters<D["transaction"]>[0]>[0];
type Mapping<
  Rq extends AnySQLiteTable,
  S extends AnySQLiteTable,
  G extends AnySQLiteTable,
  Cn extends AnySQLiteTable,
  Rs extends AnySQLiteTable,
  A extends AnySQLiteTable,
  F extends AnySQLiteTable,
  C extends AnySQLiteTable,
  Sub extends AnySQLiteTable,
  I extends AnySQLiteTable,
  Cr extends AnySQLiteTable,
  NativeId,
> = ProofPersistenceMapping<Rq, S, G, Cn, Rs, A, F, C, Sub, I, Cr, NativeId>;

export const sqliteProofConfiguration = (
  mode: "interactive" | "synchronous",
  standaloneGuard: Effect.Effect<void, ProofUnavailable>,
  coordinatorGuard?: Effect.Effect<void, ProofUnavailable>,
): ProofTargetConfiguration => ({
  mode,
  locking: false,
  standaloneGuard,
  insertIfAbsent: (query) => query.onConflictDoNothing(),
  ...(coordinatorGuard === undefined ? {} : { coordinatorGuard }),
});

export const makeSqliteProofTarget = <
  DatabaseId,
  D extends Database,
  Synchronous extends boolean = false,
>(
  databaseService: Context.Service<DatabaseId, D>,
  configuration:
    | ProofTargetConfiguration
    | ((service: TransactionService | undefined) => ProofTargetConfiguration),
) => {
  const configurationFor = (database: D) =>
    typeof configuration === "function"
      ? configuration(transactionService(database))
      : configuration;

  const standaloneConfiguration =
    typeof configuration === "function"
      ? Effect.map(acquireTransactionService(databaseService), configuration)
      : Effect.succeed(configuration);

  function coordinateProofPersistence<
    Database extends D,
    Rq extends AnySQLiteTable,
    S extends AnySQLiteTable,
    G extends AnySQLiteTable,
    Cn extends AnySQLiteTable,
    Rs extends AnySQLiteTable,
    Aev extends AnySQLiteTable,
    F extends AnySQLiteTable,
    C extends AnySQLiteTable,
    Sub extends AnySQLiteTable,
    I extends AnySQLiteTable,
    Cr extends AnySQLiteTable,
    NativeId,
    A,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: Mapping<Rq, S, G, Cn, Rs, Aev, F, C, Sub, I, Cr, NativeId>;
      readonly transaction?: never;
    },
    body: Effect.Effect<A, E, Synchronous extends true ? NoInfer<ProofPersistence> : R>,
  ): Effect.Effect<
    A,
    E | ProofUnavailable | HookConfigurationError | SqlError | DatabaseError,
    | (Synchronous extends true ? never : Exclude<R, ProofPersistence>)
    | LifecycleHooks
    | DatabaseRequirements
  >;
  function coordinateProofPersistence<
    Database extends D,
    Rq extends AnySQLiteTable,
    S extends AnySQLiteTable,
    G extends AnySQLiteTable,
    Cn extends AnySQLiteTable,
    Rs extends AnySQLiteTable,
    Aev extends AnySQLiteTable,
    F extends AnySQLiteTable,
    C extends AnySQLiteTable,
    Sub extends AnySQLiteTable,
    I extends AnySQLiteTable,
    Cr extends AnySQLiteTable,
    NativeId,
    A,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
    TxId,
    TxShape,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: Mapping<Rq, S, G, Cn, Rs, Aev, F, C, Sub, I, Cr, NativeId>;
      readonly transaction: SuppliedService<TxId, NoInfer<TransactionOf<Database>>, TxShape>;
    },
    body: Effect.Effect<A, E, Synchronous extends true ? NoInfer<ProofPersistence | TxId> : R>,
  ): Effect.Effect<
    A,
    E | ProofUnavailable | HookConfigurationError | SqlError | DatabaseError,
    | (Synchronous extends true ? never : Exclude<R, ProofPersistence | TxId>)
    | LifecycleHooks
    | DatabaseRequirements
  >;
  function coordinateProofPersistence<
    Database extends D,
    Rq extends AnySQLiteTable,
    S extends AnySQLiteTable,
    G extends AnySQLiteTable,
    Cn extends AnySQLiteTable,
    Rs extends AnySQLiteTable,
    Aev extends AnySQLiteTable,
    F extends AnySQLiteTable,
    C extends AnySQLiteTable,
    Sub extends AnySQLiteTable,
    I extends AnySQLiteTable,
    Cr extends AnySQLiteTable,
    NativeId,
    A,
    E,
    R,
    DatabaseError,
    DatabaseRequirements,
    TxId,
    TxShape,
  >(
    acquire: Effect.Effect<Database, DatabaseError, DatabaseRequirements>,
    options: {
      readonly mapping: Mapping<Rq, S, G, Cn, Rs, Aev, F, C, Sub, I, Cr, NativeId>;
      readonly transaction?: SuppliedService<TxId, NoInfer<TransactionOf<Database>>, TxShape>;
    },
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<
    A,
    E | ProofUnavailable | HookConfigurationError | SqlError | DatabaseError,
    Exclude<R, ProofPersistence> | LifecycleHooks | DatabaseRequirements
  > {
    return Effect.flatMap(nativeDatabase(acquire), (database) =>
      coordinateTargetProofPersistence<TransactionOf<Database>, A, E, Exclude<R, ProofPersistence>>(
        database,
        options.mapping,
        configurationFor(database),
        (
          transaction: TransactionOf<Database>,
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

  return {
    makeProofPersistenceServices: <
      Rq extends AnySQLiteTable,
      S extends AnySQLiteTable,
      G extends AnySQLiteTable,
      Cn extends AnySQLiteTable,
      Rs extends AnySQLiteTable,
      A extends AnySQLiteTable,
      F extends AnySQLiteTable,
      C extends AnySQLiteTable,
      Sub extends AnySQLiteTable,
      I extends AnySQLiteTable,
      Cr extends AnySQLiteTable,
      NativeId,
    >(
      mapping: Mapping<Rq, S, G, Cn, Rs, A, F, C, Sub, I, Cr, NativeId>,
    ) =>
      Effect.flatMap(standaloneConfiguration, (configuration) =>
        makeTargetProofPersistenceServices(mapping, configuration),
      ).pipe(
        Effect.provideServiceEffect(CurrentProofSql, nativeDatabase(databaseService)),
        Effect.provideServiceEffect(NativeDatabase, nativeDatabase(databaseService)),
      ),
    coordinateProofPersistence,
  };
};
