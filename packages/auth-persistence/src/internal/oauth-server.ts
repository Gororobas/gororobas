import { Persistence, Record, Unavailable } from "@yielded/auth/OAuthServer";
import { Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";

import { requireStandalone } from "./standalone";

const codec = Schema.fromJsonString(Record);

const Row = Schema.Struct({
  payload: Schema.String,
  version: Schema.String,
  revoked: Schema.Literals([0, 1]),
});

/** SQLite (including D1) and PostgreSQL. Apply once through application migrations.
 * Expired records may be deleted when expires_at_millis <= the current time.
 * Revocation has its own monotonic column so it cannot lose a race with rotation.
 */
const migration = `CREATE TABLE yielded_oauth_server (
  namespace TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  version TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  expires_at_millis BIGINT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (namespace, grant_id)
)`;

const layer = Layer.effect(
  Persistence,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    if (!sql.onDialectOrElse({ sqlite: () => true, pg: () => true, orElse: () => false }))
      return yield* Unavailable.make({});
    const standalone = requireStandalone(() => Unavailable.make({}), sql.transactionService);

    const failure = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(Effect.mapError(() => Unavailable.make({})));

    return Persistence.of({
      get: Effect.fn("OAuthServerPersistence.get")(function* (namespace, id) {
        yield* standalone;

        const rows =
          yield* sql`SELECT payload, version, revoked FROM yielded_oauth_server WHERE namespace = ${namespace} AND grant_id = ${id}`;

        if (rows.length === 0) return undefined;
        if (rows.length !== 1) return yield* Unavailable.make({});
        const row = yield* Schema.decodeUnknownEffect(Row)(rows[0]);
        const record = yield* Schema.decodeEffect(codec)(row.payload);

        if (record.version !== row.version) return yield* Unavailable.make({});

        return row.revoked === 1 ? { ...record, status: "Revoked" as const } : record;
      }, failure),
      insert: Effect.fn("OAuthServerPersistence.insert")(function* (namespace, id, record) {
        yield* standalone;
        const payload = yield* Schema.encodeEffect(codec)(record);

        const rows =
          yield* sql`INSERT INTO yielded_oauth_server (namespace, grant_id, version, revoked, expires_at_millis, payload) VALUES (${namespace}, ${id}, ${record.version}, ${record.status === "Revoked" ? 1 : 0}, ${record.expiresAtMillis}, ${payload}) ON CONFLICT (namespace, grant_id) DO NOTHING RETURNING version`;

        return rows.length === 1;
      }, failure),
      compareAndSet: Effect.fn("OAuthServerPersistence.compareAndSet")(function* (
        namespace,
        id,
        version,
        record,
      ) {
        yield* standalone;
        if (version === record.version) return yield* Unavailable.make({});
        const payload = yield* Schema.encodeEffect(codec)(record);

        const rows =
          yield* sql`UPDATE yielded_oauth_server SET version = ${record.version}, revoked = ${record.status === "Revoked" ? 1 : 0}, expires_at_millis = ${record.expiresAtMillis}, payload = ${payload} WHERE namespace = ${namespace} AND grant_id = ${id} AND version = ${version} AND revoked = 0 RETURNING version`;

        return rows.length === 1;
      }, failure),
      revoke: Effect.fn("OAuthServerPersistence.revoke")(function* (namespace, id) {
        yield* standalone;
        yield* sql`UPDATE yielded_oauth_server SET revoked = 1 WHERE namespace = ${namespace} AND grant_id = ${id}`;
      }, failure),
    });
  }),
);

export const OAuthServerPersistence = { migration, layer };
