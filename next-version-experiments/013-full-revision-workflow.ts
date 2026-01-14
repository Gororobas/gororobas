import { DevTools } from '@effect/experimental'
import { BunRuntime } from '@effect/platform-bun'
import { SqlClient, SqlResolver, SqlSchema } from '@effect/sql'
import {
	type Brand,
	Clock,
	Context,
	Data,
	Effect,
	Layer,
	Option,
	pipe,
	Schema,
} from 'effect'
import { LoroDoc, VersionVector } from 'loro-crdt'
import { Mirror } from 'loro-mirror'
import {
	AgroforestryStratum,
	EdibleVegetablePart,
	ImageId,
	Locale,
	PersonId,
	PlantingMethod,
	QueriedVegetableData,
	RevisionEvaluation,
	VegetableData,
	VegetableId,
	VegetableLifecycle,
	VegetableRevisionId,
	VegetableUsage,
} from '@/schema'
import { VegetableDataLoro } from './004-loro-mirror.lib'
import { BunSqlEnvLive } from './011-schema-management/src/sql-live'
import { parseCrdtUpdate } from './014-validate-crdt-updates'

type BrandedUUID<B extends string> = string & Brand.Brand<B>

interface UUIDGenerator {
	readonly generate: () => string
	readonly make: <B extends string>(
		brand: Schema.brand<Schema.Schema<string, string, never>, B>,
	) => Effect.Effect<BrandedUUID<B>>
}

class UUIDGen extends Context.Tag('UUIDGen')<UUIDGen, UUIDGenerator>() {
	// Convenience method for direct access
	static make<A extends Brand.Brand<any>>(
		schema: Schema.Schema<A, string>,
	): Effect.Effect<A, never, UUIDGen> {
		return Effect.flatMap(UUIDGen, (gen) =>
			Effect.sync(() => Schema.decodeSync(schema)(gen.generate())),
		)
	}
}

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

