import { Effect } from "effect"
import * as SqlClient from "effect/sql/SqlClient"
// oxlint-disable-next-line custom-lint-rules/no-node-apis -- Use an independent SQLite reference driver to test the Effect SQL adapter.
import { DatabaseSync, type SQLInputValue } from "node:sqlite"
import { expect, test } from "vitest"

import type { BrowserDatabase } from "../src/turso-browser-database.js"
import * as TursoClient from "../src/turso-client.js"

const parameter = (value: unknown): SQLInputValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    value instanceof Uint8Array
  ) {
    return value
  }

  throw new Error("Invalid SQL parameter")
}

// Exercise Effect's SQL protocol against SQLite without requiring browser OPFS in Node.
const withDatabase = (body: Effect.Effect<void, unknown, SqlClient.SqlClient>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const database = yield* Effect.acquireRelease(
        Effect.sync(() => new DatabaseSync(":memory:")),
        (database) => Effect.sync(() => database.close()),
      )

      const browserDatabase: BrowserDatabase = {
        execute: ({ sql, params: parameters, raw, safeIntegers, values }) =>
          Effect.try({
            try: () => {
              const statement = database.prepare(sql)
              statement.setReadBigInts(safeIntegers)
              const bindings = parameters.map(parameter)
              if (statement.columns().length > 0) {
                const rows = statement.all(...bindings)
                return values ? rows.map(Object.values) : rows
              }
              const result = statement.run(...bindings)
              return raw ? result : []
            },
            catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
          }),
        close: () => Effect.die("Caller-owned connection must not be closed"),
      }

      yield* body.pipe(
        Effect.provide(
          TursoClient.layer({
            liveClient: browserDatabase,
            transformQueryNames: (name) =>
              name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
            transformResultNames: (name) =>
              name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
          }),
        ),
      )
    }),
  )

test("transforms names, preserves raw results, values and safe integers", async () => {
  await Effect.runPromise(
    withDatabase(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`CREATE TABLE items (item_name TEXT, big_value INTEGER)`
        const result =
          yield* sql`INSERT INTO items (item_name, big_value) VALUES (${"🍅"}, ${9007199254740993n})`
            .raw
        expect(result).toMatchObject({ changes: 1 })
        yield* sql`INSERT INTO items ${sql.insert({ itemName: "🌱", bigValue: 1 })}`
        const rows = yield* sql`SELECT item_name, big_value FROM items WHERE big_value > 1`.pipe(
          Effect.provideService(SqlClient.SafeIntegers, true),
        )
        expect(rows).toEqual([{ itemName: "🍅", bigValue: 9007199254740993n }])
        expect(yield* sql`SELECT item_name FROM items`.values).toEqual([["🍅"], ["🌱"]])
      }),
    ),
  )
})

test("nested rollback preserves the outer transaction and failed commits are cleaned up", async () => {
  await Effect.runPromise(
    withDatabase(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`PRAGMA foreign_keys = ON`
        yield* sql`CREATE TABLE parents (id INTEGER PRIMARY KEY)`
        yield* sql`CREATE TABLE children (id INTEGER REFERENCES parents(id) DEFERRABLE INITIALLY DEFERRED)`

        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`INSERT INTO parents VALUES (1)`

            yield* sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* sql`INSERT INTO parents VALUES (2)`
                  return yield* Effect.fail("abort nested transaction")
                }),
              )
              .pipe(Effect.catch(() => Effect.void))

            yield* sql`INSERT INTO parents VALUES (3)`
          }),
        )

        expect(yield* sql`SELECT id FROM parents ORDER BY id`).toEqual([{ id: 1 }, { id: 3 }])
        const failed = yield* sql
          .withTransaction(sql`INSERT INTO children VALUES (999)`)
          .pipe(Effect.exit)
        expect(failed._tag).toBe("Failure")
        expect(yield* sql`SELECT id FROM children`).toEqual([])
        yield* sql.withTransaction(sql`INSERT INTO children VALUES (1)`)
      }),
    ),
  )
})
