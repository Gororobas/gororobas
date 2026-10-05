import { requireStandalone } from "@yielded/auth-persistence/Adapter";
import { Context, Effect, Predicate } from "effect";
import type * as SqlClient from "effect/sql/SqlClient";

export type TransactionService = Context.Key<
  SqlClient.TransactionConnection,
  SqlClient.TransactionConnection.Service
>;

export const transactionService = (database: unknown): TransactionService | undefined => {
  if (
    !Predicate.hasProperty(database, "$client") ||
    !Predicate.hasProperty(database.$client, "transactionService") ||
    !Context.isKey(database.$client.transactionService)
  ) {
    return undefined;
  }

  return database.$client.transactionService;
};

/** Capture the foreign client's marker while acquiring standalone services. */
export const acquireTransactionService = <Id, Database>(service: Context.Key<Id, Database>) =>
  Effect.map(Effect.service(service), (database): TransactionService | undefined => {
    if (
      !Predicate.hasProperty(database, "$client") ||
      !Predicate.hasProperty(database.$client, "transactionService") ||
      !Context.isKey(database.$client.transactionService)
    ) {
      return undefined;
    }

    return database.$client.transactionService;
  });

/** Bind the client-specific transaction marker at foreign adapter construction. */
export const sqlClientStandaloneGuard = <Failure>(
  service: TransactionService | undefined,
  unavailable: () => Failure,
): Effect.Effect<void, Failure> => {
  if (service === undefined) return Effect.suspend(() => Effect.fail(unavailable()));

  return requireStandalone(unavailable, service);
};
