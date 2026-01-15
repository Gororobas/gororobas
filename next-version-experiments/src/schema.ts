import { randCountry, randFood, randParagraph } from '@ngneat/falso'
import { Schema } from 'effect'

export const VegetableId = Schema.UUID.pipe(Schema.brand('VegetableId'))
export type VegetableId = typeof VegetableId.Type

export const PersonId = Schema.UUID.pipe(Schema.brand('PersonId'))
export type PersonId = typeof PersonId.Type

export const VegetableRevisionId = Schema.UUID.pipe(
	Schema.brand('VegetableRevisionId'),
)
export type VegetableRevisionId = typeof VegetableRevisionId.Type

export const ImageId = Schema.UUID.pipe(Schema.brand('ImageId'))
export type ImageId = typeof ImageId.Type

export const Handle = Schema.String.pipe(
	Schema.minLength(3, {
		message: () => 'Obrigatório (mínimo de 3 caracteres)',
	}),
	Schema.pattern(/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/, {
		message: () =>
			'O endereço não pode conter caracteres especiais, letras maiúsculas, espaços ou acentos',
	}),
)
export type Handle = typeof Handle.Type

export const AgroforestryStratum = Schema.Literal(
	'EMERGENT',
	'HIGH',
	'MEDIUM',
	'LOW',
	'GROUND',
)
export type AgroforestryStratum = typeof AgroforestryStratum.Type

export const VegetableLifecycle = Schema.Literal(
	'SEMIANNUAL',
	'ANNUAL',
	'BIENNIAL',
	'PERENNIAL',
)
export type VegetableLifecycle = typeof VegetableLifecycle.Type

export const VegetableUsage = Schema.Literal(
	'HUMAN_FEED',
	'ANIMAL_FEED',
	'CONSTRUCTION',
	'COSMETIC',
	'ORGANIC_MATTER',
	'MEDICINAL',
	'ORNAMENTAL',
	'RITUALISTIC',
	'ECOSYSTEM_SERVICE',
)
export type VegetableUsage = typeof VegetableUsage.Type

export const EdibleVegetablePart = Schema.Literal(
	'FRUIT',
	'FLOWER',
	'LEAF',
	'STEM',
	'SEED',
	'BARK',
	'BULB',
	'SPROUT',
	'ROOT',
	'TUBER',
	'RHIZOME',
)
export type EdibleVegetablePart = typeof EdibleVegetablePart.Type

export const PlantingMethod = Schema.Literal(
	'SEED',
	'SEEDLING',
	'STEM_CUTTING',
	'RHIZOME',
	'TUBER',
	'GRAFT',
	'BULB',
	'DIVISION',
)
export type PlantingMethod = typeof PlantingMethod.Type

export const Gender = Schema.Literal('NEUTRAL', 'MALE', 'FEMALE')
export type Gender = typeof Gender.Type

export const ChineseMedicineElement = Schema.Literal(
	'FIRE',
	'EARTH',
	'METAL',
	'WATER',
	'WOOD',
)
export type ChineseMedicineElement = typeof ChineseMedicineElement.Type

const UnknownTiptapAttrs = Schema.UndefinedOr(
	Schema.Record({ key: Schema.NonEmptyString, value: Schema.Any }),
)

const TiptapText = Schema.String.annotations({
	arbitrary: () => (fc) =>
		fc.constant(null).map(() => randParagraph({ length: 1 }).join('\n')),
})

const TiptapMark = Schema.Struct({
	type: Schema.NonEmptyTrimmedString,
	attrs: UnknownTiptapAttrs,
})

const TiptapTextNode = Schema.Struct({
	type: Schema.Literal('text'),
	text: TiptapText,
	marks: Schema.UndefinedOr(Schema.Array(TiptapMark)),
})
type TiptapTextNode = typeof TiptapTextNode.Type

