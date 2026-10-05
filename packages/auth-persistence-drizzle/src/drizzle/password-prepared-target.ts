import {
  type NativeDatabase,
  CurrentPasswordPreparedTransaction,
  PasswordPreparedPostconditions,
  PasswordPreparedJournalGuards,
  type PasswordPreparedPostcondition,
} from "@yielded/auth-persistence/Adapter";
import {
  coordinateCommit,
  hasCommitScope,
  type PreparedCommit,
  LifecycleHooks,
} from "@yielded/auth/Hooks";
import { PasswordUnavailable, type PasswordPreparedPersistence } from "@yielded/auth/Password";
/* oxlint-disable no-explicit-any -- concrete driver modules restore native table/database types. */
import { type Context, Cause, Effect, Layer } from "effect";
import type * as SqlError from "effect/sql/SqlError";

import { makeSqlPasswordPreparedPersistence } from "./password-prepared-sql";
import { CurrentPasswordSql } from "./password-sql";
import type { PasswordSqlDatabase } from "./password-sql";
import {
  passwordOptions,
  type PasswordTargetConfiguration,
  type PasswordCoordinatorError,
} from "./password-target";
import { validateDrizzleStorage } from "./storage-validation";

export const makeTargetPasswordPreparedPersistenceServices = (
  mapping: any,
  configuration: PasswordTargetConfiguration,
  proofMapping?: any,
) =>
  Effect.gen(function* () {
    return {
      passwordPreparedPersistence: yield* makeSqlPasswordPreparedPersistence(
        mapping,
        passwordOptions(configuration, proofMapping),
      ),
    };
  });

export const coordinateTargetPasswordPreparedPersistence = <Transaction, A, E, R>(
  database: {
    readonly transaction: <Out, Err, Env>(
      body: (transaction: Transaction) => Effect.Effect<Out, Err, Env>,
    ) => Effect.Effect<Out, Err | SqlError.SqlError, Env>;
  },
  mapping: any,
  configuration: PasswordTargetConfiguration,
  proofMapping: any | undefined,
  owner: (
    transaction: Transaction,
    services: { readonly passwordPreparedPersistence: PasswordPreparedPersistence },
  ) => Effect.Effect<A, E, R>,
): Effect.Effect<A, PasswordCoordinatorError<E>, R | LifecycleHooks | NativeDatabase> =>
  Effect.gen(function* () {
    const hooks = yield* LifecycleHooks;

    if (yield* hasCommitScope) return yield* PasswordUnavailable.make({});
    yield* configuration.coordinatorGuard ?? configuration.standaloneGuard;

    yield* validateDrizzleStorage({ ...mapping, proof: proofMapping }).pipe(
      Effect.mapError(() => PasswordUnavailable.make({})),
    );

    const result = yield* coordinateCommit(
      () =>
        database.transaction((transaction) =>
          Effect.gen(function* () {
            const guards: Array<PreparedCommit<void>> = [];
            const postconditions: Array<PasswordPreparedPostcondition> = [];
            let poisoned = false;
            let acceptingPostconditions = true;

            const services = yield* makeSqlPasswordPreparedPersistence(
              mapping,
              passwordOptions(configuration, proofMapping, true),
            ).pipe(
              Effect.provideService(
                CurrentPasswordSql,
                transaction as unknown as PasswordSqlDatabase,
              ),
            );

            const protect = <Out, Err, Env>(effect: Effect.Effect<Out, Err, Env>) =>
              effect.pipe(
                Effect.onError(() =>
                  Effect.sync(() => {
                    poisoned = true;
                  }),
                ),
              );

            const value = yield* owner(transaction, {
              passwordPreparedPersistence: {
                reserve: (input, prepare) => protect(services.reserve(input, prepare)),
                publishReady: (input, prepare) => protect(services.publishReady(input, prepare)),
                context: (input) => protect(services.context(input)),
                complete: (input, prepare) => protect(services.complete(input, prepare)),
                resetWithProof: (input, prepare) =>
                  protect(services.resetWithProof(input, prepare)),
                cancel: (input, prepare) => protect(services.cancel(input, prepare)),
                cleanup: (input, prepare) => protect(services.cleanup(input, prepare)),
              },
            }).pipe(
              Effect.provideService(PasswordPreparedJournalGuards, {
                register: (guard) => {
                  if (!acceptingPostconditions) return false;
                  guards.push(guard);

                  return true;
                },
              }),
              Effect.provideService(PasswordPreparedPostconditions, {
                register: (check) => {
                  if (!acceptingPostconditions) return false;
                  postconditions.push(check);

                  return true;
                },
              }),
              Effect.ensuring(
                Effect.sync(() => {
                  acceptingPostconditions = false;
                }),
              ),
            );

            if (poisoned) return yield* PasswordUnavailable.make({});
            for (const guard of guards) {
              const status = yield* Effect.result(guard.read);

              if (status._tag === "Success" || status.failure._tag !== "CommitPending")
                return yield* PasswordUnavailable.make({});
            }

            for (const check of postconditions)
              yield* check.pipe(
                Effect.provideService(
                  CurrentPasswordPreparedTransaction,
                  transaction as unknown as PasswordSqlDatabase,
                ),
                Effect.catchCause((cause) =>
                  Effect.failCause(Cause.map(cause, () => PasswordUnavailable.make({}))),
                ),
              );

            return value;
          }),
        ),
      { mode: configuration.mode },
    ).pipe(Effect.provideService(LifecycleHooks, hooks));

    return result.value;
  });

export const passwordPreparedPersistenceLayer = <Id, E, R>(
  tag: Context.Key<Id, PasswordPreparedPersistence>,
  services: Effect.Effect<
    { readonly passwordPreparedPersistence: PasswordPreparedPersistence },
    E,
    R
  >,
) =>
  Layer.effect(
    tag,
    Effect.map(services, (value) => value.passwordPreparedPersistence),
  );
