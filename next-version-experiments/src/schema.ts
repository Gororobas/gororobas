import { randCountry, randFood, randParagraph } from '@ngneat/falso'
import { Schema } from 'effect'

/**
 * =======
 * #1 IDs
 * =======
 */

export const AccountId = Schema.UUID.pipe(Schema.brand('AccountId'))
export type AccountId = typeof AccountId.Type

export const PersonId = Schema.UUID.pipe(Schema.brand('PersonId'))
export type PersonId = typeof PersonId.Type

export const OrganizationId = Schema.UUID.pipe(Schema.brand('OrganizationId'))
export type OrganizationId = typeof OrganizationId.Type

export const OrganizationInvitationId = Schema.UUID.pipe(
	Schema.brand('OrganizationInvitationId'),
)
export type OrganizationInvitationId = typeof OrganizationInvitationId.Type

export const TagId = Schema.UUID.pipe(Schema.brand('TagId'))
export type TagId = typeof TagId.Type

export const ImageId = Schema.UUID.pipe(Schema.brand('ImageId'))
export type ImageId = typeof ImageId.Type

export const VegetableId = Schema.UUID.pipe(Schema.brand('VegetableId'))
export type VegetableId = typeof VegetableId.Type

export const VegetableRevisionId = Schema.UUID.pipe(
	Schema.brand('VegetableRevisionId'),
)
export type VegetableRevisionId = typeof VegetableRevisionId.Type

export const VegetableVarietyId = Schema.UUID.pipe(
	Schema.brand('VegetableVarietyId'),
)
export type VegetableVarietyId = typeof VegetableVarietyId.Type

export const ResourceId = Schema.UUID.pipe(Schema.brand('ResourceId'))
export type ResourceId = typeof ResourceId.Type

export const ResourceRevisionId = Schema.UUID.pipe(
	Schema.brand('ResourceRevisionId'),
)
export type ResourceRevisionId = typeof ResourceRevisionId.Type

export const PostId = Schema.UUID.pipe(Schema.brand('PostId'))
export type PostId = typeof PostId.Type

export const PostCommitId = Schema.UUID.pipe(Schema.brand('PostCommitId'))
export type PostCommitId = typeof PostCommitId.Type

export const CommentId = Schema.UUID.pipe(Schema.brand('CommentId'))
export type CommentId = typeof CommentId.Type

export const CommentCommitId = Schema.UUID.pipe(Schema.brand('CommentCommitId'))
export type CommentCommitId = typeof CommentCommitId.Type

/**
 * ========
 * #2 ENUMS
 * ========
 */

export const Locale = Schema.Literal('PT', 'ES', 'EN')
export type Locale = typeof Locale.Type

export const PlatformRole = Schema.Literal('PARTICIPANT', 'MODERATOR', 'ADMIN')
export type PlatformRole = typeof PlatformRole.Type

export const CommunityAccess = Schema.Literal(
	'AWAITING_ACCESS',
	'ALLOWED',
	'BLOCKED',
)
export type CommunityAccess = typeof CommunityAccess.Type

export const ModerationStatus = Schema.Literal(
	'APPROVED_BY_DEFAULT',
	'CENSORED',
)
export type ModerationStatus = typeof ModerationStatus.Type

export const OrganizationInvitationStatus = Schema.Literal(
	'PENDING',
	'ACCEPTED',
	'EXPIRED',
)
export type OrganizationInvitationStatus =
	typeof OrganizationInvitationStatus.Type

export const OrganizationPermissions = Schema.Literal('FULL', 'EDIT', 'VIEW')
export type OrganizationPermissions = typeof OrganizationPermissions.Type

// @TODO review organization types
export const OrganizationType = Schema.Literal(
	'TERRITORY',
	'SOCIAL_MOVEMENT',
	'COMMERCIAL',
	'NGO',
)
export type OrganizationType = typeof OrganizationType.Type

/** Profiles can't be private */
export const ProfileVisibility = Schema.Literal('COMMUNITY', 'PUBLIC')
export type ProfileVisibility = typeof ProfileVisibility.Type

export const InformationVisibility = Schema.Literal(
	'PRIVATE',
	'COMMUNITY',
	'PUBLIC',
)
export type InformationVisibility = typeof InformationVisibility.Type

export const RevisionEvaluation = Schema.Literal(
	'PENDING',
	'APPROVED',
	'REJECTED',
)
export type RevisionEvaluation = typeof RevisionEvaluation.Type

/** Inspired by https://schema.org/EventAttendanceModeEnumeration */
export const EventAttendanceMode = Schema.Literal(
	'IN_PERSON',
	'VIRTUAL',
	'MIXED',
)
export type EventAttendanceMode = typeof EventAttendanceMode.Type

export const BookmarkState = Schema.Literal(
	'INTERESTED', // "Want to plant" for vegetables
	'ACTIVE', // "Am planting" for vegetables
	'PREVIOUSLY_ACTIVE', // "Have planted" for vegetables
	'INDIFFERENT', // "Not interested"
)
export type BookmarkState = typeof BookmarkState.Type

export const PostType = Schema.Literal('NOTE', 'EVENT')
export type PostType = typeof PostType.Type

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

export const VegetableGender = Schema.Literal('NEUTRAL', 'MALE', 'FEMALE')
export type VegetableGender = typeof VegetableGender.Type

export const ChineseMedicineElement = Schema.Literal(
	'FIRE',
	'EARTH',
	'METAL',
	'WATER',
	'WOOD',
)
export type ChineseMedicineElement = typeof ChineseMedicineElement.Type

export const ResourceUrlState = Schema.Literal(
	'UNCHECKED',
	'OK',
	'BROKEN',
	'PENDING',
)
export type ResourceUrlState = typeof ResourceUrlState.Type

/**
 * =============
 * #3 PRIMITIVES
 * =============
 */

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

/**
 * ============
 * #4 RICH TEXT
 * ============
 */

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

/**
 * =========
 * #5 PEOPLE
 * =========
 */

/**
 * ================
 * #6 ORGANIZATIONS
 * ================
 */

/**
 * =======
 * #7 TAGS
 * =======
 */

/**
 * =========
 * #8 IMAGES
 * =========
 */

/**
 * =============
 * #9 VEGETABLES
 * =============
 */

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

const VegetableOrigin = Schema.String.annotations({
	arbitrary: () => (fc) => fc.constant(null).map(() => randCountry()),
})

export const VegetableLocalizedData = Schema.Struct({
	gender: VegetableGender.pipe(Schema.annotations({ default: 'NEUTRAL' })),
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

/**
 * =============
 * #10 RESOURCES
 * =============
 */

/**
 * =========
 * #11 POSTS
 * =========
 */

/**
 * ==========
 * #11.1 NOTES
 * ==========
 */

/**
 * ===========
 * #11.2 EVENTS
 * ===========
 */

/**
 * ============
 * #12 COMMENTS
 * ============
 */

/**
 * =============
 * #13 BOOKMARKS
 * =============
 */
