// Testing if we can create a snapshot for revisions that doesn't include intermediary updates
// AKA: can we get the final `Origin: Central America` without capturing the typo `Central Amerika -> Central Ameri -> Central America`?
// We can use https://inspector.loro.dev/ to inspect the data

import { Schema } from 'effect'
import { LoroDoc } from 'loro-crdt'

const CommitMessage = Schema.Union(
	Schema.Struct({
		type: Schema.Literal('user'),
		user_id: Schema.String,
	}),
	Schema.Struct({
		type: Schema.Literal('system'),
		reason: Schema.String,
	}),
	Schema.Struct({
		type: Schema.Literal('ai'),
		model: Schema.String,
	}),
)

const initialDoc = new LoroDoc()
const initialOrigin = initialDoc.getText('origin')
initialOrigin.insert(0, 'Initial Origin')
const initialMetadata = initialDoc.getMap('metadata')
initialMetadata.set('gender', 'NEUTRAL')

Bun.write(
	'.data/005-initial-snapshot.loro',
	initialDoc.export({ mode: 'snapshot' }),
)
Bun.write(
	'.data/005-initial-shallow.loro',
	initialDoc.export({
		mode: 'shallow-snapshot',
		frontiers: initialDoc.frontiers(),
	}),
)

// Now create the revision
const revisionDoc = initialDoc.fork()
const revisionOrigin = revisionDoc.getText('origin')
revisionOrigin.delete(0, revisionOrigin.length)
// User mistake: typo
revisionOrigin.insert(0, 'Central Amerika')
// Reviews typo
revisionOrigin.delete('Central Ameri'.length, 2)
revisionOrigin.insert(revisionOrigin.length, 'ca')

// Then they accidentally paste a secret in the text field:
revisionOrigin.insert(revisionOrigin.length, ' my-super-secret')
// And they delete it some time after
revisionOrigin.delete(
	revisionOrigin.length - ' my-super-secret'.length,
	' my-super-secret'.length,
)

const revisionMetadata = revisionDoc.getMap('metadata')
// User mistake: misclick
revisionMetadata.set('gender', 'MALE')
// Reviews chosen value
revisionMetadata.set('gender', 'FEMALE')

// The user is done, let's commit it
revisionDoc.commit({
	message: Schema.encodeSync(Schema.parseJson(CommitMessage))({
		type: 'user',
		user_id: 'user-123',
	}),
	origin: 'testing-commit-origin',
})

console.log('Revision string: ', revisionOrigin.toString())
console.log('Revision gender: ', revisionMetadata.get('gender'))
Bun.write(
	'.data/005-revision-snapshot.loro',
	revisionDoc.export({ mode: 'snapshot' }),
)
Bun.write(
	'.data/005-revision-updates.loro',
	revisionDoc.export({
		mode: 'update',
		from: initialDoc.version(),
	}),
)
Bun.write(
	'.data/005-revision-shallow-from-initial-frontier.loro',
	revisionDoc.export({
		mode: 'shallow-snapshot',
		frontiers: initialDoc.frontiers(),
	}),
)
Bun.write(
	'.data/005-revision-shallow-from-final-frontier.loro',
	revisionDoc.export({
		mode: 'shallow-snapshot',
		frontiers: revisionDoc.frontiers(),
	}),
)
// 💎 This is the way forward, diff doesn't include intermediary steps (except in rich text, need to figure it out)
Bun.write(
	'.data/005-revision-diff.json',
	JSON.stringify(
		revisionDoc.diff(initialDoc.frontiers(), revisionDoc.frontiers(), true),
		null,
		2,
	),
)

const revisionLastUpdateDate = Date.now()

// EXPERIMENT: commit after applying the diff (in the server side)
const finalDoc = initialDoc.fork()
finalDoc.applyDiff(
	revisionDoc.diff(finalDoc.frontiers(), revisionDoc.frontiers()),
)
finalDoc.commit({
	message: Schema.encodeSync(Schema.parseJson(CommitMessage))({
		type: 'user',
		user_id: 'user-123',
	}),
	timestamp: revisionLastUpdateDate,
})
const changesWithCommits = Array.from(finalDoc.getAllChanges().values())
	.flat()
	.flatMap((x) =>
		x.message
			? {
					...x,
					commitMessage: Schema.decodeSync(Schema.parseJson(CommitMessage))(
						x.message,
					),
				}
			: [],
	)
Bun.write(
	'.data/005-final-snapshot.loro',
	finalDoc.export({ mode: 'snapshot' }),
)

console.log('Merged string: ', finalDoc.getText('origin').toString())
console.log('Merged gender: ', finalDoc.getMap('metadata').get('gender'))
console.log('Changes with commits', changesWithCommits)
