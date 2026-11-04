/**
 * Searches and resolves gazetteer places, from a read-only database separate from the app's.
 *
 * Its own SQL client keeps it out of the app's transactions and migrations: it's rebuilt from
 * Who's On First by `scripts/build-gazetteer.ts`.
 */
import {
  type Coordinates,
  GazetteerPlace,
  GazetteerPlaceAncestor,
  GazetteerPlaceKind,
  type GazetteerPlaceSummary,
  AreaGeometry,
  areaContains,
  toSearchableText,
  CountryCode,
  GeoNamesId,
  SupportedLanguage,
  WhosOnFirstId,
  WikidataId,
} from "@gororobas/domain"
import { TursoClient } from "@gororobas/effect-sql-turso"
import {
  Array as EffectArray,
  Context,
  Effect,
  Layer,
  Option,
  Order,
  Record,
  Result,
  Schema,
  String as EffectString,
} from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import { SqlClient, SqlSchema } from "effect/sql"

/** The gazetteer database's own SQL client, kept apart from the app's `SqlClient`. */
export class GazetteerSql extends Context.Service<GazetteerSql, SqlClient.SqlClient>()(
  "GazetteerSql",
) {}

export const gazetteerSqlClientConfig = (filename: string): TursoClient.TursoClientConfig => ({
  filename,
  readonly: filename !== ":memory:",
  transformResultNames: EffectString.snakeToCamel,
  transformQueryNames: EffectString.camelToSnake,
  spanAttributes: { "db.system": "sqlite", "db.name": "gazetteer" },
})

export const makeGazetteerSql = (filename: string) =>
  Layer.effect(GazetteerSql, TursoClient.make(gazetteerSqlClientConfig(filename))).pipe(
    Layer.provide(Reactivity.layer),
  )

/** The names a place is known by in each language, for naming its PLACE article. */
export interface GazetteerPlaceRecord {
  readonly id: WhosOnFirstId
  readonly placeKind: GazetteerPlaceKind
  readonly countryCode: CountryCode
  readonly name: string
  readonly namesByLanguage: Partial<Record.ReadonlyRecord<SupportedLanguage, string>>
  readonly wikidataId: Option.Option<WikidataId>
  readonly geonamesId: Option.Option<GeoNamesId>
  /** From the closest ancestor to the country. */
  readonly ancestorIds: ReadonlyArray<WhosOnFirstId>
}

export interface GazetteerSearchInput {
  readonly text: string
  /** Countries whose places rank first, in order of preference. Never filters. */
  readonly countryBias: ReadonlyArray<CountryCode>
  readonly language: SupportedLanguage
  readonly limit?: number
}

const PlaceRow = Schema.Struct({
  id: WhosOnFirstId,
  placeKind: GazetteerPlaceKind,
  countryCode: CountryCode,
  name: Schema.String,
})

const AncestorRow = Schema.Struct({
  placeId: WhosOnFirstId,
  ...GazetteerPlaceAncestor.fields,
})

const NameMatchRow = Schema.Struct({
  placeId: WhosOnFirstId,
  name: Schema.String,
  foldedName: Schema.String,
  isAlias: Schema.BooleanFromBit,
})

const GeometryRow = Schema.Struct({
  id: WhosOnFirstId,
  minLongitude: Schema.Finite,
  minLatitude: Schema.Finite,
  maxLongitude: Schema.Finite,
  maxLatitude: Schema.Finite,
  simplifiedGeometry: Schema.fromJsonString(AreaGeometry),
})

const kindPrecision: Record.ReadonlyRecord<GazetteerPlaceKind, number> = {
  MUNICIPALITY: 0,
  STATE: 1,
  COUNTRY: 2,
}

/**
 * Exact names first, then names starting with the text, then names with a word starting with it.
 * Towns within a place (aliases) rank after every match on places' own names.
 */
