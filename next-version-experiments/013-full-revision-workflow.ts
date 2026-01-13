import { DevTools } from '@effect/experimental'
import { NodeSdk } from '@effect/opentelemetry'
import { BunRuntime } from '@effect/platform-bun'
import { SqlClient, SqlResolver, SqlSchema } from '@effect/sql'
import {
	BatchSpanProcessor,
	ConsoleSpanExporter,
} from '@opentelemetry/sdk-trace-base'
import { VegetableDataLoro } from '004-loro-mirror'
import { BunSqlEnvLive } from '011-schema-management/src/sql-live'
import { Effect, pipe, Schema } from 'effect'
import { LoroDoc, VersionVector } from 'loro-crdt'
import { Mirror } from 'loro-mirror'
import {
	ApprovalStatus,
	ImageId,
	PersonId,
	RevisionEvaluation,
	VegetableData,
	VegetableId,
	VegetableRevisionId,
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
 * #5 function to review a revision
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

/** From my timing investigations, this takes ~7ms for a basic edit on a metadata value, broken down by:
 [1.24ms] Forking
 [2.02ms] Loro mirror
 [0.61ms] Updating mirror
 [0.87ms] Diffing
 [1.95ms] Reforking
 [0.09ms] Applying diff
 [0.38ms] Commiting
 [0.32ms] Exporting
 */
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

	const toReturn = {
		doc: cleanFinalDocument,
		crdt_update: cleanFinalDocument.export({
			mode: 'update',
			from: initial_doc.version(),
		}),
	}

	return toReturn
}

const materializeVegetableMain = Effect.fn('materializeVegetableMain')(
	function* ({
		vegetable_id,
		loro_doc,
		vegetable: { metadata },
	}: {
		vegetable_id: VegetableId
		loro_doc: LoroDoc
		vegetable: VegetableData
	}) {
		const sql = yield* SqlClient.SqlClient
		const current_crdt_frontier = JSON.stringify(loro_doc.frontiers())
		const scientific_names = JSON.stringify(
			metadata.scientific_names.map((s) => s.value),
		)

		yield* sql`
        INSERT INTO vegetables (
          id, current_crdt_frontier, handle, scientific_names,
          development_cycle_min, development_cycle_max,
          height_min, height_max,
          temperature_min, temperature_max,
          main_photo_id
        ) VALUES (
          ${vegetable_id}, ${current_crdt_frontier}, ${metadata.handle}, ${scientific_names},
          ${metadata.development_cycle_min ?? null}, ${metadata.development_cycle_max ?? null},
          ${metadata.height_min ?? null}, ${metadata.height_max ?? null},
          ${metadata.temperature_min ?? null}, ${metadata.temperature_max ?? null},
          ${metadata.main_photo_id ?? null}
        )
        ON CONFLICT(id) DO UPDATE SET
          current_crdt_frontier = excluded.current_crdt_frontier,
          handle = excluded.handle,
          scientific_names = excluded.scientific_names,
          development_cycle_min = excluded.development_cycle_min,
          development_cycle_max = excluded.development_cycle_max,
          height_min = excluded.height_min,
          height_max = excluded.height_max,
          temperature_min = excluded.temperature_min,
          temperature_max = excluded.temperature_max,
          main_photo_id = excluded.main_photo_id
      `
	},
)

const materializeVegetableTranslations = Effect.fn(
	'materializeVegetableTranslations',
)(function* ({
	vegetable_id,
	vegetable: { metadata, locales },
}: {
	vegetable_id: VegetableId
	vegetable: VegetableData
}) {
	const sql = yield* SqlClient.SqlClient
	yield* sql`DELETE FROM vegetable_translations WHERE vegetable_id = ${vegetable_id}`

	for (const [locale, localeData] of Object.entries(locales)) {
		const common_names = JSON.stringify(
			localeData.common_names.map((n) => n.value),
		)

		const searchable_names = [
			...localeData.common_names.map((n) => n.value),
			...metadata.scientific_names.map((s) => s.value),
		].join(' ')

		yield* sql`
        INSERT INTO vegetable_translations (
        vegetable_id, locale, names, searchable_names, gender, origin, content
        ) VALUES (
        ${vegetable_id}, ${locale}, ${common_names}, ${searchable_names},
        ${localeData.gender ?? null},
        ${localeData.origin ?? null},
        ${localeData.content ? JSON.stringify(localeData.content) : null}
        )`
	}
})

