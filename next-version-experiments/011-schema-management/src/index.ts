import { BunContext, BunRuntime } from '@effect/platform-bun'
import { SqlClient } from '@effect/sql'
import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-bun'
import { Config, Effect, Layer, pipe } from 'effect'
import { migrations } from './db/migrations-effect'

const SqlClientLivePersisted = SqliteClient.layerConfig({
	filename: Config.string('DB_FILE_NAME'),
})
const SqlClientLiveMemory = SqliteClient.layer({
	filename: ':memory:',
})
const SqlClientLive = SqlClientLiveMemory

const MigratorLive = Layer.provide(
	SqliteMigrator.layer({
		loader: SqliteMigrator.fromRecord(migrations),
	}),
	SqlClientLive,
)

const EnvLive = Layer.mergeAll(SqlClientLive, MigratorLive).pipe(
	Layer.provide(BunContext.layer),
)

const program = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient

	yield* Effect.logInfo(
		yield* sql`SELECT * FROM sqlite_master WHERE type='table' ORDER BY name;`,
	)
})

pipe(program, Effect.provide(EnvLive), BunRuntime.runMain)