export function createDocFromVegetableData(data: VegetableData) {
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
export const editVegetableDoc = Effect.fn('editVegetableDoc')(function* ({
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
		timestamp: yield* Clock.currentTimeMillis,
	})

	const toReturn = {
		doc: cleanFinalDocument,
		crdt_update: cleanFinalDocument.export({
			mode: 'update',
			from: initial_doc.version(),
		}),
	}

	return toReturn
})

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
        vegetable_id, locale, common_names, searchable_names, gender, origin, content
        ) VALUES (
        ${vegetable_id}, ${locale}, ${common_names}, ${searchable_names},
        ${localeData.gender ?? null},
        ${localeData.origin ?? null},
        ${localeData.content ? JSON.stringify(localeData.content) : null}
        )`
	}
})

type JunctionConfig<T extends Schema.Schema.AnyNoContext> = {
	tableName: string
	columnName: string
	valueSchema: T
	getData: (
		vegetable: VegetableData,
	) => ReadonlyArray<Schema.Schema.Type<T>> | null | undefined
}

const createJunctionMaterializer = <T extends Schema.Schema.AnyNoContext>(
	config: JunctionConfig<T>,
) =>
	Effect.fn(`materialize_${config.tableName}`)(function* ({
		vegetable_id,
		vegetable,
	}: {
		vegetable_id: VegetableId
		vegetable: VegetableData
	}) {
		const sql = yield* SqlClient.SqlClient

		yield* sql`DELETE FROM ${sql.unsafe(config.tableName)} WHERE vegetable_id = ${vegetable_id}`

		const InsertJunction = SqlSchema.void({
			Request: Schema.Struct({
				vegetable_id: VegetableId,
				[config.columnName]: config.valueSchema,
			}),
			execute: (requests) =>
				sql`INSERT INTO ${sql.unsafe(config.tableName)} ${sql.insert(requests)}`,
		})

		const data = config.getData(vegetable)
		if (data && data.length > 0) {
			yield* Effect.forEach(
				data,
				(value) =>
					InsertJunction({
						vegetable_id,
						[config.columnName]: value,
					} as any),
				{ concurrency: 'unbounded' },
			)
		}
	})

const materializeVegetableEdibleParts = createJunctionMaterializer({
	tableName: 'vegetable_edible_parts',
	columnName: 'edible_part',
	valueSchema: EdibleVegetablePart,
	getData: (v) => v.metadata.edible_parts,
})

const materializeVegetableLifecycles = createJunctionMaterializer({
	tableName: 'vegetable_lifecycles',
	columnName: 'lifecycle',
	valueSchema: VegetableLifecycle,
	getData: (v) => v.metadata.lifecycles,
})

const materializeVegetableStrata = createJunctionMaterializer({
	tableName: 'vegetable_strata',
	columnName: 'stratum',
	valueSchema: AgroforestryStratum,
	getData: (v) => v.metadata.strata,
})

const materializeVegetableUses = createJunctionMaterializer({
	tableName: 'vegetable_uses',
	columnName: 'usage',
	valueSchema: VegetableUsage,
	getData: (v) => v.metadata.uses,
})

const materializeVegetablePlantingMethods = createJunctionMaterializer({
	tableName: 'vegetable_planting_methods',
	columnName: 'planting_method',
	valueSchema: PlantingMethod,
	getData: (v) => v.metadata.planting_methods,
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
			evaluation: RevisionEvaluation,
			evaluated_by_id: Schema.optional(PersonId),
			created_at: Schema.String,
			updated_at: Schema.String,
		}),
		Result: Schema.Struct({ id: VegetableRevisionId }),
		execute: (requests) =>
			sql`
         INSERT INTO vegetable_revisions
         ${sql.insert(requests)}
         RETURNING id
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

	const vegetable_id = yield* UUIDGen.make(VegetableId)
	const snapshot = loro_doc.export({ mode: 'snapshot' })
	const crdt_update = loro_doc.export({
		mode: 'update',
		from: new VersionVector(null),
	})
	const now = new Date(yield* Clock.currentTimeMillis)

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

	const revision_id = yield* UUIDGen.make(VegetableRevisionId)
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
				id: revision_id,
				evaluation: 'approved',
				evaluated_by_id: person_id,
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
	vegetable_id: VegetableId
	person_id: PersonId
	crdt_update: Uint8Array
}) {
	const InsertVegetableRevision = yield* insertVegetableRevision
	const sql = yield* SqlClient.SqlClient

	const fetchVegetableCRDT = SqlSchema.findOne({
		Request: Schema.Struct({ vegetable_id: VegetableId }),
		Result: Schema.Struct({
			id: VegetableId,
			loro_crdt: Schema.Uint8ArrayFromSelf,
		}),
		execute: ({ vegetable_id }) =>
			sql`
        SELECT id, loro_crdt
        FROM vegetable_crdts
        WHERE id = ${sql.safe(vegetable_id)}
      `,
	})
	const vegetableCRDT = yield* fetchVegetableCRDT({
		vegetable_id: data.vegetable_id,
	}).pipe(
		Effect.flatMap(
			Option.match({
				onNone: () => Effect.fail(new NotFoundError({ id: data.vegetable_id })),
				onSome: Effect.succeed,
			}),
		),
	)

	const sourceDocument = new LoroDoc()
	sourceDocument.import(vegetableCRDT.loro_crdt)
	yield* parseCrdtUpdate({
		crdt_update: data.crdt_update,
		sourceDocument,
		targetSchema: VegetableData,
	})

	const now = new Date(yield* Clock.currentTimeMillis)

	const revision_id = yield* UUIDGen.make(VegetableRevisionId)

	return yield* InsertVegetableRevision({
		created_at: now.toISOString(),
		updated_at: now.toISOString(),
		vegetable_id: data.vegetable_id,
		id: revision_id,
		evaluation: 'pending',
		crdt_update: data.crdt_update,
		created_by_id: data.person_id,
	})
})

