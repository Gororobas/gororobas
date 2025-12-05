// Testing if we can create a snapshot for revisions that doesn't include intermediary updates
// AKA: can we get the final `Origin: Central America` without capturing the typo `Central Amerika -> Central Ameri -> Central America`?
// We can use https://inspector.loro.dev/ to inspect the data
import { LoroDoc } from 'loro-crdt'

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
// Let's pretend there was enough time for a commit to happen
revisionDoc.commit()
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

// .commit() doesn't seem to do anything special
// revisionDoc.commit()

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
		revisionDoc.diff(initialDoc.frontiers(), revisionDoc.frontiers()),
		null,
		2,
	),
)

initialDoc.applyDiff(
	revisionDoc.diff(initialDoc.frontiers(), revisionDoc.frontiers()),
)

console.log('Merged string: ', initialDoc.getText('origin').toString())
console.log('Merged gender: ', initialDoc.getMap('metadata').get('gender'))
