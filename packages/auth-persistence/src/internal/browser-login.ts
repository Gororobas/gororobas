import { Persistence, Record, Unavailable } from "@yielded/auth/BrowserLogin";
import { Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";

import { requireStandalone } from "./standalone";

const codec = Schema.fromJsonString(Record);
const Row = Schema.Struct({ payload: Schema.String, version: Schema.String });

/** SQLite/D1 and PostgreSQL; apply through application migrations. Terminal
 * attempts are retained until expiry. Contains private provenance, never bearers.
 */
const migration = `CREATE TABLE yielded_browser_login (
  namespace TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  version TEXT NOT NULL,
  expires_at_millis BIGINT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (namespace, attempt_id)
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

    const clock = sql.onDialectOrElse({
      sqlite: () => sql.literal("CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)"),
      orElse: () => sql.literal("CAST(EXTRACT(EPOCH FROM clock_timestamp()) * 1000 AS BIGINT)"),
    });

    return Persistence.of({
      get: Effect.fnUntraced(function* (namespace, id) {
        yield* standalone;

        const rows =
          yield* sql`SELECT payload, version FROM yielded_browser_login WHERE namespace = ${namespace} AND attempt_id = ${id}`;

        if (rows.length === 0) return undefined;
        if (rows.length !== 1) return yield* Unavailable.make({});
        const row = yield* Schema.decodeUnknownEffect(Row)(rows[0]);
        const record = yield* Schema.decodeEffect(codec)(row.payload);

        if (record.version !== row.version) return yield* Unavailable.make({});

        return record;
      }, failure),
      insert: Effect.fnUntraced(function* (namespace, id, record) {
        yield* standalone;
        const payload = yield* Schema.encodeEffect(codec)(record);

        const rows =
          yield* sql`INSERT INTO yielded_browser_login (namespace, attempt_id, version, expires_at_millis, payload)
        SELECT ${namespace}, ${id}, ${record.version}, ${record.expiresAtMillis}, ${payload}
        WHERE ${record.expiresAtMillis} > ${clock}
        ON CONFLICT (namespace, attempt_id) DO NOTHING RETURNING version`;

        return rows.length === 1;
      }, failure),
      compareAndSet: Effect.fnUntraced(function* (namespace, id, version, record) {
        yield* standalone;
        if (version === record.version) return yield* Unavailable.make({});
        const payload = yield* Schema.encodeEffect(codec)(record);

        const rows =
          yield* sql`UPDATE yielded_browser_login SET version = ${record.version}, payload = ${payload}
        WHERE namespace = ${namespace} AND attempt_id = ${id} AND version = ${version}
        AND expires_at_millis = ${record.expiresAtMillis} AND expires_at_millis > ${clock}
        RETURNING version`;

        return rows.length === 1;
      }, failure),
    });
  }),
);

export const BrowserLoginPersistence = { migration, layer };
