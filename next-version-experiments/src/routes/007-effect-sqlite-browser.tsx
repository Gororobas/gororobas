import { SqlClient } from '@effect/sql'
import { createFileRoute } from '@tanstack/react-router'
import * as Effect from 'effect/Effect'
import * as React from 'react'
import { SqlLive } from '@/007/sql-live'

export const Route = createFileRoute('/007-effect-sqlite-browser')({
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

function SqliteDemo() {
	const [result, setResult] = React.useState<string>('Loading...')
	const [error, setError] = React.useState<string | null>(null)

	React.useEffect(() => {
		// Run the SQLite effect
		const program = Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient

			yield* sql`
        INSERT OR REPLACE INTO users (id, name, email)
        VALUES (1, 'Alice', 'alice@example.com'),
               (2, 'Bob', 'bob@example.com')
      `

			// Query the data
			const users = yield* sql<{ name: string; email: string }>`
        SELECT name, email FROM users ORDER BY name
      `

			return users.map((u) => `${u.name} (${u.email})`).join('\n')
		})

		// Execute with SQLite layer
		Effect.runPromise(Effect.provide(program, SqlLive))
			.then(setResult)
			.catch((err) => setError(err.toString()))
	}, [])

	if (error) {
		return <div className="text-red-500">Error: {error}</div>
	}

	return (
		<div>
			<div className="rounded-lg bg-gray-100 p-4">
				<h2 className="mb-2 font-semibold">Users from SQLite:</h2>
				<pre className="whitespace-pre-wrap">{result}</pre>
			</div>
		</div>
	)
}
