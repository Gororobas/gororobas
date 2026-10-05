import { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import type { LifecycleHooks, HookConfigurationError } from "@yielded/auth/Hooks";
import { type ProofUnavailable, ProofPersistence } from "@yielded/auth/Proofs";
import type { AnyRelations } from "drizzle-orm";
import type { EffectPgDatabase as PgliteDatabase } from "drizzle-orm/effect-pglite";
import type { EffectPgDatabase as PostgresDatabase } from "drizzle-orm/effect-postgres";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { Effect, Context } from "effect";
import type { SqlError } from "effect/sql/SqlError";

import { nativeDatabase } from "./native-database";
import { Database as DatabaseService } from "./pg-database";
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

type Database = PostgresDatabase<AnyRelations> | PgliteDatabase<AnyRelations>;
type TransactionOf<D extends Database> = Parameters<Parameters<D["transaction"]>[0]>[0];
type Mapping<
  Request extends AnyPgTable,
  Series extends AnyPgTable,
  Generation extends AnyPgTable,
  Continuation extends AnyPgTable,
  RateScope extends AnyPgTable,
  AbuseEvent extends AnyPgTable,
  FailureEvent extends AnyPgTable,
  Command extends AnyPgTable,
  Subject extends AnyPgTable,
  Identifier extends AnyPgTable,
  Credential extends AnyPgTable,
  NativeSubjectId,
> = ProofPersistenceMapping<
  Request,
  Series,
  Generation,
  Continuation,
  RateScope,
  AbuseEvent,
  FailureEvent,
  Command,
  Subject,
  Identifier,
  Credential,
  NativeSubjectId
>;

const configuration = (service: TransactionService | undefined) => ({
  mode: "interactive" as const,
  locking: true,
  standaloneGuard: sqlClientProofStandaloneGuard(service),
  insertIfAbsent: (query: ProofSqlQuery) => query.onConflictDoNothing(),
});

export const makePgProofPersistenceServices = <
  Rq extends AnyPgTable,
  S extends AnyPgTable,
  G extends AnyPgTable,
  Cn extends AnyPgTable,
  Rs extends AnyPgTable,
  A extends AnyPgTable,
  F extends AnyPgTable,
  C extends AnyPgTable,
  Sub extends AnyPgTable,
  I extends AnyPgTable,
  Cr extends AnyPgTable,
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

export function coordinatePgProofPersistence<
  D extends Database,
  Rq extends AnyPgTable,
  S extends AnyPgTable,
  G extends AnyPgTable,
  Cn extends AnyPgTable,
  Rs extends AnyPgTable,
  Aev extends AnyPgTable,
  F extends AnyPgTable,
  C extends AnyPgTable,
  Sub extends AnyPgTable,
  I extends AnyPgTable,
  Cr extends AnyPgTable,
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

export function coordinatePgProofPersistence<
  D extends Database,
  Rq extends AnyPgTable,
  S extends AnyPgTable,
  G extends AnyPgTable,
  Cn extends AnyPgTable,
  Rs extends AnyPgTable,
  Aev extends AnyPgTable,
  F extends AnyPgTable,
  C extends AnyPgTable,
  Sub extends AnyPgTable,
  I extends AnyPgTable,
  Cr extends AnyPgTable,
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
    readonly transaction: SuppliedService<TxId, NoInfer<TransactionOf<D>>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | ProofUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, ProofPersistence | TxId> | LifecycleHooks | DatabaseRequirements
>;

export function coordinatePgProofPersistence<
  D extends Database,
  Rq extends AnyPgTable,
  S extends AnyPgTable,
  G extends AnyPgTable,
  Cn extends AnyPgTable,
  Rs extends AnyPgTable,
  Aev extends AnyPgTable,
  F extends AnyPgTable,
  C extends AnyPgTable,
  Sub extends AnyPgTable,
  I extends AnyPgTable,
  Cr extends AnyPgTable,
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
    readonly transaction?: SuppliedService<TxId, NoInfer<TransactionOf<D>>, TxShape>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | ProofUnavailable | HookConfigurationError | SqlError | DatabaseError,
  Exclude<R, ProofPersistence> | LifecycleHooks | DatabaseRequirements
> {
  return Effect.flatMap(nativeDatabase(acquire), (database) =>
    coordinateTargetProofPersistence<TransactionOf<D>, A, E, Exclude<R, ProofPersistence>>(
      database,
      options.mapping,
      configuration(transactionService(database)),
      (
        transaction: TransactionOf<D>,
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