const matchRank = (
  match: { readonly foldedName: string; readonly isAlias: boolean },
  foldedText: string,
) =>
  (match.foldedName === foldedText ? 0 : match.foldedName.startsWith(foldedText) ? 1 : 2) +
  (match.isAlias ? 3 : 0)

/** Countries are named in the reader's language; other places keep their local names. */
const localizedName = (sql: SqlClient.SqlClient, language: SupportedLanguage) => sql`
  CASE WHEN p.place_kind = 'COUNTRY' THEN COALESCE(
    (SELECT n.name FROM gazetteer_place_names n
      WHERE n.place_id = p.id AND n.language = ${language} AND n.is_preferred = 1 LIMIT 1),
    p.name) ELSE p.name END
`

const toIntegers = (ids: ReadonlyArray<string>) => ids.map(Number)

const makeGazetteer = Effect.gen(function* () {
  const sql = yield* GazetteerSql
  const provide = Effect.provideService(SqlClient.SqlClient, sql)

  const findPlaceRows = SqlSchema.findAll({
    Request: Schema.Struct({
      ids: Schema.Array(WhosOnFirstId),
      language: SupportedLanguage,
    }),
    Result: PlaceRow,
    execute: ({ ids, language }) => sql`
      SELECT CAST(p.id AS TEXT) AS id, p.place_kind, p.country_code, ${localizedName(sql, language)} AS name
      FROM gazetteer_places p WHERE p.id IN ${sql.in(toIntegers(ids))}
    `,
  })

  const findAncestorRows = SqlSchema.findAll({
    Request: Schema.Struct({
      ids: Schema.Array(WhosOnFirstId),
      language: SupportedLanguage,
    }),
    Result: AncestorRow,
    execute: ({ ids, language }) => sql`
      SELECT CAST(a.place_id AS TEXT) AS place_id, CAST(p.id AS TEXT) AS id, p.place_kind,
        ${localizedName(sql, language)} AS name
      FROM gazetteer_place_ancestors a JOIN gazetteer_places p ON p.id = a.ancestor_id
      WHERE a.place_id IN ${sql.in(toIntegers(ids))}
      ORDER BY a.place_id, a.depth
    `,
  })

  const summarize = ({
    ids,
    language,
    matchedNames = {},
  }: Readonly<{
    ids: ReadonlyArray<WhosOnFirstId>
    language: SupportedLanguage
    /** Names searches matched, by place, when they aren't the place's own. */
    matchedNames?: Record.ReadonlyRecord<WhosOnFirstId, string>
  }>) =>
    EffectArray.match(ids, {
      onEmpty: () =>
        Effect.succeed<Record.ReadonlyRecord<WhosOnFirstId, GazetteerPlaceSummary>>({}),
      onNonEmpty: (placeIds) =>
        Effect.gen(function* () {
          const places = yield* findPlaceRows({ ids: placeIds, language })
          const ancestors = EffectArray.groupBy(
            yield* findAncestorRows({ ids: placeIds, language }),
            (row) => row.placeId,
          )

          return Record.fromEntries(
            places.map((place): readonly [WhosOnFirstId, GazetteerPlaceSummary] => [
              place.id,
              {
                id: place.id,
                placeKind: place.placeKind,
                name: place.name,
                countryCode: place.countryCode,
                ancestors: (ancestors[place.id] ?? []).map(({ id, placeKind, name }) => ({
                  id,
                  placeKind,
                  name,
                })),
                matchedName: matchedNames[place.id] ?? null,
              },
            ]),
          )
        }),
    })

  const findGeometryRows = SqlSchema.findAll({
    Request: Schema.Array(WhosOnFirstId),
    Result: GeometryRow,
    execute: (ids) => sql`
      SELECT CAST(id AS TEXT) AS id, min_longitude, min_latitude, max_longitude, max_latitude,
        simplified_geometry
      FROM gazetteer_places WHERE id IN ${sql.in(toIntegers(ids))}
    `,
  })

  const findPlaces = ({
    ids,
    language,
  }: Readonly<{ ids: ReadonlyArray<WhosOnFirstId>; language: SupportedLanguage }>) =>
    EffectArray.match(ids, {
      onEmpty: () => Effect.succeed<Record.ReadonlyRecord<WhosOnFirstId, GazetteerPlace>>({}),
      onNonEmpty: (placeIds) =>
        Effect.gen(function* () {
          const summaries = yield* summarize({ ids: placeIds, language })
          const geometries = yield* findGeometryRows(placeIds)

          return Record.fromEntries(
            geometries.flatMap(
              ({
                id,
                simplifiedGeometry,
                ...boundingBox
              }): ReadonlyArray<readonly [WhosOnFirstId, GazetteerPlace]> => {
                const summary = summaries[id]

                return summary === undefined
                  ? []
                  : [
                      [
                        id,
                        GazetteerPlace.make({
                          ...summary,
                          boundingBox,
                          geometry: simplifiedGeometry,
                        }),
                      ],
                    ]
              },
            ),
          )
        }),
    })

  const findPlace = (id: WhosOnFirstId, language: SupportedLanguage) =>
    findPlaces({ ids: [id], language }).pipe(
      Effect.map((places) => Option.fromNullishOr(places[id])),
    )

  const findNameMatches = SqlSchema.findAll({
    Request: Schema.String,
    Result: NameMatchRow,
    execute: (foldedText) => sql`
      SELECT CAST(place_id AS TEXT) AS place_id, name, folded_name, is_alias
      FROM gazetteer_place_names
      WHERE instr(' ' || folded_name, ${` ${foldedText}`}) > 0
      LIMIT 1000
    `,
  })

  const findMunicipalitiesAround = SqlSchema.findAll({
    Request: Schema.Struct({ latitude: Schema.Finite, longitude: Schema.Finite }),
    Result: Schema.Struct({
      id: WhosOnFirstId,
      geometry: Schema.fromJsonString(AreaGeometry),
    }),
    execute: ({ latitude, longitude }) => sql`
      SELECT CAST(id AS TEXT) AS id, geometry FROM gazetteer_places
      WHERE place_kind = 'MUNICIPALITY'
        AND min_latitude <= ${latitude} AND max_latitude >= ${latitude}
        AND min_longitude <= ${longitude} AND max_longitude >= ${longitude}
    `,
  })

  const findRecordRow = SqlSchema.findOneOption({
    Request: WhosOnFirstId,
    Result: Schema.Struct({
      ...PlaceRow.fields,
      wikidataId: Schema.NullOr(WikidataId),
      geonamesId: Schema.NullOr(GeoNamesId),
    }),
    execute: (id) => sql`
      SELECT CAST(id AS TEXT) AS id, place_kind, country_code, name, wikidata_id, geonames_id
      FROM gazetteer_places WHERE id = ${Number(id)}
    `,
  })

  const findPreferredNames = SqlSchema.findAll({
    Request: WhosOnFirstId,
    Result: Schema.Struct({ language: SupportedLanguage, name: Schema.String }),
    execute: (id) => sql`
      SELECT language, name FROM gazetteer_place_names
      WHERE place_id = ${Number(id)} AND is_preferred = 1 AND language IS NOT NULL
    `,
  })

  const findAncestorIds = SqlSchema.findAll({
    Request: WhosOnFirstId,
    Result: Schema.Struct({ ancestorId: WhosOnFirstId }),
    execute: (id) => sql`
      SELECT CAST(ancestor_id AS TEXT) AS ancestor_id FROM gazetteer_place_ancestors
      WHERE place_id = ${Number(id)} ORDER BY depth
    `,
  })

  return {
    search: Effect.fn("gazetteer.search")(
      function* ({ text, countryBias, language, limit = 10 }: GazetteerSearchInput) {
        const foldedText = toSearchableText(text)
        if (foldedText === "") return []

        const bestMatchByPlace = (yield* findNameMatches(foldedText)).reduce<
          Record.ReadonlyRecord<WhosOnFirstId, { rank: number; name: string; isAlias: boolean }>
        >((best, match) => {
          const rank = matchRank(match, foldedText)
          const current = best[match.placeId]
          return current !== undefined && current.rank <= rank
            ? best
            : { ...best, [match.placeId]: { rank, name: match.name, isAlias: match.isAlias } }
        }, {})

        const summaries = yield* summarize({
          ids: Record.keys(bestMatchByPlace),
          language,
          matchedNames: Record.filterMap(bestMatchByPlace, (match) =>
            match.isAlias ? Result.succeed(match.name) : Result.failVoid,
          ),
        })

        const countryPreference = (countryCode: CountryCode) => {
          const index = countryBias.indexOf(countryCode)
          return index === -1 ? countryBias.length : index
        }

        return EffectArray.sort(
          Record.values(summaries),
          Order.combineAll<GazetteerPlaceSummary>([
            Order.mapInput(Order.Number, (place) => bestMatchByPlace[place.id]?.rank ?? 5),
            Order.mapInput(Order.Number, (place) => countryPreference(place.countryCode)),
            Order.mapInput(Order.Number, (place) => kindPrecision[place.placeKind]),
            Order.mapInput(Order.String, (place) => place.name),
          ]),
        ).slice(0, limit)
      },
      (_) => provide(_),
    ),

    findSummaries: (
      input: Readonly<{ ids: ReadonlyArray<WhosOnFirstId>; language: SupportedLanguage }>,
    ) => summarize(input).pipe(provide, Effect.withSpan("gazetteer.findSummaries")),

    findPlaces: (
      input: Readonly<{ ids: ReadonlyArray<WhosOnFirstId>; language: SupportedLanguage }>,
    ) => findPlaces(input).pipe(provide, Effect.withSpan("gazetteer.findPlaces")),

    findPlace: (id: WhosOnFirstId, language: SupportedLanguage) =>
      findPlace(id, language).pipe(provide, Effect.withSpan("gazetteer.findPlace")),

    /** The municipality containing the coordinates. The coordinates aren't kept or logged. */
    findMunicipalityContaining: Effect.fn("gazetteer.findMunicipalityContaining")(
      function* (coordinates: Coordinates, language: SupportedLanguage) {
        const candidates = yield* findMunicipalitiesAround(coordinates)
        const containing = candidates.find((candidate) =>
          areaContains(candidate.geometry, coordinates),
        )
        return containing === undefined
          ? Option.none<GazetteerPlace>()
          : yield* findPlace(containing.id, language)
      },
      (_) => provide(_),
    ),

    findRecord: Effect.fn("gazetteer.findRecord")(
      function* (id: WhosOnFirstId) {
        const row = yield* findRecordRow(id)
        if (Option.isNone(row)) return Option.none<GazetteerPlaceRecord>()
        const names = yield* findPreferredNames(id)
        const ancestors = yield* findAncestorIds(id)

        return Option.some<GazetteerPlaceRecord>({
          id: row.value.id,
          placeKind: row.value.placeKind,
          countryCode: row.value.countryCode,
          name: row.value.name,
          namesByLanguage: Record.fromEntries(names.map(({ language, name }) => [language, name])),
          wikidataId: Option.fromNullishOr(row.value.wikidataId),
          geonamesId: Option.fromNullishOr(row.value.geonamesId),
          ancestorIds: ancestors.map((ancestor) => ancestor.ancestorId),
        })
      },
      (_) => provide(_),
    ),
  }
})

export class Gazetteer extends Context.Service<Gazetteer, Effect.Success<typeof makeGazetteer>>()(
  "Gazetteer",
) {}

export const GazetteerFromSql = Layer.effect(Gazetteer, makeGazetteer)
