/**
 * Writes places into a gazetteer database: the build script's output and the in-memory fixture.
 */
import {
  AreaGeometry,
  geometryToBoundingBox,
  type GazetteerPlaceKind,
  type SupportedLanguage,
  toSearchableText,
} from "@gororobas/domain"
import { Array as EffectArray, Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"

export interface GazetteerPlaceName {
  /** `null` for aliases: towns within the place, which have no language of their own. */
  readonly language: SupportedLanguage | null
  readonly name: string
  readonly isPreferred: boolean
  readonly isAlias: boolean
}

export interface GazetteerPlaceInput {
  readonly id: number
  readonly placeKind: GazetteerPlaceKind
  readonly countryCode: string
  readonly name: string
  readonly geometry: AreaGeometry
  readonly simplifiedGeometry: AreaGeometry
  readonly wikidataId: string | null
  readonly geonamesId: string | null
  readonly names: ReadonlyArray<GazetteerPlaceName>
  /** From the parent up to the country. */
  readonly ancestorIds: ReadonlyArray<number>
}

/** Rows per statement, under SQLite's limit on bound parameters. */
const NAMES_PER_STATEMENT = 500

const encodeArea = Schema.encodeEffect(Schema.fromJsonString(AreaGeometry))

const nameKey = (name: GazetteerPlaceName) =>
  `${name.language}|${toSearchableText(name.name)}|${name.isPreferred}|${name.isAlias}`

export const insertGazetteerPlace = (place: GazetteerPlaceInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    yield* sql`INSERT INTO gazetteer_places ${sql.insert({
      id: place.id,
      placeKind: place.placeKind,
      countryCode: place.countryCode,
      name: place.name,
      ...geometryToBoundingBox(place.geometry),
      wikidataId: place.wikidataId,
      geonamesId: place.geonamesId,
      geometry: yield* encodeArea(place.geometry),
      simplifiedGeometry: yield* encodeArea(place.simplifiedGeometry),
    })}`

    // Search matches folded names, so names folding the same way are one row each.
    const names = EffectArray.dedupeWith(place.names, (a, b) => nameKey(a) === nameKey(b))

    yield* Effect.forEach(
      EffectArray.chunksOf(names, NAMES_PER_STATEMENT),
      (chunk) =>
        sql`INSERT INTO gazetteer_place_names ${sql.insert(
          EffectArray.map(chunk, (name) => ({
            placeId: place.id,
            language: name.language,
            name: name.name,
            foldedName: toSearchableText(name.name),
            isPreferred: name.isPreferred ? 1 : 0,
            isAlias: name.isAlias ? 1 : 0,
          })),
        )}`,
      { concurrency: 1, discard: true },
    )

    yield* EffectArray.match(place.ancestorIds, {
      onEmpty: () => Effect.void,
      onNonEmpty: (ancestorIds) =>
        sql`INSERT INTO gazetteer_place_ancestors ${sql.insert(
          EffectArray.map(ancestorIds, (ancestorId, index) => ({
            placeId: place.id,
            ancestorId,
            depth: index + 1,
          })),
        )}`,
    })
  })
