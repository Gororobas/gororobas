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
  chineseMedicineElement: Schema.NullOr(ChineseMedicineElement),
  developmentCycleMax: Schema.NullOr(Schema.Int),
  developmentCycleMin: Schema.NullOr(Schema.Int),
  edibleParts: Schema.NullOr(Schema.Array(EdibleVegetablePart)),
  handle: Handle,
  heightMax: Schema.NullOr(Schema.Int),
  heightMin: Schema.NullOr(Schema.Int),
  lifecycles: Schema.NullOr(Schema.Array(VegetableLifecycle)),
  mainPhotoId: Schema.NullOr(ImageId),
  plantingMethods: Schema.NullOr(Schema.Array(PlantingMethod)),
  scientificNames: Schema.NonEmptyArray(
    Schema.Struct({
      $cid: Schema.optional(Schema.String),
      value: Schema.Trimmed.check(Schema.isNonEmpty()),
    }),
  ),
  strata: Schema.NullOr(Schema.Array(AgroforestryStratum)),
  temperatureMax: Schema.NullOr(Schema.Number),
  temperatureMin: Schema.NullOr(Schema.Number),
  uses: Schema.NullOr(Schema.Array(VegetableUsage)),
})
export type VegetableMetadata = typeof VegetableMetadata.Type

export const VegetableLocalizedData = Schema.Struct({
  commonNames: Schema.Array(
    Schema.Struct({
      $cid: Schema.optional(Schema.String),
      value: Schema.Trimmed.check(Schema.isNonEmpty()),
    }),
  ),
  content: Schema.optional(Schema.NullOr(TiptapDocument)),
  grammaticalGender: GrammaticalGender.pipe(Schema.annotate({ default: "NEUTRAL" })),
  origin: Schema.optional(Schema.NullOr(Schema.String)),
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
    chineseMedicineElement: Schema.NullOr(
      Schema.fromJsonString(
        Schema.Array(Schema.NullOr(Schema.Literals(["COLD", "COOL", "NEUTRAL", "WARM", "HOT"]))),
      ),
    ),
    commonNames: Schema.fromJsonString(Schema.NonEmptyArray(Schema.String)),
    content: Schema.NullOr(Schema.fromJsonString(TiptapDocument)),
    developmentCycleMax: Schema.NullOr(Schema.Int),
    developmentCycleMin: Schema.NullOr(Schema.Int),
    edibleParts: Schema.NullOr(
      Schema.fromJsonString(
        Schema.Array(Schema.Literals(["BULB", "FLOWER", "FRUIT", "LEAF", "ROOT", "STEM", "SEED"])),
      ),
    ),
    grammaticalGender: Schema.Literals(["FEMININE", "MASCULINE", "NEUTRAL"]),
    heightMax: Schema.NullOr(Schema.Int),
    heightMin: Schema.NullOr(Schema.Int),
    lifecycles: Schema.NullOr(
      Schema.fromJsonString(Schema.Array(Schema.Literals(["ANNUAL", "BIENNIAL", "PERENNIAL"]))),
    ),
    locale: Locale,
    mainPhotoId: Schema.NullOr(Schema.String),
    origin: Schema.NullOr(Schema.String),
    plantingMethods: Schema.NullOr(
      Schema.fromJsonString(Schema.Array(Schema.Literals(["DIRECT_SOWING", "SEEDLING", "BOTH"]))),
    ),
    scientificNames: Schema.fromJsonString(Schema.NonEmptyArray(Schema.String)),
    strata: Schema.NullOr(
      Schema.fromJsonString(
        Schema.Array(Schema.Literals(["CANOPY", "UNDERSTORY", "HERBACEOUS", "RHIZOSPHERE"])),
      ),
    ),
    temperatureMax: Schema.NullOr(Schema.Number),
    temperatureMin: Schema.NullOr(Schema.Number),
    uses: Schema.NullOr(
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
  evaluatedAt: Schema.NullOr(TimestampColumn),
  evaluatedById: Schema.NullOr(PersonId),
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