// Pattern for typing self-referencing / recursive schema
// See https://effect.website/docs/schema/advanced-usage/#a-helpful-pattern-to-simplify-schema-definition
const tiptapNodeFields = {
	type: Schema.NonEmptyTrimmedString,
	attrs: UnknownTiptapAttrs,
	marks: Schema.UndefinedOr(Schema.Array(TiptapMark)),
	text: Schema.UndefinedOr(TiptapText),
}
interface TiptapNode extends Schema.Struct.Type<typeof tiptapNodeFields> {
	readonly content: ReadonlyArray<TiptapNode> | undefined
}
const TiptapNode = Schema.Struct({
	...tiptapNodeFields,
	content: Schema.UndefinedOr(
		Schema.Array(
			Schema.suspend(
				(): Schema.Schema<TiptapNode | TiptapTextNode> =>
					// @ts-expect-error Not sure how to type this correctly
					Schema.Union(TiptapNode, TiptapTextNode),
			),
		),
	),
})

export const TiptapDocument = Schema.Struct({
	type: Schema.Literal('doc'),
	content: Schema.Array(TiptapNode),
	version: Schema.Literal(1),
})

export const VegetableMetadata = Schema.Struct({
	handle: Handle,
	scientific_names: Schema.NonEmptyArray(
		Schema.Struct({
			$cid: Schema.optional(Schema.String),
			value: Schema.NonEmptyTrimmedString,
		}),
	),
	strata: Schema.NullishOr(Schema.Array(AgroforestryStratum)),
	lifecycles: Schema.NullishOr(Schema.Array(VegetableLifecycle)),
	uses: Schema.NullishOr(Schema.Array(VegetableUsage)),
	edible_parts: Schema.NullishOr(Schema.Array(EdibleVegetablePart)),
	planting_methods: Schema.NullishOr(Schema.Array(PlantingMethod)),
	development_cycle_min: Schema.NullishOr(Schema.Int),
	development_cycle_max: Schema.NullishOr(Schema.Int),
	height_min: Schema.NullishOr(Schema.Int),
	height_max: Schema.NullishOr(Schema.Int),
	temperature_min: Schema.NullishOr(Schema.Number),
	temperature_max: Schema.NullishOr(Schema.Number),
	chinese_medicine_element: Schema.NullishOr(ChineseMedicineElement),
	main_photo_id: Schema.NullishOr(ImageId),
})

export const Locale = Schema.Literal('pt', 'es', 'en')
export type Locale = typeof Locale.Type

const VegetableOrigin = Schema.String.annotations({
	arbitrary: () => (fc) => fc.constant(null).map(() => randCountry()),
})

export const VegetableLocalizedData = Schema.Struct({
	gender: Gender.pipe(Schema.annotations({ default: 'NEUTRAL' })),
	origin: Schema.optional(Schema.NullishOr(VegetableOrigin)),
	content: Schema.optional(Schema.NullishOr(TiptapDocument)),
	common_names: Schema.Array(
		Schema.Struct({
			$cid: Schema.optional(Schema.String),
			value: Schema.NonEmptyTrimmedString.annotations({
				arbitrary: () => (fc) => fc.constant(null).map(() => randFood()),
			}),
		}),
	),
})

/** Data to be stored in Loro CRDT documents */
export const VegetableData = Schema.Struct({
	metadata: VegetableMetadata,
	locales: Schema.Struct({
		pt: Schema.optional(VegetableLocalizedData),
		es: Schema.optional(VegetableLocalizedData),
		en: Schema.optional(VegetableLocalizedData),
	}),
})
export type VegetableData = typeof VegetableData.Type

export const QueriedVegetableData = Schema.Struct({
	...VegetableMetadata.fields,
	...VegetableLocalizedData.fields,
	scientific_names: Schema.parseJson(Schema.NonEmptyArray(Schema.String)),
	common_names: Schema.parseJson(Schema.NonEmptyArray(Schema.String)),
	strata: Schema.parseJson(VegetableMetadata.fields.strata),
	lifecycles: Schema.parseJson(VegetableMetadata.fields.lifecycles),
	uses: Schema.parseJson(VegetableMetadata.fields.uses),
	edible_parts: Schema.parseJson(VegetableMetadata.fields.edible_parts),
	planting_methods: Schema.parseJson(VegetableMetadata.fields.planting_methods),
	locale: Locale,
})
export type QueriedVegetableData = typeof QueriedVegetableData.Type

export const ApprovalStatus = Schema.Literal(
	'pending_approval',
	'approved',
	'rejected',
)

export const RevisionEvaluation = Schema.Literal(
	'pending',
	'approved',
	'rejected',
)
export type RevisionEvaluation = typeof RevisionEvaluation.Type
