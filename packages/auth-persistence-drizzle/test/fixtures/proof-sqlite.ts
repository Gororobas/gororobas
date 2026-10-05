import { D1Client } from "@effect/sql-d1/D1Client";
import type { D1Client as D1ClientService } from "@effect/sql-d1/D1Client";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { Auth, Email, Password, PhoneOtp, Sessions } from "@yielded/auth";
import { makeStorageMappings } from "@yielded/auth-persistence/Adapter";
import { SubjectId } from "@yielded/auth/Schema";
import { getTableColumns, is, sql } from "drizzle-orm";
import * as DrizzleD1 from "drizzle-orm/effect-d1";
import {
  getTableConfig,
  integer,
  SQLiteColumn,
  sqliteTable,
  text,
  type SQLiteTable,
} from "drizzle-orm/sqlite-core";
import { Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";
import type { SqlError } from "effect/sql/SqlError";
import type { Statement } from "effect/sql/Statement";

import { Database as D1Database } from "../../src/drizzle/d1-database";
import type { D1ProofPersistenceMapping } from "../../src/drizzle/proof-model";
import { AuthPersistence } from "../../src/SqliteNode";

const app = Auth.make("test/proof-d1", {
  claims: Schema.Struct({}),
  strategies: {
    phone: PhoneOtp.make(),
    password: Password.make(),
    email: Email.makeAddresses({
      addresses: { maximumEvidenceAgeMillis: 300_000, requireImmediateInvalidation: true },
    }),
  },
  sessions: Sessions.stateful(),
});

export const subjects = sqliteTable("subjects", {
  id: text().primaryKey(),
  active: integer({ mode: "boolean" }).notNull(),
  revision: text().notNull(),
});

export const persistence = AuthPersistence.make(app);

export const storage = persistence.managed({
  prefix: "proof_test",
  subjects: {
    table: subjects,
    id: "id",
    status: "active",
    activeValue: true,
    securityRevision: "revision",
    idCodec: SubjectId,
    requirements: () =>
      Effect.succeed({
        alternatives: [
          {
            factors: ["possession"],
            minimumCredentials: 1,
            userVerified: false,
            phishingResistant: false,
          },
        ],
        maximumAgeMillis: 60_000,
      }),
  },
});

// Use production codecs and table mapping, rather than a test proof-store implementation.
export const proofMapping = makeStorageMappings(storage).proofs();
const identifiers = getTableColumns(storage.schema.identifiers);
const clock = sql`(select now from proof_clock)`;

export const d1Mapping = {
  ...proofMapping,
  d1: {
    engineNow: clock,
    engineNowMillis: clock,
    engineInstantMinus: (millis: number) => sql`${clock} - ${millis}`,
    engineInstantPlus: (millis: number) => sql`${clock} + ${millis}`,
  },
  authority: {
    ...proofMapping.authority,
    identifier: {
      ...proofMapping.authority.identifier,
      d1CurrentCondition: ({
        binding,
      }: Parameters<typeof proofMapping.authority.identifier.isCurrent>[0]) =>
        binding._tag === "Identifier"
          ? sql`not exists(select 1 from ${storage.schema.identifiers}
              where ${identifiers.namespace} = ${binding.identifier.namespace}
                and ${identifiers.value} = ${binding.identifier.value})`
          : sql`0 = 1`,
    },
  },
  // The shared factory erases foreign table shapes; these are the actual Drizzle
  // tables supplied above. This adapter cast crosses no value/schema boundary.
} as unknown as D1ProofPersistenceMapping<
  SQLiteTable,
  SQLiteTable,
  SQLiteTable,
  SQLiteTable,
  SQLiteTable,
  SQLiteTable,
  SQLiteTable,
  SQLiteTable,
  SQLiteTable,
  SQLiteTable,
  SQLiteTable,
  string
>;

const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';

export const database = Layer.effectDiscard(
  Effect.gen(function* () {
    const client = yield* SqlClient.SqlClient;

    for (const table of [subjects, ...Object.values(storage.schema)]) {
      const config = getTableConfig(table);

      const columns = config.columns.map(
        (column) =>
          `${quote(column.name)} ${column.getSQLType()}${column.notNull ? " not null" : ""}${column.primary ? " primary key" : ""}`,
      );

      const indexes = config.indexes.map((index) => {
        const names = index.config.columns.map((column) => {
          if (!is(column, SQLiteColumn)) throw new Error("Fixture requires plain-column indexes");

          return quote(column.name);
        });

        return `unique (${names.join(", ")})`;
      });

      yield* client.unsafe(
        `create table ${quote(config.name)} (${[...columns, ...indexes].join(", ")})`,
      );
    }
    yield* client`create table proof_clock (now integer not null)`;
    yield* client`insert into proof_clock values (0)`;
  }),
).pipe(Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" })));

/** Only the SQL transport differs: production D1 planning and generated batch SQL
 * run unchanged, in a real atomic SQLite transaction. The callback introduces a
 * competing committed writer immediately before that transaction begins. */
export const d1Database = (
  beforeBatch: Effect.Effect<void, SqlError, SqlClient.SqlClient> = Effect.void,
) =>
  Layer.effect(
    D1Database,
    Effect.gen(function* () {
      const client = yield* SqlClient.SqlClient;

      const batch = (statements: ReadonlyArray<Statement<unknown>>) =>
        beforeBatch.pipe(
          Effect.andThen(
            client.withTransaction(
              Effect.forEach(statements, (statement) => statement, { concurrency: 1 }),
            ),
          ),
          Effect.provideService(SqlClient.SqlClient, client),
        );

      // Keep the client callable for catalog validation as well as generated batches.
      // Native Workers binding/config are absent; every query uses real SQLite.
      const transport = Object.assign(client, { batch }) as unknown as D1ClientService;

      return yield* DrizzleD1.makeWithDefaults({}).pipe(Effect.provideService(D1Client, transport));
    }),
  ).pipe(Layer.provideMerge(database));
