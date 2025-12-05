import { LoroDoc } from 'loro-crdt'

const initialDoc = new LoroDoc()

// Setting initialDoc = { origin: "Initial Origin", metadata: { gender: "NEUTRAL" }}
const initialOrigin = initialDoc.getText('origin')
initialOrigin.insert(0, 'Initial Origin')
const initialMetadata = initialDoc.getMap('metadata')
initialMetadata.set('gender', 'NEUTRAL') // Gender is a "POJO"

// Now create the revision
const revisionDoc = initialDoc.fork()

// Modify the origin to "Central America", but with an intermediary typo
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

// Modify the metadata.gender, also with an intermediary mistake
const revisionMetadata = revisionDoc.getMap('metadata')
// User mistake: misclick
revisionMetadata.set('gender', 'MALE')
// Reviews chosen value
revisionMetadata.set('gender', 'FEMALE')

// Final data: Origin: Central America; Gender: FEMALE
console.log('Revision string: ', revisionOrigin.toString())
console.log('Revision gender: ', revisionMetadata.get('gender'))

// The snapshot includes the intermediary "MALE" gender
Bun.write(
	'.data/005-revision-snapshot.loro',
	revisionDoc.export({ mode: 'snapshot' }),
)

// But the diff doesnt 🎉
Bun.write(
	'.data/005-revision-diff.json',
	JSON.stringify(
		revisionDoc.diff(initialDoc.frontiers(), revisionDoc.frontiers()),
		null,
		2,
	),
)
