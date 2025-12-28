import { SqlClient, SqlResolver, SqlSchema } from '@effect/sql'
import { Atom, Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import { createFileRoute } from '@tanstack/react-router'
import { Arbitrary, Effect, FastCheck, Schema } from 'effect'
import { SqlLive } from '@/007/sql-live'

export const Route = createFileRoute('/008-effect-atom-sqlite')({
	component: App,
})

function App() {
	return (
		<div className="mx-auto max-w-2xl p-8">
			<h1 className="mb-4 font-bold text-2xl">Effect SQL SQLite-Wasm Demo</h1>

			<SqliteDemo />
		</div>
	)
}

const runtimeAtom = Atom.runtime(SqlLive)

const UserToAdd = Schema.Struct({
	name: Schema.String,
	email: Schema.String,
})
const UserToAddArbitrary = Arbitrary.make(UserToAdd)

const usersAtom = runtimeAtom
	.atom(
		Effect.gen(function* () {
			console.log('running query')
			const sql = yield* SqlClient.SqlClient
			const GetUsers = SqlSchema.findAll({
				Request: Schema.Void,
				Result: UserToAdd,
				execute: () => sql`SELECT name, email FROM users ORDER BY name`,
			})
			return yield* GetUsers()
		}),
	)
	.pipe(Atom.withReactivity(['users']))

const createUserAtom = runtimeAtom.fn(
	Effect.fn(function* (data: { name: string; email: string }) {
		const sql = yield* SqlClient.SqlClient

		const InsertUser = yield* SqlResolver.ordered('InsertUser', {
			Request: UserToAdd,
			Result: Schema.Null,
			execute: (requests) =>
				sql`
          INSERT INTO users
          ${sql.insert(requests)}
        `,
		})
		console.log('inserting,', data)
		yield* InsertUser.execute(data)
	}),
	{ reactivityKeys: ['users'] },
)

function SqliteDemo() {
	const users = useAtomValue(usersAtom)
	const createUser = useAtomSet(createUserAtom)
	// const refresh = useAtomRefresh(usersAtom)

	return (
		<div>
			<div className="rounded-lg bg-gray-100 p-4">
				<h2 className="mb-2 font-semibold">Users from SQLite:</h2>
				{Result.builder(users)
					.onInitial(() => <div>Loading...</div>)
					.onFailure((cause) => (
						<div className="text-red-500">Error: {cause.toString()}</div>
					))
					.onSuccess((users) => (
						<pre className="whitespace-pre-wrap">
							{JSON.stringify(users, null, 2)}
						</pre>
					))
					.render()}
				<button
					onClick={() => createUser(FastCheck.sample(UserToAddArbitrary, 1)[0])}
					type="button"
				>
					Create user
				</button>
			</div>
		</div>
	)
}
