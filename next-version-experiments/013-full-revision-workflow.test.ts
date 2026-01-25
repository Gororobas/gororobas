import { describe, expect, it } from '@effect/vitest'
import { Arbitrary, Effect, FastCheck, Schema } from 'effect'
import { PersonId, SourceVegetableData } from '@/schema'
import {
	createDocFromVegetableData,
	editVegetableDoc,
} from './013-full-revision-workflow'

// @TODO stub for now
describe('editVegetableDoc', () => {
	it('should create clean diff without intermediate state')
	it('should include person_id in commit message')
	it('should preserve CRDT history from initial doc')
	it('should reject invalid VegetableData updates')
})

describe('materializeVegetable', () => {
	it('should correctly materialize all junction tables')
	it('should handle empty arrays for optional fields')
	it('should update existing records on re-materialization')
	it('should handle all supported locales')
})

describe('Revision Workflow', () => {
	describe('createFirstVersion', () => {
		it(
			'should create vegetable_crdt, revision, and materialized views atomically',
		)
		it('should rollback all tables on partial failure')
		it('should set initial revision as approved')
	})

	describe('createRevision', () => {
		it('should create pending revision without affecting materialized data')
		it('should validate CRDT update is compatible with current state')
		it('should reject revision for non-existent vegetable')
	})

	describe('evaluateRevision', () => {
		describe('when approved', () => {
			it('should merge CRDT update into main document')
			it('should update materialized views')
			it('should update crdt_frontier')
		})

		describe('when rejected', () => {
			it('should NOT modify CRDT or materialized views')
			it('should record rejection with evaluator')
		})

		it('should fail for already-evaluated revisions')
		it('should fail for non-existent revision')
	})

	describe('Concurrent revisions', () => {
		it('should handle multiple pending revisions')
		it('should merge approved revisions in order')
		it('should handle CRDT conflicts gracefully')
	})
})

describe('fetchFullVegetable', () => {
	it('should return preferred locale translation')
	it('should fallback to en -> pt -> es when preferred not available')
	it('should aggregate all junction table data')
	it('should return NotFoundError for non-existent vegetable')
})

describe('VegetableData roundtrip', () => {
	it('should survive CRDT serialization/deserialization', () => {
		FastCheck.assert(
			FastCheck.property(Arbitrary.make(SourceVegetableData), (data) => {
				const doc = createDocFromVegetableData(data)
				const restored = Schema.decodeSync(SourceVegetableData)(doc.toJSON())
				expect(restored).toEqual(data)
			}),
		)
	})

	it.effect('should produce valid diff after edit', () =>
		Effect.gen(function* () {
			FastCheck.assert(
				FastCheck.property(
					Arbitrary.make(SourceVegetableData),
					Arbitrary.make(PersonId),
					(data, personId) => {
						const initial = createDocFromVegetableData(data)
						const { crdt_update } = Effect.runSync(
							editVegetableDoc({
								initial_doc: initial,
								person_id: personId,
								updateData: (current) => ({
									...current,
									metadata: { ...current.metadata, height_max: 999 },
								}),
							}),
						)
						expect(crdt_update.length).toBeGreaterThan(0)
					},
				),
			)
		}),
	)
})