export class NotFoundError extends Data.TaggedError('NotFoundError')<{
	id?: string
}> {}

class RevisionWorkflowError extends Data.TaggedError('RevisionWorkflowError')<{
	reason:
		| 'NOT_FOUND'
		| 'INVALID_CRDT'
		| 'ALREADY_EVALUATED'
		| 'INVALID_EVALUATION'
		| 'VALIDATION_FAILED'
	message?: string
	context?: Record<string, unknown>
}> {}

// @TODO: can we include reads in the transaction to make this consistent?
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

	const fetchRevision = SqlSchema.findOne({
		Request: Schema.Struct({ revision_id: VegetableRevisionId }),
		Result: Schema.Struct({
			id: VegetableRevisionId,
			vegetable_id: VegetableId,
			crdt_update: Schema.Uint8ArrayFromSelf,
			evaluation: Schema.NullOr(RevisionEvaluation),
		}),
		execute: ({ revision_id }) =>
			sql`
        SELECT id, vegetable_id, crdt_update, evaluation
        FROM vegetable_revisions
        WHERE id = ${sql.safe(revision_id)}
      `,
	})

	// Guard: prevent pending evaluation - only `accepted` or `rejected` modify the state
	if (data.evaluation === 'pending') {
		return yield* Effect.fail(
			new RevisionWorkflowError({
				reason: 'INVALID_EVALUATION',
			}),
		)
	}

	const revision = yield* fetchRevision({ revision_id: data.revision_id }).pipe(
		Effect.flatMap(
			Option.match({
				onNone: () => Effect.fail(new NotFoundError({ id: data.revision_id })),
				onSome: Effect.succeed,
			}),
		),
	)

	// Guard: prevent re-evaluation
	if (revision.evaluation !== 'pending') {
		return yield* Effect.fail(
			new RevisionWorkflowError({
				reason: 'ALREADY_EVALUATED',
			}),
		)
	}

	const now = new Date(yield* Clock.currentTimeMillis)
	if (data.evaluation !== 'approved')
		return yield* updateRevision({ ...data, evaluated_at: now.toISOString() })

	const fetchVegetableCRDT = SqlSchema.findOne({
		Request: Schema.Struct({ vegetable_id: VegetableId }),
		Result: Schema.Struct({
			id: VegetableId,
			loro_crdt: Schema.Uint8ArrayFromSelf,
		}),
		execute: ({ vegetable_id }) =>
			sql`
        SELECT id, loro_crdt
        FROM vegetable_crdts
        WHERE id = ${sql.safe(vegetable_id)}
      `,
	})

	const updateVegetableCRDT = SqlSchema.void({
		Request: Schema.Struct({
			id: VegetableId,
			loro_crdt: Schema.Uint8ArrayFromSelf,
			updated_at: Schema.String,
		}),
		execute: ({ id, ...update }) =>
			sql`
        UPDATE vegetable_crdts
        SET ${sql.update(update)}
        WHERE id = ${sql.safe(id)}
      `,
	})

	const vegetableCRDT = yield* fetchVegetableCRDT({
		vegetable_id: revision.vegetable_id,
	}).pipe(
		Effect.flatMap(
			Option.match({
				onNone: () =>
					Effect.fail(new NotFoundError({ id: revision.vegetable_id })),
				onSome: Effect.succeed,
			}),
		),
	)

	const sourceDocument = new LoroDoc()
	sourceDocument.import(vegetableCRDT.loro_crdt)
	const { loroDoc } = yield* parseCrdtUpdate({
		crdt_update: revision.crdt_update,
		sourceDocument,
		targetSchema: VegetableData,
	})

	// Update the vegetable CRDT with the merged document
	const updatedSnapshot = loroDoc.export({ mode: 'snapshot' })

	yield* pipe(
		updateRevision({ ...data, evaluated_at: now.toISOString() }),
		Effect.andThen(() =>
			updateVegetableCRDT({
				id: revision.vegetable_id,
				loro_crdt: updatedSnapshot,
				updated_at: now.toISOString(),
			}),
		),
		Effect.andThen(() =>
			materializeVegetable({
				loro_doc: sourceDocument,
				vegetable_id: revision.vegetable_id,
			}),
		),
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

const FetchVegetableRequest = Schema.Struct({
	vegetable_id: VegetableId,
	locale: Locale,
})
const fetchFullVegetable = Effect.fn('fetchFullVegetable')(function* (
	request: typeof FetchVegetableRequest.Type,
) {
	const sql = yield* SqlClient.SqlClient

	const Query = SqlSchema.single({
		Request: FetchVegetableRequest,
		Result: QueriedVegetableData,
		execute: (req) => sql`
    WITH
    preferred_translation AS (
      SELECT
        vegetable_id,
        locale,
        common_names,
        searchable_names,
        gender,
        origin,
        content,
        ROW_NUMBER() OVER (
          PARTITION BY vegetable_id
          ORDER BY
            CASE locale
              WHEN ${req.locale} THEN 1
              WHEN 'en' THEN 2
              WHEN 'pt' THEN 3
              WHEN 'es' THEN 4
              ELSE 5
            END
        ) AS rn
      FROM vegetable_translations
      WHERE vegetable_id = ${req.vegetable_id}
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
      t.locale as locale,
      t.common_names as common_names,
      t.searchable_names as searchable_names,
      t.gender as gender,
      t.origin as origin,
      t.content as content,
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
    WHERE v.id = ${req.vegetable_id}
    GROUP BY v.id, t.locale, t.common_names, t.searchable_names, t.gender, t.origin, t.content
  `,
	})

	return yield* Query(request)
})

const program = Effect.gen(function* () {
	const initialDoc = yield* pipe(
		Effect.sync(() => createDocFromVegetableData(CORN_INITIAL)),
		Effect.withSpan('createDocFromVegetableData'),
	)

	const person_id = yield* UUIDGen.make(PersonId)
	const vegetable_id = yield* createFirstVersion({
		loro_doc: initialDoc,
		person_id,
	})
	// yield* Effect.logInfo(yield* sql`SELECT * FROM vegetable_crdts;`)

	const updatedDoc = yield* editVegetableDoc({
		initial_doc: initialDoc,
		person_id,
		updateData: (current) => ({
			...current,
			metadata: { ...current.metadata, height_max: 450 },
		}),
	})
	const firstRevision = yield* createRevision({
		person_id,
		vegetable_id,
		crdt_update: updatedDoc.crdt_update,
	})

	const vegetableRequest = FetchVegetableRequest.make({
		vegetable_id,
		locale: 'en',
	})
	yield* Effect.log(
		'Full vegetable',
		yield* fetchFullVegetable(vegetableRequest),
	)
	yield* Effect.log(
		'Before revision',
		(yield* fetchFullVegetable(vegetableRequest)).height_max,
	)
	yield* evaluateRevision({
		evaluated_by_id: person_id,
		evaluation: 'approved',
		revision_id: firstRevision.id,
	})
	yield* Effect.log(
		'After revision',
		(yield* fetchFullVegetable(vegetableRequest)).height_max,
	)
}).pipe(Effect.withSpan('fullProgram'))

const BunUUIDGenLive = Layer.succeed(UUIDGen, {
	generate: () => Bun.randomUUIDv7(),
	make: (brand) =>
		Effect.sync(() => Schema.decodeSync(brand)(Bun.randomUUIDv7())),
})

const Services = Layer.mergeAll(DevTools.layer(), BunSqlEnvLive, BunUUIDGenLive)

pipe(program, Effect.provide(Services), BunRuntime.runMain)
