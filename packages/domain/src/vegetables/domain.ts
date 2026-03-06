/**
 * Vegetable domain entity and related types.
 */
import { Schema } from "effect"

import {
  AgroforestryStratum,
  BookmarkState,
  ChineseMedicineElement,
  EdibleVegetablePart,
  GrammaticalGender,
  Locale,
  PlantingMethod,
  RevisionEvaluation,
  VegetableLifecycle,
  VegetableUsage,
} from "../common/enums.js"
import { ImageId, PersonId, VegetableId, VegetableRevisionId } from "../common/ids.js"
import { Handle, TimestampColumn } from "../common/primitives.js"
import { LoroDocUpdate } from "../crdts/domain.js"
import { TiptapDocument } from "../rich-text/domain.js"

export const VegetableMetadata = Schema.Struct({
  chineseMedicineElement: Schema.NullishOr(ChineseMedicineElement),
  developmentCycleMax: Schema.NullishOr(Schema.Int),
  developmentCycleMin: Schema.NullishOr(Schema.Int),
  edibleParts: Schema.NullishOr(Schema.Array(EdibleVegetablePart)),
  handle: Handle,
  heightMax: Schema.NullishOr(Schema.Int),
  heightMin: Schema.NullishOr(Schema.Int),
  lifecycles: Schema.NullishOr(Schema.Array(VegetableLifecycle)),
  mainPhotoId: Schema.NullishOr(ImageId),
  plantingMethods: Schema.NullishOr(Schema.Array(PlantingMethod)),
  scientificNames: Schema.NonEmptyArray(
    Schema.Struct({
      $cid: Schema.optional(Schema.String),
      value: Schema.Trimmed.check(Schema.isNonEmpty()),
    }),
  ),
  strata: Schema.NullishOr(Schema.Array(AgroforestryStratum)),
  temperatureMax: Schema.NullishOr(Schema.Number),
  temperatureMin: Schema.NullishOr(Schema.Number),
  uses: Schema.NullishOr(Schema.Array(VegetableUsage)),
})
export type VegetableMetadata = typeof VegetableMetadata.Type

export const VegetableLocalizedData = Schema.Struct({
  commonNames: Schema.Array(
    Schema.Struct({
      $cid: Schema.optional(Schema.String),
      value: Schema.Trimmed.check(Schema.isNonEmpty()),
    }),
  ),
  content: Schema.optional(Schema.NullishOr(TiptapDocument)),
  grammaticalGender: GrammaticalGender.pipe(Schema.annotate({ default: "NEUTRAL" })),
  origin: Schema.optional(Schema.NullishOr(Schema.String)),
})
export type VegetableLocalizedData = typeof VegetableLocalizedData.Type

/** Data stored in Loro CRDT documents, the source of what gets materialized in the database */
export const SourceVegetableData = Schema.Struct({
  locales: Schema.Struct({
    en: Schema.optional(VegetableLocalizedData),
    es: Schema.optional(VegetableLocalizedData),
    pt: Schema.optional(VegetableLocalizedData),
  }),
  metadata: VegetableMetadata,
})
export type SourceVegetableData = typeof SourceVegetableData.Type

/** API response schemas */
export const VegetableCardData = Schema.Struct({
  handle: Handle,
  commonNames: Schema.fromJsonString(Schema.NonEmptyArray(Schema.String)),
  locale: Locale,
})
export type VegetableCardData = typeof VegetableCardData.Type

export const VegetablePageData = Schema.Struct({
  vegetable: Schema.Struct({
    handle: Handle,
    chineseMedicineElement: Schema.NullishOr(
      Schema.fromJsonString(
        Schema.Array(Schema.NullishOr(Schema.Literals(["COLD", "COOL", "NEUTRAL", "WARM", "HOT"]))),
      ),
    ),
    commonNames: Schema.fromJsonString(Schema.NonEmptyArray(Schema.String)),
    content: Schema.NullishOr(Schema.fromJsonString(TiptapDocument)),
    developmentCycleMax: Schema.NullishOr(Schema.Int),
    developmentCycleMin: Schema.NullishOr(Schema.Int),
    edibleParts: Schema.NullishOr(
      Schema.fromJsonString(
        Schema.Array(Schema.Literals(["BULB", "FLOWER", "FRUIT", "LEAF", "ROOT", "STEM", "SEED"])),
      ),
    ),
    grammaticalGender: Schema.Literals(["FEMININE", "MASCULINE", "NEUTRAL"]),
    heightMax: Schema.NullishOr(Schema.Int),
    heightMin: Schema.NullishOr(Schema.Int),
    lifecycles: Schema.NullishOr(
      Schema.fromJsonString(Schema.Array(Schema.Literals(["ANNUAL", "BIENNIAL", "PERENNIAL"]))),
    ),
    locale: Locale,
    mainPhotoId: Schema.NullishOr(Schema.String),
    origin: Schema.NullishOr(Schema.String),
    plantingMethods: Schema.NullishOr(
      Schema.fromJsonString(Schema.Array(Schema.Literals(["DIRECT_SOWING", "SEEDLING", "BOTH"]))),
    ),
    scientificNames: Schema.fromJsonString(Schema.NonEmptyArray(Schema.String)),
    strata: Schema.NullishOr(
      Schema.fromJsonString(
        Schema.Array(Schema.Literals(["CANOPY", "UNDERSTORY", "HERBACEOUS", "RHIZOSPHERE"])),
      ),
    ),
    temperatureMax: Schema.NullishOr(Schema.Number),
    temperatureMin: Schema.NullishOr(Schema.Number),
    uses: Schema.NullishOr(
      Schema.fromJsonString(Schema.Array(Schema.Literals(["CULINARY", "MEDICINAL", "ORNAMENTAL"]))),
    ),
  }),
})
export type VegetablePageData = typeof VegetablePageData.Type

