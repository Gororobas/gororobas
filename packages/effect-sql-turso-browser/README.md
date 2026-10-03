# Effect SQL Turso Browser

Effect 4 SQL adapter for `@tursodatabase/database-wasm`. Exports `TursoClient`, `TursoBrowserDatabase`, and
`TursoMigrator`, also available through their kebab-case package subpaths.

```ts
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { TursoClient } from "@gororobas/effect-sql-turso-browser"

const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`CREATE TABLE IF NOT EXISTS items (item_name TEXT)`
  yield* sql`INSERT INTO items (item_name) VALUES (${"Tomato"})`
  return yield* sql`SELECT item_name FROM items`
}).pipe(Effect.provide(TursoClient.layer({ url: "garden.db" })))
```

`url` is an OPFS database path, not a remote Turso endpoint. `:memory:` creates
an isolated database for each client. The SDK is loaded lazily through its
`/vite` entry point. Use a browser with Web Locks, BroadcastChannel, Web Crypto,
and the browser storage capabilities required by the Turso WASM SDK. Serve the
app with `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`, as in the vendored SDK browser test
configuration.

`make` requires Scope and Reactivity; `layer` and `layerConfig` provide both SQL
service tags and local Reactivity. Managed connections close with their scope.
With `{ liveClient }`, the supplied `BrowserDatabase` remains caller-owned.
`client.sdk` exposes that handle. Name transforms, safe integers, raw results,
value arrays, transactions, savepoints, and Effect SQL migrations are supported.
Streaming queries are unsupported.

Tabs opening the same path share one leader connection. Use the same connection
options in every tab; the leader's options govern the shared database. Queries
from other tabs wait while a transaction is active. Closing the leader normally
hands ownership to a waiting tab. Requests already sent to a departing leader
fail rather than being replayed, since replaying writes could duplicate them.

Coordination retains a prototype limitation: a follower disappearing during its
transaction can leave the leader waiting for that follower. Abrupt leader loss
can also leave an in-flight request pending until a new leader is announced.
Before relying on this for unattended multi-tab use, add owner-liveness tracking
and rollback/rejection on owner loss. Cross-tab reactivity invalidation remains
an application concern; the original app's bridge was specific to its todos.

Tests exercise the wrapper against Node SQLite and cross-tab coordination with
browser API doubles. They do not validate the WASM engine or OPFS in a real
browser.
