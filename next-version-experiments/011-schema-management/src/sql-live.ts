import { BunContext } from '@effect/platform-bun'
import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-bun'
import { Config, Layer } from 'effect'
import { migrations } from './db/migrations-effect'

const SqlClientLivePersisted = SqliteClient.layerConfig({
	filename: Config.string('DB_FILE_NAME'),
})
// const SqlClientLive = SqlClientLivePersisted

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

export const BunSqlEnvLive = Layer.mergeAll(SqlClientLive, MigratorLive).pipe(
	Layer.provide(BunContext.layer),
)
