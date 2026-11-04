import { Schema } from "effect"

import { SupportedLanguage } from "../../common/enums.js"
import { PaginationOptions } from "../../common/primitives.js"
import { PlaceMap, PlaceOutline } from "../../places/domain.js"
import { WikiPlaceArticle } from "../kinds/place.js"
import { WikiArticleQueriedCardData } from "../wiki-article.js"

/**
 * Places inside another are listed apart from its page, a page at a time: a state can hold
 * hundreds of municipalities.
 */
export const WikiPlacePageData = Schema.Struct({
  ...WikiPlaceArticle.QueriedPageData.fields,
  /** Published places containing this one, from its parent to the country. */
  ancestorPlaces: Schema.Array(WikiArticleQueriedCardData),
  /** Null for places that aren't in the gazetteer. */
  map: Schema.NullOr(PlaceMap),
})

export type WikiPlacePageData = typeof WikiPlacePageData.Type

/** A published place directly inside another, with its outline when the gazetteer has it. */
export const WikiChildPlace = Schema.Struct({
  card: WikiArticleQueriedCardData,
  outline: Schema.NullOr(PlaceOutline),
})

export type WikiChildPlace = typeof WikiChildPlace.Type

/** Each child carries its outline's geometry, so pages stay small. */
export const MAXIMUM_CHILD_PLACES_PAGE_SIZE = 12

export const WikiChildPlacesParams = Schema.Struct({
  language: SupportedLanguage,
  ...PaginationOptions.fields,
  pageSize: PaginationOptions.fields.pageSize.check(
    Schema.isLessThanOrEqualTo(MAXIMUM_CHILD_PLACES_PAGE_SIZE),
  ),
})

export type WikiChildPlacesParams = typeof WikiChildPlacesParams.Type

/** One page of a place's children, by name. */
export const WikiChildPlacesPage = Schema.Struct({
  places: Schema.Array(WikiChildPlace),
  /** Every published child, across pages. */
  totalCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})

export type WikiChildPlacesPage = typeof WikiChildPlacesPage.Type
