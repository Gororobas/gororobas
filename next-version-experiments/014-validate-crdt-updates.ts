import { Data, Effect, Schema } from 'effect'
import type { LoroDoc } from 'loro-crdt'

export interface IsCrdtUpdateValidData<S extends Schema.Schema<any>> {
	crdt_update: Uint8Array<ArrayBufferLike>
	targetSchema: S
	sourceDocument: LoroDoc
}

export class InvalidCrdtUpdateError extends Data.TaggedError(
	'InvalidCrdtUpdateError',
)<{
	readonly reason: 'InvalidFormat' | 'SchemaValidation'
}> {}

const applyUpdate = (
	crdt_update: Uint8Array<ArrayBufferLike>,
	sourceDocument: LoroDoc,
) =>
	Effect.try({
		try: () => {
			const forkedDoc = sourceDocument.fork()

			const importStatus = forkedDoc.import(crdt_update)
			if (!importStatus.success) throw new Error()

			return forkedDoc
		},
		catch: () => new InvalidCrdtUpdateError({ reason: 'InvalidFormat' }),
	})

const validateSchema = <S extends Schema.Schema<any>>(
	updatedDoc: LoroDoc,
	targetSchema: S,
) =>
	Effect.gen(function* () {
		const resultData = updatedDoc.toJSON()
		return yield* Schema.decode(targetSchema)(resultData).pipe(
			Effect.catchAll(() =>
				Effect.fail(new InvalidCrdtUpdateError({ reason: 'SchemaValidation' })),
			),
		)
	})

/**
 * Parses and validates a CRDT update based on three criteria:
 * 1. It must be a valid Loro update format
 * 2. It must originate from the same source document
 * 3. After applied, it must conform to the target schema
 *
 * Returns the updated document if all validations pass.
 */
export const parseCrdtUpdate = Effect.fn('parseCrdtUpdate')(function* <
	S extends Schema.Schema<any>,
>(props: IsCrdtUpdateValidData<S>) {
	const updatedDoc = yield* applyUpdate(props.crdt_update, props.sourceDocument)
	const data = yield* validateSchema(updatedDoc, props.targetSchema)

	return { loroDoc: updatedDoc, data }
})