const materializeVegetableEdibleParts = Effect.fn(
	'materializeVegetableEdibleParts',
)(function* ({
	vegetable_id,
	vegetable: { metadata },
}: {
	vegetable_id: VegetableId
	vegetable: VegetableData
}) {
	const sql = yield* SqlClient.SqlClient
	yield* sql`DELETE FROM vegetable_edible_parts WHERE vegetable_id = ${vegetable_id}`

	if (metadata.edible_parts) {
		for (const part of metadata.edible_parts) {
			yield* sql`
              INSERT INTO vegetable_edible_parts (vegetable_id, edible_part)
              VALUES (${vegetable_id}, ${part})`
		}
	}
})

const materializeVegetableLifecycles = Effect.fn(
	'materializeVegetableLifecycles',
)(function* ({
	vegetable_id,
	vegetable: { metadata },
}: {
	vegetable_id: VegetableId
	vegetable: VegetableData
}) {
	const sql = yield* SqlClient.SqlClient
	yield* sql`DELETE FROM vegetable_lifecycles WHERE vegetable_id = ${vegetable_id}`

	for (const lifecycle of metadata.lifecycles || []) {
		yield* sql`
        INSERT INTO vegetable_lifecycles (vegetable_id, lifecycle)
        VALUES (${vegetable_id}, ${lifecycle})`
	}
})

const materializeVegetableUses = Effect.fn('materializeVegetableUses')(
	function* ({
		vegetable_id,
		vegetable: { metadata },
	}: {
		vegetable_id: VegetableId
		vegetable: VegetableData
	}) {
		const sql = yield* SqlClient.SqlClient
		yield* sql`DELETE FROM vegetable_uses WHERE vegetable_id = ${vegetable_id}`

		for (const use of metadata.uses || []) {
			yield* sql`
        INSERT INTO vegetable_uses (vegetable_id, usage)
        VALUES (${vegetable_id}, ${use})`
		}
	},
)

const materializeVegetableStrata = Effect.fn('materializeVegetableStrata')(
	function* ({
		vegetable_id,
		vegetable: { metadata },
	}: {
		vegetable_id: VegetableId
		vegetable: VegetableData
	}) {
		const sql = yield* SqlClient.SqlClient
		yield* sql`DELETE FROM vegetable_strata WHERE vegetable_id = ${vegetable_id}`

		for (const stratum of metadata.strata || []) {
			yield* sql`
        INSERT INTO vegetable_strata (vegetable_id, stratum)
        VALUES (${vegetable_id}, ${stratum})`
		}
	},
)

const materializeVegetablePlantingMethods = Effect.fn(
	'materializeVegetablePlantingMethods',
)(function* ({
	vegetable_id,
	vegetable: { metadata },
}: {
	vegetable_id: VegetableId
	vegetable: VegetableData
}) {
	const sql = yield* SqlClient.SqlClient

	yield* sql`DELETE FROM vegetable_planting_methods WHERE vegetable_id = ${vegetable_id}`

	for (const method of metadata.planting_methods || []) {
		yield* sql`
        INSERT INTO vegetable_planting_methods (vegetable_id, planting_method)
        VALUES (${vegetable_id}, ${method})`
	}
})

const materializeVegetable = Effect.fn('materializeVegetable')(
	function* (data: { loro_doc: LoroDoc; vegetable_id: VegetableId }) {
		const vegetable = yield* Schema.decode(VegetableData)(
			data.loro_doc.toJSON(),
		)

		const { vegetable_id, loro_doc } = data

		yield* Effect.all(
			[
				materializeVegetableMain({ vegetable_id, loro_doc, vegetable }),
				materializeVegetableTranslations({ vegetable_id, vegetable }),
				materializeVegetableStrata({ vegetable_id, vegetable }),
				materializeVegetablePlantingMethods({ vegetable_id, vegetable }),
				materializeVegetableEdibleParts({ vegetable_id, vegetable }),
				materializeVegetableLifecycles({ vegetable_id, vegetable }),
				materializeVegetableUses({ vegetable_id, vegetable }),
			],
			{ concurrency: 'unbounded' },
		)
	},
)

