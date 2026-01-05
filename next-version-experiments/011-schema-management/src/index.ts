import { BunRuntime } from '@effect/platform-bun'
import { SqlClient } from '@effect/sql'
import { Effect, pipe } from 'effect'
import { BunSqlEnvLive } from './sql-live'

const program = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient

	yield* Effect.logInfo(
		yield* sql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;`,
	)
})

pipe(program, Effect.provide(BunSqlEnvLive), BunRuntime.runMain)
