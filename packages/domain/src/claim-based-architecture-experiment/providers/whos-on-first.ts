/**
 * Reading Who's On First (https://whosonfirst.org) places in a property's `extract`.
 *
 * The gazetteer (`apps/server/scripts/build-gazetteer.ts`) keeps the countries, states and
 * municipalities people pick their location from in its own read-only database, so the "fetch" is
 * a lookup in it by `whosOnFirstId`. A place becomes a PLACE article the first time a profile
 * location references it: creating it is extracting from its record into a new article.
 */
import { Option, Result, Schema } from "effect"

import { SupportedLanguage } from "../../common/enums.js"
import { GeoNamesId, WhosOnFirstId, WikidataId } from "../../common/external-identifiers.js"
import type { WikiArticleId } from "../../common/ids.js"
import { NonEmptyTrimmedString } from "../../common/primitives.js"
import { GazetteerPlaceKind } from "../../places/domain.js"
import type { ExtractionContext, ExtractionIssue } from "../extraction.js"

export const WhosOnFirstName = Schema.Struct({
  /** `null` for aliases. */
  language: Schema.NullOr(SupportedLanguage),
  name: NonEmptyTrimmedString,
  /** Who's On First's preferred name in its language; the others are variants. */
  isPreferred: Schema.Boolean,
  /** A town within the place, which Who's On First has only as a point: searchable as the place. */
  isAlias: Schema.Boolean,
})

export type WhosOnFirstName = typeof WhosOnFirstName.Type

/** One place of the gazetteer, as the gazetteer stores it: what extractors read. */
export const WhosOnFirstPlace = Schema.Struct({
  id: WhosOnFirstId,
  placeKind: GazetteerPlaceKind,
  names: Schema.Array(WhosOnFirstName),
  /** Who's On First's concordances, which people don't need to confirm. */
  wikidataId: Schema.NullOr(WikidataId),
  geonamesId: Schema.NullOr(GeoNamesId),
  /** The places it's in, closest first: Villa de Leyva → [Boyacá, Colombia]. */
  ancestorIds: Schema.Array(WhosOnFirstId),
})

export type WhosOnFirstPlace = typeof WhosOnFirstPlace.Type

export const WhosOnFirst = {
  /**
   * The place's names in each language, the preferred one first. Aliases name towns within the
   * place, not the place, so they're left out.
   */
  names: (
    place: WhosOnFirstPlace,
  ): ReadonlyArray<{ readonly language: SupportedLanguage; readonly value: string }> =>
    [
      ...place.names.filter(({ isPreferred }) => isPreferred),
      ...place.names.filter(({ isPreferred }) => !isPreferred),
    ].flatMap(({ language, name, isAlias }) =>
      language === null || isAlias ? [] : [{ language, value: name }],
    ),

  /**
   * A place it's in, as our article for it. The gazetteer creates ancestors' articles before
   * their descendants', so a missing one is a bug, not an article suggestion.
   */
  article: (
    whosOnFirstId: WhosOnFirstId,
    context: ExtractionContext,
  ): Result.Result<WikiArticleId, ExtractionIssue> =>
    Option.match(context.articleWithWhosOnFirstId(whosOnFirstId), {
      onSome: Result.succeed,
      onNone: () => Result.fail({ _tag: "UNMATCHED_PLACE", whosOnFirstId } as const),
    }),
}
