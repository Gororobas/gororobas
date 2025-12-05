import { Database } from 'bun:sqlite'
import { seed } from '@ngneat/falso'
import { LoroDoc } from 'loro-crdt'

// Seed for reproducible randomness
seed('loro-sqlite-workflow')

// Initialize in-memory SQLite database
const db = new Database(':memory:')

// Create tables for collaborative editing workflow
db.run(`
  CREATE TABLE DOCUMENT (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    loro_crdt BLOB NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`)

db.run(`
  CREATE TABLE REVISION (
    id INTEGER PRIMARY KEY,
    document_id TEXT NOT NULL,
    loro_crdt BLOB NOT NULL,
    author_peer_id INTEGER NOT NULL,
    author_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    description TEXT,
    base_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES DOCUMENT(id)
  )
`)

db.run(`
  CREATE TABLE APPROVAL (
    id INTEGER PRIMARY KEY,
    revision_id INTEGER NOT NULL,
    approver_peer_id INTEGER NOT NULL,
    approver_name TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
    comment TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (revision_id) REFERENCES REVISION(id)
  )
`)

// Prepared statements for efficiency
const insertDocument = db.prepare(`
  INSERT INTO DOCUMENT (id, title, loro_crdt, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
`)

const insertRevision = db.prepare(`
  INSERT INTO REVISION (document_id, loro_crdt, author_peer_id, author_name, status, description, base_version, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

const insertApproval = db.prepare(`
  INSERT INTO APPROVAL (revision_id, approver_peer_id, approver_name, decision, comment, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)

const updateDocument = db.prepare(`
  UPDATE DOCUMENT SET loro_crdt = ?, updated_at = ? WHERE id = ?
`)

const updateRevisionStatus = db.prepare(`
  UPDATE REVISION SET status = ? WHERE id = ?
`)

// Helper function to get current timestamp
const now = () => new Date().toISOString()

// Create initial document
console.time('Creating initial document')
const docId = 'doc-001'
const initialDoc = new LoroDoc()
initialDoc.setPeerId(0n) // System peer
const initialText = initialDoc.getText('content')
initialText.insert(0, 'Initial document content for collaborative editing.')

insertDocument.run(
	docId,
	'Collaborative Document',
	initialDoc.export({ mode: 'snapshot' }),
	now(),
	now(),
)
console.timeEnd('Creating initial document')

// Simulate collaborative editing with multiple peers
const peers = [
	{ peerId: 1n, name: 'Alice' },
	{ peerId: 2n, name: 'Bob' },
	{ peerId: 3n, name: 'Charlie' },
] as const

console.time('Simulating collaborative editing workflow')

// Each peer creates their own LoroDoc and imports the current state
function createPeerDoc(currentState: Uint8Array, peerId: bigint): LoroDoc {
	const doc = new LoroDoc()
	doc.setPeerId(peerId)
	doc.import(currentState)
	return doc
}

// Get current document state
function getCurrentDocState(docId: string): Uint8Array {
	const result = db
		.query('SELECT loro_crdt FROM DOCUMENT WHERE id = ?')
		.get(docId) as any
	return result.loro_crdt
}

// Create a revision with the given edits
function createRevision(
	docId: string,
	peerId: bigint,
	peerName: string,
	description: string,
	editFunction: (doc: LoroDoc) => void,
): bigint {
	const createRevisionTx = db.transaction(() => {
		const peerDoc = createPeerDoc(getCurrentDocState(docId), peerId)
		const versionBeforeEditing = peerDoc.version()

		// Apply the edits
		editFunction(peerDoc)

		const exportedDoc = peerDoc.export({
			mode: 'update',
			from: versionBeforeEditing,
		})

		const result = insertRevision.run(
			docId,
			exportedDoc,
			Number(peerId),
			peerName,
			'PENDING',
			description,
			JSON.stringify(versionBeforeEditing),
			now(),
		)

		return BigInt(result.lastInsertRowid!)
	})

	return createRevisionTx()
}

// Approve a revision (includes automatic merging)
function approveRevision(
	docId: string,
	revisionId: bigint,
	approverPeerId: bigint,
	approverName: string,
	comment: string,
): void {
	// Use a transaction to ensure atomicity
	const approveAndMerge = db.transaction(() => {
		// Record the approval
		insertApproval.run(
			Number(revisionId),
			Number(approverPeerId),
			approverName,
			'APPROVED',
			comment,
			now(),
		)

		// Update revision status
		updateRevisionStatus.run('APPROVED', Number(revisionId))

		// Merge the approved revision into the main document
		const revision = db
			.query(
				"SELECT loro_crdt FROM REVISION WHERE id = ? AND status = 'APPROVED'",
			)
			.get(Number(revisionId)) as any
		if (!revision) {
			throw new Error(`Approved revision ${revisionId} not found`)
		}

		// Load current main document and merge the revision
		const mainDoc = new LoroDoc()
		mainDoc.import(getCurrentDocState(docId))
		mainDoc.import(revision.loro_crdt)

		// Update the main document
		updateDocument.run(mainDoc.export({ mode: 'snapshot' }), now(), docId)
	})

	approveAndMerge()
}

// Reject a revision
function rejectRevision(
	revisionId: bigint,
	approverPeerId: bigint,
	approverName: string,
	comment: string,
): void {
	const rejectTx = db.transaction(() => {
		insertApproval.run(
			Number(revisionId),
			Number(approverPeerId),
			approverName,
			'REJECTED',
			comment,
			now(),
		)
		updateRevisionStatus.run('REJECTED', Number(revisionId))
	})

	rejectTx()
}

// Alice makes the first edit
console.log('Alice proposing first edit...')
const aliceRevisionId = createRevision(
	docId,
	peers[0].peerId,
	peers[0].name,
	'Added introduction and paragraph about collaborative editing',
	(doc) => {
		const text = doc.getText('content')
		text.insert(0, "Alice's addition: ")
		text.insert(
			text.length,
			'\n\nAlice added this paragraph about collaborative editing.',
		)
	},
)

// Bob approves Alice's revision
console.log("Bob approving Alice's revision...")
approveRevision(
	docId,
	aliceRevisionId,
	peers[1].peerId,
	peers[1].name,
	'Looks good, approved for merge',
)

// Bob makes his own edit
console.log('Bob proposing second edit...')
const bobRevisionId = createRevision(
	docId,
	peers[1].peerId,
	peers[1].name,
	'Added paragraph about concurrent editing',
	(doc) => {
		const text = doc.getText('content')
		text.insert(
			text.length,
			"\n\nBob's contribution: This demonstrates concurrent editing capabilities.",
		)
	},
)

// Charlie reviews and rejects Bob's revision
console.log("Charlie rejecting Bob's revision...")
rejectRevision(
	bobRevisionId,
	peers[2].peerId,
	peers[2].name,
	'Content is too generic, please be more specific',
)

// Charlie makes an improved edit
console.log('Charlie proposing improved edit...')
const charlieRevisionId = createRevision(
	docId,
	peers[2].peerId,
	peers[2].name,
	'Added technical details about Loro CRDT capabilities',
	(doc) => {
		const text = doc.getText('content')
		text.insert(
			text.length,
			"\n\nCharlie's contribution: Loro CRDT enables real-time collaborative editing with automatic conflict resolution using Operational Transformation algorithms.",
		)
	},
)

// Alice approves Charlie's revision
console.log("Alice approving Charlie's revision...")
approveRevision(
	docId,
	charlieRevisionId,
	peers[0].peerId,
	peers[0].name,
	'Excellent technical addition, approved',
)

console.timeEnd('Simulating collaborative editing workflow')

// Query and display final results
console.time('Querying final document and history')

const finalDoc = new LoroDoc()
finalDoc.import(getCurrentDocState(docId))
const finalText = finalDoc.getText('content')

console.log('\n=== FINAL DOCUMENT CONTENT ===')
console.log(finalText.toString())

console.log('\n=== REVISION HISTORY WITH AUTHORSHIP ===')
const revisions = db
	.query(
		`
  SELECT r.id, r.author_name, r.author_peer_id, r.status, r.description, r.base_version, r.created_at,
         COUNT(CASE WHEN a.decision = 'APPROVED' THEN 1 END) as approvals,
         COUNT(CASE WHEN a.decision = 'REJECTED' THEN 1 END) as rejections
  FROM REVISION r
  LEFT JOIN APPROVAL a ON r.id = a.revision_id
  WHERE r.document_id = ?
  GROUP BY r.id
  ORDER BY r.created_at
`,
	)
	.all(docId) as any[]

revisions.forEach((rev: any) => {
	console.log(`Revision ${rev.id}: ${rev.description}`)
	console.log(`  Author: ${rev.author_name} (PeerID: ${rev.author_peer_id})`)
	console.log(`  Status: ${rev.status}`)
	console.log(`  Base Version: ${rev.base_version}`)
	console.log(`  Approvals: ${rev.approvals}, Rejections: ${rev.rejections}`)
	console.log(`  Created: ${rev.created_at}`)
	console.log()
})

console.log('=== APPROVAL DETAILS ===')
const approvals = db
	.query(
		`
  SELECT a.revision_id, a.approver_name, a.approver_peer_id, a.decision, a.comment, a.created_at
  FROM APPROVAL a
  ORDER BY a.created_at
`,
	)
	.all() as any[]

approvals.forEach((app: any) => {
	console.log(
		`Revision ${app.revision_id} - ${app.decision} by ${app.approver_name} (PeerID: ${app.approver_peer_id})`,
	)
	console.log(`  Comment: ${app.comment}`)
	console.log(`  Time: ${app.created_at}`)
	console.log()
})

console.timeEnd('Querying final document and history')

// Demonstrate authorship tracking through Loro's change history
console.log('=== AUTHORSHIP TRACKING VIA LORO CHANGES ===')
const changes = finalDoc.getAllChanges()
changes.forEach((change: any) => {
	const peerId = change.peer
	const author = peers.find((p) => p.peerId === peerId)?.name || 'System'
	console.log(
		`Change by ${author} (PeerID: ${peerId}) at timestamp ${change.timestamp}`,
	)
})

console.log('\nWorkflow completed successfully!')
