import { BunRuntime } from '@effect/platform-bun'
import { SqlClient, SqlResolver } from '@effect/sql'
import { VegetableDataLoro } from '004-loro-mirror'
import { BunSqlEnvLive } from '011-schema-management/src/sql-live'
import { Effect, pipe, Schema } from 'effect'
import { LoroDoc, VersionVector } from 'loro-crdt'
import { Mirror } from 'loro-mirror'
import {
	ApprovalStatus,
	ImageId,
	PersonId,
	VegetableData,
	VegetableId,
} from '@/schema'

const CommitMessage = Schema.Union(
	Schema.Struct({
		type: Schema.Literal('human-action'),
		person_id: Schema.String,
	}),
	Schema.Struct({
		type: Schema.Literal('system-cleanup'),
		reason: Schema.String,
	}),
	Schema.Struct({
		type: Schema.Literal('ai-translation'),
		model: Schema.String,
	}),
)

/**
 * #3 function to submit changes that creates a diff, includes user id and vegetable id. Perhaps include user Id from a context or Effect Atom
 * #4 process change by creating row in `vegetable_revision` table
 * #5 function to approve a revision
 *    - pulls the revision
 *    - pulls the vegetable's doc & hydrate it (new LoroDoc)
 *    - apply diff
 *    - commit with revision's user id and updated_at
 *    - export snapshot and modify the vegetable's doc in the DB
 *    - mark revision as accepted and closed
 *    - materialize all vegetable tables
 *    - everything in a single transaction
 */

function createDocFromVegetableData(data: VegetableData) {
	const initialDoc = new LoroDoc()
	const initialDocStore = new Mirror({
		doc: initialDoc,
		schema: VegetableDataLoro,
	})
	initialDocStore.setState(() => data)
	return initialDoc
}

function editVegetableDoc({
	initial_doc,
	updateData,
	person_id,
}: {
	initial_doc: LoroDoc
	updateData: (current: VegetableData) => VegetableData
	person_id: PersonId
}) {
	const editedDoc = initial_doc.fork()
	const editStore = new Mirror({
		doc: editedDoc,
		schema: VegetableDataLoro,
	})
	// @ts-expect-error: need to fix types between Loro and Effect by providing validation in the Loro schema to ensure metadata.scientific_names and locale[].names are non-empty @todo
	editStore.setState((current) => updateData(current))

	const diff = editedDoc.diff(initial_doc.frontiers(), editedDoc.frontiers())

	// We could export the `update` snapshot from `editedDoc`, but then every intermediary update would be captured.
	// This mean bloat and potentially leaking private data (say a user accidentally pasted sensitive data in the form).
	// Instead, we generate a diff, which captures only the final updates, and then a apply it to a new, 3rd document.
	// Now, this 3rd document can export the CRDT update without any of the intermediary data in it.
	// Private in-betweens (only what the user explicitly chose to publish is included) and lean result.
	const cleanFinalDocument = initial_doc.fork()
	cleanFinalDocument.applyDiff(diff)
	// Include the user's ID in the commit message
	cleanFinalDocument.commit({
		message: Schema.encodeSync(Schema.parseJson(CommitMessage))({
			type: 'human-action',
			person_id: person_id,
		}),
		timestamp: Date.now(),
	})

	return {
		doc: cleanFinalDocument,
		crdt_update: cleanFinalDocument.export({
			mode: 'update',
			from: initial_doc.version(),
		}),
	}
}

const materializeVegetable = Effect.fn('materializeVegetable')(
	function* (data: { loro_doc: LoroDoc; vegetable_id: VegetableId }) {
		const sql = yield* SqlClient.SqlClient

		const vegetable = yield* Schema.decode(VegetableData)(
			data.loro_doc.toJSON(),
		)

		// #1 upsert in `vegetables`
		// #2 delete `vegetable_translations` and recreate them
		// #3 delete `vegetable_strata` and recreate them
		// #4 delete `vegetable_planting_methods` and recreate them
		// #5 delete `vegetable_edible_parts` and recreate them
		// #6 delete `vegetable_lifecycles` and recreate them
		// #7 delete `vegetable_uses` and recreate them

		// I _think_ I can do everything in parallel without breaking the transaction
		// yield* Effect.all([sql``], { concurrency: 'unbounded' })
		// console.log('HERE', vegetable)
	},
)

