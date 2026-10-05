/* oxlint-disable no-explicit-any -- this private acquisition preserves the installed native transaction; public wrappers retain its exact type. */
import { EffectMysql2Transaction } from "drizzle-orm/effect-mysql2";
import { Effect } from "effect";
import { makeWithTransaction, type SqlClient } from "effect/sql/SqlClient";

/** Locking discovery and later SQL policy predicates must see the same current
 * authority. MySQL's default repeatable-read snapshot is unsuitable after a
 * contended authority lock. Own one connection and one-shot transaction mode;
 * the pooled connection's session default is never changed. */
export const mysqlTransaction = <A, E, R, Failure>(
  unavailable: () => Failure,
  database: any,
  body: (transaction: any) => Effect.Effect<A, E, R>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client: SqlClient = database.$client;
      const connection = yield* client.reserve;

      // Installed @effect/sql-mysql2 ConnectionImpl exposes its reserved native
      // PoolConnection as `conn`. Capture only its public disposal method; fail
      // before transaction work if an installed driver no longer provides it.
      const nativeConnection = (
        connection as {
          readonly conn?: { readonly destroy?: () => void; readonly release?: () => void };
        }
      ).conn;

      if (
        typeof nativeConnection?.destroy !== "function" ||
        typeof nativeConnection.release !== "function"
      )
        return yield* Effect.fail(unavailable());
      const destroy = nativeConnection.destroy.bind(nativeConnection);

      const defaults = yield* connection.executeUnprepared(
        "select @@session.transaction_isolation as isolation",
        [],
        undefined,
      );

      const isolation = String(defaults[0]?.isolation).replaceAll("-", " ").toUpperCase();

      if (
        !["READ UNCOMMITTED", "READ COMMITTED", "REPEATABLE READ", "SERIALIZABLE"].includes(
          isolation,
        )
      )
        return yield* Effect.fail(unavailable());

      const statement = (source: string) =>
        Effect.asVoid(connection.executeUnprepared(source, [], undefined));

      const transaction = makeWithTransaction({
        transactionService: client.transactionService,
        spanAttributes: [
          ["db.system", "mysql"],
          ["effect_auth.owner", "oauth"],
        ],
        acquireConnection: Effect.succeed([undefined, connection] as const),
        begin: () =>
          statement("SET TRANSACTION ISOLATION LEVEL READ COMMITTED").pipe(
            Effect.andThen(statement("BEGIN")),
          ),
        commit: () => statement("COMMIT"),
        rollback: () => statement("ROLLBACK"),
        savepoint: (_connection, id) => statement(`SAVEPOINT effect_auth_oauth_${id}`),
        releaseSavepoint: (_connection, id) =>
          statement(`RELEASE SAVEPOINT effect_auth_oauth_${id}`),
        rollbackSavepoint: (_connection, id) =>
          statement(`ROLLBACK TO SAVEPOINT effect_auth_oauth_${id}`),
      });

      class NativeTransaction extends EffectMysql2Transaction<any, any> {
        override transaction<A2, E2, R2>(nested: (tx: any) => Effect.Effect<A2, E2, R2>) {
          return transaction(
            Effect.suspend(() =>
              nested(
                new NativeTransaction(database.dialect, database._.session, database._.relations),
              ),
            ),
          );
        }
      }

      const native = new NativeTransaction(
        database.dialect,
        database._.session,
        database._.relations,
      );

      const cleanup = statement("ROLLBACK").pipe(
        Effect.andThen(statement(`SET TRANSACTION ISOLATION LEVEL ${isolation}`)),
        Effect.onExit((exit) => (exit._tag === "Failure" ? Effect.sync(destroy) : Effect.void)),
        Effect.orDie,
      );

      return yield* transaction(Effect.suspend(() => body(native))).pipe(
        // BEGIN/COMMIT acknowledgments can be lost after the server acted.
        // Roll back any surviving transaction before resetting one-shot mode.
        // Failed cleanup destroys the connection before its reserve is released;
        // the unknown owner result cannot release a prepared receipt.
        Effect.ensuring(cleanup),
      );
    }),
  );