const insertVegetableRevision = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient

	return SqlSchema.single({
		Request: Schema.Struct({
			id: VegetableRevisionId,
			vegetable_id: VegetableId,
			created_by_id: PersonId,
			crdt_update: Schema.Uint8ArrayFromSelf,
			approval_status: ApprovalStatus,
			created_at: Schema.String,
			updated_at: Schema.String,
		}),
		Result: Schema.Struct({ id: VegetableRevisionId }),
		execute: (requests) =>
			sql`
         INSERT INTO vegetable_revisions
			   OUTPUT INSERTED.id
         ${sql.insert(requests)}
       `,
	})
})

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

	const InsertVegetableRevision = yield* insertVegetableRevision

	yield* pipe(
		InsertVegetableCRDT.execute({
			created_at: now.toISOString(),
			updated_at: now.toISOString(),
			id: vegetable_id,
			loro_crdt: snapshot,
		}),
		Effect.andThen(() =>
			InsertVegetableRevision({
				created_at: now.toISOString(),
				updated_at: now.toISOString(),
				vegetable_id: vegetable_id,
				id: VegetableRevisionId.make(Bun.randomUUIDv7()),
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

/** @TODO validate that crdt_update doesn't violate the crdt main trunk */
const createRevision = Effect.fn('createRevision')(function* (data: {
	vegetable_id: VegetableId
	person_id: PersonId
	crdt_update: Uint8Array
}) {
	const InsertVegetableRevision = yield* insertVegetableRevision

	const now = new Date()

	return yield* InsertVegetableRevision({
		created_at: now.toISOString(),
		updated_at: now.toISOString(),
		vegetable_id: data.vegetable_id,
		id: VegetableRevisionId.make(Bun.randomUUIDv7()),
		approval_status: 'disapproved',
		crdt_update: data.crdt_update,
		created_by_id: data.person_id,
	})
})

const evaluateRevision = Effect.fn('evaluateRevision')(function* (data: {
	revision_id: VegetableRevisionId
	evaluation: RevisionEvaluation
	evaluated_by_id: PersonId
}) {
	const sql = yield* SqlClient.SqlClient

	const updateRevision = SqlSchema.void({
		Request: Schema.Struct({
			revision_id: VegetableRevisionId,
			evaluation: RevisionEvaluation,
			evaluated_by_id: PersonId,
			evaluated_at: Schema.String,
		}),
		execute: ({ revision_id, ...revision }) =>
			sql`
         UPDATE vegetable_revisions
         SET ${sql.update(revision)}
         WHERE id = ${sql.safe(revision_id)};
       `,
	})

	// @TODO: finish revision - import/merge CRDT, upsert CRDT table, materialize tables
	if (data.evaluation !== 'approved') {
		return yield* updateRevision({
			...data,
			evaluated_at: new Date().toISOString(),
		})
	}

	// const vegetableCrdt = SqlSchema.findOne({})
	yield* pipe(
		updateRevision({ ...data, evaluated_at: new Date().toISOString() }),
		// Effect.andThen(() => materializeVegetable({ loro_doc, vegetable_id })),
		sql.withTransaction,
	)
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

const fetchFullVegetable = Effect.fn('fetchFullVegetable')(function* (
	vegetable_id: VegetableId,
	locale: 'pt' | 'es' | 'en',
) {
	const sql = yield* SqlClient.SqlClient

	const result = yield* sql`
    WITH
    preferred_translation AS (
      SELECT
        vegetable_id,
        locale,
        names,
        searchable_names,
        gender,
        origin,
        content,
        ROW_NUMBER() OVER (
          PARTITION BY vegetable_id
          ORDER BY
            CASE locale
              WHEN ${locale} THEN 1
              WHEN 'en' THEN 2
              WHEN 'pt' THEN 3
              WHEN 'es' THEN 4
              ELSE 5
            END
        ) AS rn
      FROM vegetable_translations
      WHERE vegetable_id = ${vegetable_id}
    )
    SELECT
      v.id,
      v.current_crdt_frontier,
      v.handle,
      v.scientific_names,
      v.development_cycle_min,
      v.development_cycle_max,
      v.height_min,
      v.height_max,
      v.temperature_min,
      v.temperature_max,
      v.main_photo_id,
      t.locale as translation_locale,
      t.names as translation_names,
      t.searchable_names as translation_searchable_names,
      t.gender as translation_gender,
      t.origin as translation_origin,
      t.content as translation_content,
      JSON_GROUP_ARRAY(
        CASE WHEN s.stratum IS NOT NULL THEN s.stratum END
      ) FILTER (WHERE s.stratum IS NOT NULL) as strata,
      JSON_GROUP_ARRAY(
        CASE WHEN pm.planting_method IS NOT NULL THEN pm.planting_method END
      ) FILTER (WHERE pm.planting_method IS NOT NULL) as planting_methods,
      JSON_GROUP_ARRAY(
        CASE WHEN ep.edible_part IS NOT NULL THEN ep.edible_part END
      ) FILTER (WHERE ep.edible_part IS NOT NULL) as edible_parts,
      JSON_GROUP_ARRAY(
        CASE WHEN lc.lifecycle IS NOT NULL THEN lc.lifecycle END
      ) FILTER (WHERE lc.lifecycle IS NOT NULL) as lifecycles,
      JSON_GROUP_ARRAY(
        CASE WHEN u.usage IS NOT NULL THEN u.usage END
      ) FILTER (WHERE u.usage IS NOT NULL) as uses
    FROM vegetables v
    LEFT JOIN preferred_translation t ON v.id = t.vegetable_id AND t.rn = 1
    LEFT JOIN vegetable_strata s ON v.id = s.vegetable_id
    LEFT JOIN vegetable_planting_methods pm ON v.id = pm.vegetable_id
    LEFT JOIN vegetable_edible_parts ep ON v.id = ep.vegetable_id
    LEFT JOIN vegetable_lifecycles lc ON v.id = lc.vegetable_id
    LEFT JOIN vegetable_uses u ON v.id = u.vegetable_id
    WHERE v.id = ${vegetable_id}
    GROUP BY v.id, t.locale, t.names, t.searchable_names, t.gender, t.origin, t.content
  `

	return result[0]
})

const program = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient

	const initialDoc = yield* pipe(
		Effect.sync(() => createDocFromVegetableData(CORN_INITIAL)),
		Effect.withSpan('createDocFromVegetableData'),
	)

	const person_id = PersonId.make(Bun.randomUUIDv7())
	const vegetable_id = yield* createFirstVersion({
		loro_doc: initialDoc,
		person_id,
	})
	// yield* Effect.logInfo(yield* sql`SELECT * FROM vegetable_crdts;`)

	const updatedDoc = yield* pipe(
		Effect.sync(() =>
			editVegetableDoc({
				initial_doc: initialDoc,
				person_id,
				updateData: (current) => ({
					...current,
					metadata: { ...current.metadata, height_max: 450 },
				}),
			}),
		),
		Effect.withSpan('editVegetableDoc'),
	)
	const firstRevision = yield* createRevision({
		person_id,
		vegetable_id,
		crdt_update: updatedDoc.crdt_update,
	})

	yield* Effect.log(
		'Full vegetable',
		yield* fetchFullVegetable(vegetable_id, 'en'),
	)
	yield* Effect.log(
		'Before revision',
		(yield* fetchFullVegetable(vegetable_id, 'en') as any).metadata.height_max,
	)
	yield* evaluateRevision({
		evaluated_by_id: person_id,
		evaluation: 'approved',
		revision_id: firstRevision.id,
	})
}).pipe(Effect.withSpan('fullProgram'))

// Set up tracing with the OpenTelemetry SDK
const NodeSdkLive = NodeSdk.layer(() => ({
	resource: { serviceName: 'example' },
	// Export span data to the console
	spanProcessor: new BatchSpanProcessor(new ConsoleSpanExporter()),
}))

pipe(
	program,
	Effect.provide(BunSqlEnvLive),
	// Effect.provide(NodeSdkLive),
	Effect.provide(DevTools.layer()),
	BunRuntime.runMain,
)
