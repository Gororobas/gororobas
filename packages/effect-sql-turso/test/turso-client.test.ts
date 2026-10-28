import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Predicate, Schema, String as EffectString, Tracer } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { SqlClient } from "effect/sql"

import { TursoClient, TursoMigrator } from "../src/index.js"

const client = TursoClient.layer({
  filename: ":memory:",
  transformQueryNames: EffectString.camelToSnake,
  transformResultNames: EffectString.snakeToCamel,
  spanAttributes: { "test.adapter": "turso" },
})

it.live("migrations, transforms, values, raw results and safe integers", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const loader = TursoMigrator.fromRecord({
      "1_items": Effect.asVoid(sql`CREATE TABLE items (item_name TEXT UNIQUE, big_value INTEGER)`),
    })
    expect(yield* TursoMigrator.run({ loader })).toEqual([[1, "items"]])
    expect(yield* TursoMigrator.run({ loader })).toEqual([])
    yield* sql`INSERT INTO items ${sql.insert({ itemName: "🌱", bigValue: 9007199254740993n })}`
    expect(
      yield* sql`SELECT * FROM items`.pipe(Effect.provideService(SqlClient.SafeIntegers, true)),
    ).toEqual([{ itemName: "🌱", bigValue: 9007199254740993n }])

    expect(
      yield* sql`SELECT * FROM items`.values.pipe(
        Effect.provideService(SqlClient.SafeIntegers, true),
      ),
    ).toEqual([["🌱", 9007199254740993n]])

    expect(yield* sql`UPDATE items SET big_value = 1`.raw).toMatchObject({ changes: 1 })
    expect(yield* sql`SELECT * FROM items`.withoutTransform).toEqual([
      { item_name: "🌱", big_value: 1 },
    ])
    expect((yield* Effect.flip(sql`INSERT INTO items (item_name) VALUES (${"🌱"})`))._tag).toBe(
      "SqlError",
    )
  }).pipe(Effect.provide(client)),
)

it.live("nested rollback and concurrent transactions keep their boundaries", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE TABLE items (value INTEGER)`

    yield* Effect.forEach(
      [1, 2, 3, 4],
      (value) =>
        Effect.gen(function* () {
          yield* sql`INSERT INTO items VALUES (${value})`
          yield* Effect.gen(function* () {
            yield* sql`INSERT INTO items VALUES (99)`
            yield* Effect.fail("rollback")
          }).pipe(sql.withTransaction, Effect.ignore)
        }).pipe(sql.withTransaction),
      { concurrency: "unbounded" },
    )

    expect(yield* sql`SELECT value FROM items ORDER BY value`.values).toEqual([[1], [2], [3], [4]])
    yield* Effect.gen(function* () {
      yield* sql`INSERT INTO items VALUES (100)`
      yield* Effect.fail("rollback")
    }).pipe(sql.withTransaction, Effect.ignore)
    expect(yield* sql`SELECT count(*) AS count FROM items`).toEqual([{ count: 4 }])
  }).pipe(Effect.provide(client)),
)

it.live("SQL spans retain configured attributes and parentage", () =>
  Effect.gen(function* () {
    const spans: Array<Tracer.Span> = []

    const tracer = Tracer.make({
      context: Tracer.nativeTracer.context,
      span(options) {
        const span = Tracer.nativeTracer.span(options)
        spans.push(span)
        return span
      },
    })

    yield* SqlClient.SqlClient.use((sql) => sql`SELECT 1`).pipe(
      Effect.withSpan("request"),
      Effect.provideService(Tracer.Tracer, tracer),
      Effect.provide(client),
    )

    const query = spans.find((span) => span.attributes.get("test.adapter") === "turso")
    expect(query).toBeDefined()
    expect(query?.attributes.get("db.system.name")).toBe("sqlite")
    expect(query?.status._tag).toBe("Ended")
    expect(query?.parent).toMatchObject({ _tag: "Some", value: { name: "request" } })
  }),
)

const Binding = Schema.Struct({
  itemName: Schema.String.check(
    Schema.makeFilter((value) => !/[\uD800-\uDFFF]/u.test(value), {
      identifier: "WellFormedUnicode",
      title: "Well-formed Unicode",
      description: "SQL TEXT stores Unicode scalar values, excluding lone UTF-16 surrogates",
    }),
  ),
  bigValue: Schema.BigInt.check(
    Schema.isBetweenBigInt({ minimum: -9223372036854775808n, maximum: 9223372036854775807n }),
  ),
  bytes: Schema.Uint8Array,
})

it.live("bindings round-trip Unicode, signed 64-bit integers and blobs", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE TABLE items (item_name TEXT, big_value INTEGER, bytes BLOB)`

    const result = yield* Arbitrary.checkEffect(
      Arbitrary.schema(Binding),
      (binding) =>
        Effect.gen(function* () {
          yield* sql`DELETE FROM items`
          yield* sql`INSERT INTO items ${sql.insert(binding)}`
          const rows = yield* sql`SELECT * FROM items`.pipe(
            Effect.provideService(SqlClient.SafeIntegers, true),
          )
          const row = rows[0]
          return Schema.is(Binding)(row) && Schema.toEquivalence(Binding)(binding, row)
        }),
      { runs: 50 },
    )

    if (!Predicate.isTagged(result, "Passed")) {
      return yield* Effect.die(Arbitrary.formatCheckFailure(result))
    }
  }).pipe(Effect.provide(client)),
)

it.live("interruption rolls back and releases the connection", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const inserted = yield* Deferred.make<void>()
    yield* sql`CREATE TABLE items (value INTEGER)`

    const transaction = yield* Effect.gen(function* () {
      yield* sql`INSERT INTO items VALUES (1)`
      yield* Deferred.succeed(inserted, undefined)
      yield* Effect.never
    }).pipe(sql.withTransaction, Effect.forkChild)

    yield* Deferred.await(inserted)
    yield* Fiber.interrupt(transaction)
    yield* sql`INSERT INTO items VALUES (2)`
    expect(yield* sql`SELECT value FROM items`.values).toEqual([[2]])
  }).pipe(Effect.provide(client)),
)
