# Native Turso Effect SQL client

`@gororobas/effect-sql-turso` connects Effect v4 SQL to the in-process Rust engine in `@tursodatabase/database` (pinned to 0.8.3). It is separate from the browser WASM adapter.

```ts
import { TursoClient, TursoMigrator } from "@gororobas/effect-sql-turso"
import { Effect, String as EffectString } from "effect"
import { SqlClient } from "effect/sql"

const database = TursoClient.layer({
  filename: ":memory:", // Or a local filesystem path, rather than a remote URL.
  transformQueryNames: EffectString.camelToSnake,
  transformResultNames: EffectString.snakeToCamel,
  spanAttributes: { "db.system": "sqlite" },
})

const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* TursoMigrator.run({
    loader: TursoMigrator.fromRecord({
      "1_items": Effect.asVoid(sql`CREATE TABLE items (item_name TEXT)`),
    }),
  })
  yield* sql`INSERT INTO items ${sql.insert({ itemName: "Tomato" })}`
  return yield* sql`SELECT * FROM items`
}).pipe(Effect.provide(database))
```

The layer provides both `TursoClient.TursoClient` and the generic `SqlClient`. `make` is scoped and requires Effect's `Reactivity` service; `layer` and `layerConfig` supply it automatically. Driver options such as `readonly`, `timeout`, and `experimental` pass through to Turso.

Supported: SQL schema decoders and statement helpers, name transforms, untransformed results, values, raw write metadata, safe integers, blobs, query spans, reserved connections, serialized access, transactions, nested savepoints, rollback on interruption, reactive queries, and Effect's shared migration loaders. Statements are closed after every execution. Shutdown checkpoints writable file databases before closing them so that the importer can safely copy their main files.

Streaming is unsupported, matching the server's previous Node SQLite adapter. Queries are prepared per execution; there is currently no prepared-statement cache. Turso's native `GenericFailure` errors may classify as `UnknownError`; the original cause remains attached to the typed `SqlError`. `sdk` exposes the native connection for diagnostics; direct SDK calls bypass Effect's connection semaphore.

The server uses this package for application and cluster SQL. Compared with the previous Node SQLite adapter, opening a connection and running each transaction cost more, while single statements run faster: the server's test suite takes the same wall-clock time, with about a fifth more CPU time across test files.

Inspired by [Effect PR #6522](https://github.com/Effect-TS/effect/pull/6522), adapted to the Effect v4 APIs in this repository, especially `makeSqliteAcquirers` and savepoint release.
