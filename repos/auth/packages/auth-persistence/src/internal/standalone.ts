import { type Context, Effect } from "effect";
import type * as SqlClient from "effect/sql/SqlClient";

/** Standalone operations must observe their own durable commit. */
export const requireStandalone = <Failure>(
  unavailable: () => Failure,
  transactionService?: Context.Key<
    SqlClient.TransactionConnection,
    SqlClient.TransactionConnection.Service
  >,
): Effect.Effect<void, Failure> =>
  Effect.withFiber((fiber) => {
    const services = fiber.context.mapUnsafe;

    if (transactionService !== undefined && services.has(transactionService.key))
      return Effect.fail(unavailable());

    // rc.117 libSQL uses a private per-client marker that is not exposed through
    // SqlClient.transactionService. Conservatively reject every ambient libSQL
    // transaction, including another client's, before issuing standalone writes.
    // Recheck this upstream detail whenever the Effect driver is upgraded.
    for (const key of services.keys()) {
      if (key.startsWith("@effect/sql-libsql/LibsqlClient/LibsqlTransaction/"))
        return Effect.fail(unavailable());
    }

    return Effect.void;
  });