const createFirstVersion = Effect.fn('createFirstVersion')(function* ({
	loro_doc,
	person_id,
}: {
	loro_doc: LoroDoc
	person_id: PersonId
}) {
	const sql = yield* SqlClient.SqlClient
	const vegetable_id = VegetableId.make(Bun.randomUUIDv7())
	const snapshot = loro_doc.export({ mode: 'snapshot' })
	const crdt_update = loro_doc.export({
		mode: 'update',
		from: new VersionVector(null),
	})
	const now = new Date()

	const InsertVegetableCRDT = yield* SqlResolver.void('InsertVegetableCRDT', {
		Request: Schema.Struct({
			id: VegetableId,
			loro_crdt: Schema.Uint8ArrayFromSelf,
			created_at: Schema.String,
			updated_at: Schema.String,
		}),
		execute: (requests) =>
			sql`
        INSERT INTO vegetable_crdts
        ${sql.insert(requests)}
      `,
	})

	const InsertVegetableRevision = yield* SqlResolver.void(
		'InsertVegetableCRDT',
		{
			Request: Schema.Struct({
				id: Schema.UUID,
				vegetable_id: VegetableId,
				created_by_id: PersonId,
				crdt_update: Schema.Uint8ArrayFromSelf,
				approval_status: ApprovalStatus,
				created_at: Schema.String,
				updated_at: Schema.String,
			}),
			execute: (requests) =>
				sql`
        INSERT INTO vegetable_revisions
        ${sql.insert(requests)}
      `,
		},
	)

	yield* pipe(
		InsertVegetableCRDT.execute({
			created_at: now.toISOString(),
			updated_at: now.toISOString(),
			id: vegetable_id,
			loro_crdt: snapshot,
		}),
		Effect.andThen(() =>
			InsertVegetableRevision.execute({
				created_at: now.toISOString(),
				updated_at: now.toISOString(),
				vegetable_id: vegetable_id,
				id: Bun.randomUUIDv7(),
				approval_status: 'approved',
				crdt_update,
				created_by_id: person_id,
			}),
		),
		Effect.andThen(() => materializeVegetable({ loro_doc, vegetable_id })),
		sql.withTransaction,
	)

	return vegetable_id
})

const createRevision = Effect.fn('createRevision')(function* (data: {
	vegetable_id: string
	user_id: string
	crdt_update: Uint8Array
}) {
	const sql = yield* SqlClient.SqlClient
})

const CORN_INITIAL = VegetableData.make({
	metadata: {
		handle: 'zea-mays',
		scientific_names: [{ value: 'Zea Mays' }],
		strata: ['EMERGENT'],
		planting_methods: ['SEED'],
		edible_parts: ['SEED'],
		lifecycles: ['SEMIANNUAL'],
		uses: ['RITUALISTIC', 'HUMAN_FEED'],
		development_cycle_min: 120,
		development_cycle_max: 210,
		height_min: 60,
		height_max: 400,
		temperature_min: 15,
		temperature_max: 35,
		main_photo_id: ImageId.make(Bun.randomUUIDv7()),
	},
	locales: {
		pt: {
			gender: 'MALE',
			origin: 'América Central',
			common_names: [{ value: 'Milho' }, { value: 'Maíz (Espanhol)' }],
		},
		es: {
			gender: 'MALE',
			origin: 'America Central',
			common_names: [{ value: 'Maíz' }, { value: 'Milho (Português)' }],
		},
	},
})

const program = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient

	yield* Effect.logInfo(
		yield* sql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;`,
	)

	const initialDoc = createDocFromVegetableData(CORN_INITIAL)

	const person_id = PersonId.make(Bun.randomUUIDv7())
	yield* Effect.log(
		yield* createFirstVersion({ loro_doc: initialDoc, person_id }),
	)
	const modified = editVegetableDoc({
		initial_doc: initialDoc,
		person_id,
		updateData: (current) => ({
			...current,
			metadata: { ...current.metadata, height_max: 450 },
		}),
	})
})

pipe(program, Effect.provide(BunSqlEnvLive), BunRuntime.runMain)