export const VegetableSearchParams = Schema.Struct({
  chineseMedicineElement: Schema.optional(
    Schema.fromJsonString(
      Schema.Array(Schema.Literals(["COLD", "COOL", "NEUTRAL", "WARM", "HOT"])),
    ),
  ),
  edibleParts: Schema.optional(
    Schema.fromJsonString(
      Schema.Array(Schema.Literals(["BULB", "FLOWER", "FRUIT", "LEAF", "ROOT", "STEM", "SEED"])),
    ),
  ),
  heightMax: Schema.optional(Schema.NumberFromString),
  heightMin: Schema.optional(Schema.NumberFromString),
  lifecycles: Schema.optional(
    Schema.fromJsonString(Schema.Array(Schema.Literals(["ANNUAL", "BIENNIAL", "PERENNIAL"]))),
  ),
  page: Schema.NumberFromString,
  plantingMethods: Schema.optional(
    Schema.fromJsonString(Schema.Array(Schema.Literals(["DIRECT_SOWING", "SEEDLING", "BOTH"]))),
  ),
  query: Schema.optional(Schema.String),
  strata: Schema.optional(
    Schema.fromJsonString(
      Schema.Array(Schema.Literals(["CANOPY", "UNDERSTORY", "HERBACEOUS", "RHIZOSPHERE"])),
    ),
  ),
  temperatureMax: Schema.optional(Schema.NumberFromString),
  temperatureMin: Schema.optional(Schema.NumberFromString),
  uses: Schema.optional(
    Schema.fromJsonString(Schema.Array(Schema.Literals(["CULINARY", "MEDICINAL", "ORNAMENTAL"]))),
  ),
})
export type VegetableSearchParams = typeof VegetableSearchParams.Type

export const VegetableRevisionData = Schema.Struct({
  updatedAt: TimestampColumn,
  createdAt: TimestampColumn,
  evaluatedAt: Schema.NullishOr(TimestampColumn),
  evaluatedById: Schema.NullishOr(PersonId),
  evaluation: RevisionEvaluation,
  id: VegetableRevisionId,
  vegetableId: VegetableId,
  createdById: PersonId,
  vegetableHandle: Handle,
  crdtUpdate: LoroDocUpdate,
})
export type VegetableRevisionData = typeof VegetableRevisionData.Type

export const VegetableBookmark = Schema.Struct({
  personId: PersonId,
  state: BookmarkState,
  vegetableId: VegetableId,
})
export type VegetableBookmark = typeof VegetableBookmark.Type

/** Queried vegetable row from the materialized table */
export const VegetableRow = Schema.Struct({
  developmentCycleMax: Schema.NullOr(Schema.Number),
  developmentCycleMin: Schema.NullOr(Schema.Number),
  handle: Schema.String,
  heightMax: Schema.NullOr(Schema.Number),
  heightMin: Schema.NullOr(Schema.Number),
  id: VegetableId,
  mainPhotoId: Schema.NullOr(Schema.String),
  scientificNames: Schema.NullOr(Schema.String),
  temperatureMax: Schema.NullOr(Schema.Number),
  temperatureMin: Schema.NullOr(Schema.Number),
})
export type VegetableRow = typeof VegetableRow.Type

/** Vegetable translation row */
export const VegetableTranslationRow = Schema.Struct({
  commonNames: Schema.String,
  content: Schema.NullOr(Schema.String),
  grammaticalGender: Schema.NullOr(Schema.String),
  locale: Locale,
  origin: Schema.NullOr(Schema.String),
  searchableNames: Schema.NullOr(Schema.String),
  vegetableId: VegetableId,
})
export type VegetableTranslationRow = typeof VegetableTranslationRow.Type
