import type { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import {
  coordinateCommit,
  hasCommitScope,
  LifecycleHooks,
  type HookConfigurationError,
} from "@yielded/auth/Hooks";
import { ProofUnavailable, ProofPersistence } from "@yielded/auth/Proofs";
/* oxlint-disable no-explicit-any -- public driver entrypoints restore concrete Drizzle types. */
import { Effect, Layer } from "effect";
import type * as SqlError from "effect/sql/SqlError";

import {
  CurrentProofSql,
  makeSqlProofPersistence,
  type ProofSqlConfiguration,
  type ProofSqlDatabase,
  type ProofSqlQuery,
} from "./proof-sql";
import { sqlClientStandaloneGuard, type TransactionService } from "./standalone-guard";
import { validateDrizzleStorage } from "./storage-validation";

export interface ProofTargetConfiguration {
  readonly mode: "interactive" | "synchronous";
  readonly locking: boolean;
  readonly standaloneGuard: Effect.Effect<void, ProofUnavailable>;
  readonly coordinatorGuard?: Effect.Effect<void, ProofUnavailable>;
  readonly insertIfAbsent: (
    query: ProofSqlQuery,
    selfKey: string,
    selfValue: unknown,
  ) => ProofSqlQuery;
}

interface TransactionOwner<Transaction> {
  readonly transaction: <A, E, R>(
    body: (transaction: Transaction) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | SqlError.SqlError, R>;
}

export type ProofCoordinatorError<E> =
  | E
  | ProofUnavailable
  | HookConfigurationError
  | SqlError.SqlError;

export const sqlClientProofStandaloneGuard = (
  service: TransactionService | undefined,
): Effect.Effect<void, ProofUnavailable> =>
  sqlClientStandaloneGuard(service, () => ProofUnavailable.make({}));

const options = (
  configuration: ProofTargetConfiguration,
  coordinated = false,
): ProofSqlConfiguration => ({
  mode: configuration.mode,
  locking: configuration.locking,

  standaloneGuard: !coordinated ? configuration.standaloneGuard : Effect.void,
  insertIfAbsent: configuration.insertIfAbsent,
  coordinated,
});

export const makeTargetProofPersistenceServices = (
  mapping: any,
  configuration: ProofTargetConfiguration,
) =>
  Effect.gen(function* () {
    return {
      proofPersistence: yield* makeSqlProofPersistence(mapping, options(configuration)),
    };
  });

/**
 * The native transaction is the root commit owner. Interruption or owner failure
 * rolls it back and discards the journal. No owner effect is retried. Native
 * transaction-acquisition `SqlError`s are exposed; caller errors, including
 * Drizzle query wrappers, propagate unchanged.
 */
export const coordinateTargetProofPersistence = <Transaction, A, E, R>(
  database: TransactionOwner<Transaction>,
  mapping: any,
  configuration: ProofTargetConfiguration,
  owner: (
    transaction: Transaction,
    services: { readonly proofPersistence: ProofPersistence["Service"] },
  ) => Effect.Effect<A, E, R>,
): Effect.Effect<A, ProofCoordinatorError<E>, R | LifecycleHooks | NativeDatabase> =>
  Effect.gen(function* (): Effect.fn.Return<
    A,
    ProofCoordinatorError<E>,
    R | LifecycleHooks | NativeDatabase
  > {
    const hooks = yield* LifecycleHooks;

    if (yield* hasCommitScope) return yield* ProofUnavailable.make({});
    yield* configuration.coordinatorGuard ?? configuration.standaloneGuard;

    yield* validateDrizzleStorage(mapping).pipe(Effect.mapError(() => ProofUnavailable.make({})));

    const result = yield* coordinateCommit(
      () =>
        database.transaction((transaction) =>
          Effect.gen(function* () {
            return yield* owner(transaction, {
              proofPersistence: yield* makeSqlProofPersistence(
                mapping,
                options(configuration, true),
              ).pipe(
                Effect.provideService(CurrentProofSql, transaction as unknown as ProofSqlDatabase),
              ),
            });
          }),
        ),
      { mode: configuration.mode },
    ).pipe(Effect.provideService(LifecycleHooks, hooks));

    return result.value;
  });

export const proofPersistenceLayer = <E, R>(
  services: Effect.Effect<{ readonly proofPersistence: ProofPersistence["Service"] }, E, R>,
) =>
  Layer.effect(
    ProofPersistence,
    Effect.map(services, (value) => value.proofPersistence),
  );
