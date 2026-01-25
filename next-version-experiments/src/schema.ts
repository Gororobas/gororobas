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

export const ProfileId = Schema.Union(PersonId, OrganizationId)
export type ProfileId = typeof ProfileId.Type

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

export const Locale = Schema.Literal('pt', 'es', 'en')
export type Locale = typeof Locale.Type

export const TrustedAccessLevel = Schema.Literal(
	'TRUSTED', // Has been approved and has access to public & community content
	'MODERATOR', // Can trust or block newcomers, flag media and posts, and approve revisions
	'ADMIN', // Moderator access + manage other moderators and admins
)
export type TrustedAccessLevel = typeof TrustedAccessLevel.Type

export const PlatformAccessLevel = Schema.Literal(
	...TrustedAccessLevel.literals,
	'NEWCOMER', // Just signed up, limited access
	'BLOCKED', // Has been blocked by a moderator or admin, same access as visitors
)
export type PlatformAccessLevel = typeof PlatformAccessLevel.Type

export const PlatformAccessLevelOrVisitor = Schema.Literal(
	...PlatformAccessLevel.literals,
	'VISITOR',
)
export type PlatformAccessLevelOrVisitor =
	typeof PlatformAccessLevelOrVisitor.Type

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

export const OrganizationAccessLevel = Schema.Literal(
	'MANAGER',
	'EDITOR',
	'VIEWER',
)
export type OrganizationAccessLevel = typeof OrganizationAccessLevel.Type

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

export const GrammaticalGender = Schema.Literal('NEUTRAL', 'MALE', 'FEMALE')
export type GrammaticalGender = typeof GrammaticalGender.Type

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

export const ResourceFormat = Schema.Literal(
	'PDF',
	'VIDEO',
	'IMAGE',
	'WEBSITE',
	'ARTICLE',
	'BOOK',
	'OTHER',
)
export type ResourceFormat = typeof ResourceFormat.Type

export const TranslationSource = Schema.Literal(
	'ORIGINAL',
	'AUTOMATIC',
	'MANUAL',
)
export type TranslationSource = typeof TranslationSource.Type

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

export const PersonRow = Schema.Struct({
	id: PersonId,
	access_level: PlatformAccessLevel,
	access_set_by_id: Schema.NullishOr(PersonId),
	access_set_at: Schema.NullishOr(Schema.DateFromString),
})

/**
 * ================
 * #6 ORGANIZATIONS
 * ================
 */

export const Organization = Schema.Struct({
	id: OrganizationId,
	type: OrganizationType,
	members_visibility: InformationVisibility,
})
export type Organization = typeof Organization.Type

export const OrganizationMembershipRow = Schema.Struct({
	person_id: PersonId,
	organization_id: OrganizationId,
	access_level: OrganizationAccessLevel,
	created_at: Schema.NullishOr(Schema.DateFromString),
	updated_at: Schema.NullishOr(Schema.DateFromString),
})

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
	grammatical_gender: GrammaticalGender.pipe(
		Schema.annotations({ default: 'NEUTRAL' }),
	),
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

/** Data stored in Loro CRDT documents, the source of what gets materialized in the database */
export const SourceVegetableData = Schema.Struct({
	metadata: VegetableMetadata,
	locales: Schema.Struct({
		pt: Schema.optional(VegetableLocalizedData),
		es: Schema.optional(VegetableLocalizedData),
		en: Schema.optional(VegetableLocalizedData),
	}),
})
export type SourceVegetableData = typeof SourceVegetableData.Type

export const QueriedVegetableData = Schema.Struct({
	...VegetableMetadata.fields,
	...VegetableLocalizedData.fields,
	content: Schema.NullishOr(Schema.parseJson(TiptapDocument)),
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

export const ResourceMetadata = Schema.Struct({
	handle: Handle,
	url: Schema.NonEmptyTrimmedString,
	url_state: ResourceUrlState,
	format: ResourceFormat,
	thumbnail_image_id: Schema.NullishOr(ImageId),
})

export const ResourceLocalizedData = Schema.Struct({
	title: Schema.NonEmptyTrimmedString,
	description: Schema.NullishOr(TiptapDocument),
	credit_line: Schema.NullishOr(Schema.String),
	translation_source: TranslationSource,
	original_locale: Locale,
})

/** Data stored in Loro CRDT documents, the source of what gets materialized in the database */
export const SourceResourceData = Schema.Struct({
	metadata: ResourceMetadata,
	locales: Schema.Struct({
		pt: Schema.optional(ResourceLocalizedData),
		es: Schema.optional(ResourceLocalizedData),
		en: Schema.optional(ResourceLocalizedData),
	}),
})
export type SourceResourceData = typeof SourceResourceData.Type

export const QueriedResourceData = Schema.Struct({
	...ResourceMetadata.fields,
	...ResourceLocalizedData.fields,
	description: Schema.NullishOr(Schema.parseJson(TiptapDocument)),
	locale: Locale,
})
export type QueriedResourceData = typeof QueriedResourceData.Type

/**
 * =========
 * #11 POSTS
 * =========
 */

export const CorePostMetadata = Schema.Struct({
	handle: Handle,
	visibility: InformationVisibility,
	published_at: Schema.NullishOr(Schema.DateFromString),
	owner_profile_id: ProfileId,
})
export type CorePostMetadata = typeof CorePostMetadata.Type

export const PostLocalizedData = Schema.Struct({
	content: TiptapDocument,
	translation_source: TranslationSource,
	original_locale: Locale,
})

export const EventMetadata = Schema.Struct({
	...CorePostMetadata.fields,
	kind: Schema.Literal('EVENT' satisfies (typeof PostType.literals)[1]),
	start_date: Schema.DateFromString,
	end_date: Schema.NullishOr(Schema.DateFromString),
	location_or_url: Schema.NullishOr(Schema.String),
	attendance_mode: Schema.NullishOr(EventAttendanceMode),
})

export const NoteMetadata = Schema.Struct({
	...CorePostMetadata.fields,
	kind: Schema.Literal('NOTE' satisfies (typeof PostType.literals)[0]),
})

/** Data stored in Loro CRDT documents, the source of what gets materialized in the database */
export const NoteSourceData = Schema.Struct({
	metadata: NoteMetadata,
	locales: Schema.Struct({
		pt: Schema.optional(PostLocalizedData),
		es: Schema.optional(PostLocalizedData),
		en: Schema.optional(PostLocalizedData),
	}),
})

/** Data stored in Loro CRDT documents, the source of what gets materialized in the database */
export const EventSourceData = Schema.Struct({
	metadata: EventMetadata,
	locales: Schema.Struct({
		pt: Schema.optional(PostLocalizedData),
		es: Schema.optional(PostLocalizedData),
		en: Schema.optional(PostLocalizedData),
	}),
})

/** Data stored in Loro CRDT documents, the source of what gets materialized in the database */
export const SourcePostData = Schema.Union(NoteSourceData, EventSourceData)
export type SourcePostData = typeof SourcePostData.Type

export const QueriedNoteData = Schema.Struct({
	...CorePostMetadata.fields,
	...PostLocalizedData.fields,
	locale: Locale,
})

export const QueriedEventData = Schema.Struct({
	...CorePostMetadata.fields,
	...EventMetadata.fields,
	...PostLocalizedData.fields,
	locale: Locale,
})

export const QueriedPostData = Schema.Union(QueriedNoteData, QueriedEventData)
export type QueriedPostData = typeof QueriedPostData.Type

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
