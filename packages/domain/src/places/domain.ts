/**
 * Gazetteer places: the administrative places people pick when sharing where they are.
 * They come from Who's On First and live in their own read-only database; the first time one is
 * referenced, it becomes a PLACE wiki article.
 */
import { Schema } from "effect"

import { PlaceKind } from "../common/enums.js"
import { CountryCode, WhosOnFirstId } from "../common/external-identifiers.js"
import { OptionalColumn } from "../common/primitives.js"
import { AreaGeometry, BoundingBox } from "./geometry.js"

/** The places people can pick. Municipalities are the finest detail anyone's location records. */
export const GazetteerPlaceKind = PlaceKind.pick(["COUNTRY", "STATE", "MUNICIPALITY"])
export type GazetteerPlaceKind = typeof GazetteerPlaceKind.Type

export const GazetteerPlaceAncestor = Schema.Struct({
  id: WhosOnFirstId,
  placeKind: GazetteerPlaceKind,
  name: Schema.String,
})

export type GazetteerPlaceAncestor = typeof GazetteerPlaceAncestor.Type

export const GazetteerPlaceSummary = Schema.Struct({
  id: WhosOnFirstId,
  placeKind: GazetteerPlaceKind,
  name: Schema.String,
  countryCode: CountryCode,
  /** From the closest ancestor to the country: Villa de Leyva → [Boyacá, Colombia]. */
  ancestors: Schema.Array(GazetteerPlaceAncestor),
  /** The town or alternative name the search matched, when it isn't the place's own name. */
  matchedName: Schema.NullOr(Schema.String),
})

export type GazetteerPlaceSummary = typeof GazetteerPlaceSummary.Type

export const GazetteerPlace = Schema.Struct({
  ...GazetteerPlaceSummary.fields,
  boundingBox: BoundingBox,
  /** Simplified for display; never precise enough to locate anyone within the place. */
  geometry: AreaGeometry,
})

export type GazetteerPlace = typeof GazetteerPlace.Type

export const PlaceOutline = Schema.Struct({
  name: Schema.String,
  boundingBox: BoundingBox,
  geometry: AreaGeometry,
})

export type PlaceOutline = typeof PlaceOutline.Type

/** A gazetteer place's outline, drawn inside its closest ancestor's so readers see where it lies. */
export const PlaceMap = Schema.Struct({
  place: PlaceOutline,
  /** None for countries, which the gazetteer places in nothing larger. */
  surroundings: OptionalColumn(PlaceOutline),
})

export type PlaceMap = typeof PlaceMap.Type

export const GazetteerSearchParams = Schema.Struct({
  text: Schema.Trimmed.check(Schema.isNonEmpty(), Schema.isMaxLength(100)),
})
export type GazetteerSearchParams = typeof GazetteerSearchParams.Type

/** "Villa de Leyva · Boyacá · Colombia" */
export const gazetteerPlaceLabel = (place: Pick<GazetteerPlaceSummary, "name" | "ancestors">) =>
  [place.name, ...place.ancestors.map((ancestor) => ancestor.name)].join(" · ")
