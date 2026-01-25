import { type Brand, Context, Effect, Layer, Schema } from 'effect'

export type BrandedUUID<B extends string> = string & Brand.Brand<B>

interface UUIDGenerator {
	readonly generate: () => string
	readonly make: <B extends string>(
		brand: Schema.brand<Schema.Schema<string, string, never>, B>,
	) => Effect.Effect<BrandedUUID<B>>
}

export class UUIDGen extends Context.Tag('UUIDGen')<UUIDGen, UUIDGenerator>() {
	// Convenience method for direct access
	static make<A extends Brand.Brand<any>>(
		schema: Schema.Schema<A, string>,
	): Effect.Effect<A, never, UUIDGen> {
		return Effect.flatMap(UUIDGen, (gen) =>
			Effect.sync(() => Schema.decodeSync(schema)(gen.generate())),
		)
	}
}

export const BunUUIDGenLive = Layer.succeed(UUIDGen, {
	generate: () => Bun.randomUUIDv7(),
	make: (brand) =>
		Effect.sync(() => Schema.decodeSync(brand)(Bun.randomUUIDv7())),
})
