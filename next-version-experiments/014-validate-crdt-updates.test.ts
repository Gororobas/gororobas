import { expect, it } from '@effect/vitest'
import { Effect, Exit } from 'effect'
import { LoroDoc } from 'loro-crdt'
import { Mirror } from 'loro-mirror'
import { Handle, VegetableData } from '@/schema'
import { VegetableDataLoro } from './004-loro-mirror.lib'
import {
	InvalidCrdtUpdateError,
	parseCrdtUpdate,
} from './014-validate-crdt-updates'

// Helper function to create a test document with proper VegetableData structure
function createTestDocument() {
	const doc = new LoroDoc()
	const store = new Mirror({
		doc: doc,
		schema: VegetableDataLoro,
	})

	// Set valid initial data
	store.setState(() => ({
		metadata: {
			handle: Handle.make('test-vegetable'),
			scientific_names: [{ value: 'Testus scientificus' }],
		},
		locales: {},
	}))

	return doc
}

// Helper function to create a valid update
function createValidUpdate(
	sourceDoc: LoroDoc,
	updateFn: (current: any) => any,
) {
	const editedDoc = sourceDoc.fork()
	const editStore = new Mirror({
		doc: editedDoc,
		schema: VegetableDataLoro,
	})
	editStore.setState(updateFn)

	return editedDoc.export({
		mode: 'update',
		from: sourceDoc.version(),
	})
}

it.effect('rejects invalid Loro update format', () =>
	Effect.gen(function* () {
		const sourceDoc = createTestDocument()
		const invalidUpdate = new Uint8Array([1, 2, 3, 4, 5]) // Invalid Loro data

		const result = yield* Effect.exit(
			parseCrdtUpdate({
				crdt_update: invalidUpdate,
				targetSchema: VegetableData,
				sourceDocument: sourceDoc,
			}),
		)

		expect(result).toStrictEqual(
			Exit.fail(new InvalidCrdtUpdateError({ reason: 'InvalidFormat' })),
		)
	}),
)

it.effect('accepts valid update from same source document', () =>
	Effect.gen(function* () {
		const sourceDoc = createTestDocument()

		const validUpdate = createValidUpdate(sourceDoc, (current) => ({
			...current,
			metadata: { ...current.metadata, height_max: 150 },
		}))

		const result = yield* parseCrdtUpdate({
			crdt_update: validUpdate,
			targetSchema: VegetableData,
			sourceDocument: sourceDoc,
		})

		expect(result.data.metadata.height_max).toBe(150)
	}),
)

it.effect('Loro quietly rejects updates from different source document', () =>
	Effect.gen(function* () {
		const sourceDoc1 = createTestDocument()
		const sourceDoc2 = createTestDocument()

		// Create update from sourceDoc2 but try to validate against sourceDoc1
		const updateFromDoc2 = createValidUpdate(sourceDoc2, (current) => ({
			...current,
			metadata: { ...current.metadata, height_max: 200 },
		}))

		const result = yield* parseCrdtUpdate({
			crdt_update: updateFromDoc2,
			targetSchema: VegetableData,
			sourceDocument: sourceDoc1,
		})

		expect(result.data.metadata.height_max).toStrictEqual(undefined)
	}),
)

it.effect('rejects update that results in invalid schema', () =>
	Effect.gen(function* () {
		const sourceDoc = createTestDocument()

		// Create an update that removes required scientific_names
		const invalidUpdate = createValidUpdate(sourceDoc, (current) => ({
			...current,
			metadata: {
				...current.metadata,
				scientific_names: [], // Empty array should violate schema
			},
		}))

		const result = yield* Effect.exit(
			parseCrdtUpdate({
				crdt_update: invalidUpdate,
				targetSchema: VegetableData,
				sourceDocument: sourceDoc,
			}),
		)

		expect(result).toStrictEqual(
			Exit.fail(new InvalidCrdtUpdateError({ reason: 'SchemaValidation' })),
		)
	}),
)

it.effect('accepts update that adds optional locale data', () =>
	Effect.gen(function* () {
		const sourceDoc = createTestDocument()

		const validUpdate = createValidUpdate(sourceDoc, (current) => ({
			...current,
			locales: {
				...current.locales,
				pt: {
					gender: 'MALE',
					common_names: [{ value: 'Teste' }],
				},
			},
		}))

		const result = yield* parseCrdtUpdate({
			crdt_update: validUpdate,
			targetSchema: VegetableData,
			sourceDocument: sourceDoc,
		})

		expect(result).toBeTruthy()
	}),
)

// @TODO: perhaps error on empty updates?
it.effect('handles empty update gracefully', () =>
	Effect.gen(function* () {
		const sourceDoc = createTestDocument()

		// Create an empty update (no changes)
		const emptyUpdate = sourceDoc.export({
			mode: 'update',
			from: sourceDoc.version(),
		})

		const result = yield* parseCrdtUpdate({
			crdt_update: emptyUpdate,
			targetSchema: VegetableData,
			sourceDocument: sourceDoc,
		})

		expect(result).toBeTruthy()
	}),
)
