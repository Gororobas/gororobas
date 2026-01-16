/**
 * Basic Turso works, but I can't enable flags to use --experimental-views.
 * Would need to wait on stable and overall I'm not willing to risk instability.
 * Let's start with SQLite, eventually we may migrate to Turso once it's stable (late 2026?) for the supposed benefits:
 *
 * - Encryption at rest (making the server state slightly safer)
 * - Incremental Computation and CDC (hopefully allowing us to query faster and build real-time workflows)
 * - Better full text search with tantivy
 * - Vector search if we ever do embeddings and natural language search
 * - Concurrent writes with async I/O and MVCC
 */

import { createFileRoute } from '@tanstack/react-router'
import { connect } from '@tursodatabase/database-wasm/vite'

export const Route = createFileRoute('/009-turso-browser')({
	component: RouteComponent,
})

async function testRunning() {
	// Create or open a database file
	const db = await connect('my-database.db')

	// Create a table
	await db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

	// Insert a post
	const insertPost = db.prepare(
		'INSERT INTO posts (title, content) VALUES (?, ?)',
	)
	const result = await insertPost.run(
		'Hello World',
		'This is my first blog post!',
	)

	console.log(`Inserted post with ID: ${result.lastInsertRowid}`)

	const selectPosts = db.prepare('select * from posts')
	console.log('Posts:', await selectPosts.all())

	await db.exec(`
	CREATE MATERIALIZED VIEW IF NOT EXISTS live_posts AS
	SELECT
    *
  FROM posts;
`)

	const selectLivePosts = db.prepare('select * from live_posts')
	console.log('Live posts:', await selectLivePosts.all())
}

function RouteComponent() {
	return (
		<div>
			Hello "/009-turso-browser"!
			<button
				className="block cursor-pointer bg-amber-200 p-3"
				type="button"
				onClick={testRunning}
			>
				Test running
			</button>
		</div>
	)
}
