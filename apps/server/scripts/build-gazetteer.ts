#!/usr/bin/env npx tsx
/**
 * Builds the gazetteer database from Who's On First's per-country admin databases.
 *
 * Usage: pnpm --filter @gororobas/server gazetteer:build --countries co,br [--output data/gazetteer.db]
 *
 * Downloads are cached in `data/gazetteer-sources/`. Who's On First data is CC BY: see
 * https://whosonfirst.org/docs/licenses/ and credit it wherever places are shown.
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { SqliteClient } from "@effect/sql-sqlite-node"
import {
  AreaGeometry,
  type GazetteerPlaceKind,
  simplifyArea,
  type SupportedLanguage,
  toSearchableText,
} from "@gororobas/domain"
import { TursoClient } from "@gororobas/effect-sql-turso"
import {
  Array as EffectArray,
  Effect,
  FileSystem,
  Option,
  Order,
  Path,
  pipe,
  Record,
  Schema,
  String as EffectString,
} from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import * as Reactivity from "effect/reactivity/Reactivity"
import { SqlClient, SqlError, SqlSchema } from "effect/sql"

import { createGazetteerSchema } from "../src/places/gazetteer-schema.js"
import {
  type GazetteerPlaceInput,
  type GazetteerPlaceName,
  insertGazetteerPlace,
} from "../src/places/gazetteer-writer.js"
import { gazetteerSqlClientConfig } from "../src/places/gazetteer.js"

class GazetteerBuildError extends Schema.TaggedError<GazetteerBuildError>()("GazetteerBuildError", {
  message: Schema.String,
}) {}

const SOURCES_DIRECTORY = "data/gazetteer-sources"
const DEFAULT_OUTPUT = "data/gazetteer.db"
const sourceUrl = (country: string) =>
  `https://data.geocode.earth/wof/dist/sqlite/whosonfirst-data-admin-${country}-latest.db.bz2`

const KIND_BY_PLACETYPE = {
  country: "COUNTRY",
  region: "STATE",
  county: "MUNICIPALITY",
} as const satisfies Record.ReadonlyRecord<string, GazetteerPlaceKind>

/** Degrees; about 2 km, 500 m and 100 m near the equator. Only display uses simplified shapes. */
const SIMPLIFICATION_TOLERANCE = {
  COUNTRY: 0.02,
  STATE: 0.005,
  MUNICIPALITY: 0.001,
} satisfies Record.ReadonlyRecord<GazetteerPlaceKind, number>

const LANGUAGE_BY_WOF_LANGUAGE = {
  por: "pt",
  spa: "es",
  eng: "en",
} as const satisfies Record.ReadonlyRecord<string, SupportedLanguage>

const PORTUGUESE_SPEAKING: ReadonlyArray<string> = ["BR", "PT"]

const SPANISH_SPEAKING: ReadonlyArray<string> = [
  "AR",
  "BO",
  "CL",
  "CO",
  "EC",
  "ES",
  "MX",
  "PE",
  "PY",
  "UY",
  "VE",
]

/** The language places are named in locally; other countries fall back to English names. */
const localLanguageOf = (countryCode: string): SupportedLanguage =>
  PORTUGUESE_SPEAKING.includes(countryCode)
    ? "pt"
    : SPANISH_SPEAKING.includes(countryCode)
      ? "es"
      : "en"

const nonAsciiCount = (text: string) => Array.from(text).filter((char) => char > "\u007f").length

/**
 * Who's On First's preferred names sometimes drop accents ("Boyaca"). Among the names that fold
 * to the same text, keep the most accented one.
 */
const bestSpelling = (preferred: string, candidates: ReadonlyArray<string>) =>
  candidates
    .filter((candidate) => toSearchableText(candidate) === toSearchableText(preferred))
    .reduce(
      (best, candidate) => (nonAsciiCount(candidate) > nonAsciiCount(best) ? candidate : best),
      preferred,
    )

const SpatialRow = Schema.Struct({
  id: Schema.Finite,
  name: Schema.String,
  placetype: Schema.Literals(["country", "region", "county"]),
  country: Schema.String,
})

type SpatialRow = typeof SpatialRow.Type

const NameRow = Schema.Struct({
  id: Schema.Finite,
  language: Schema.Literals(["por", "spa", "eng"]),
  privateuse: Schema.String,
  name: Schema.String,
})

const ConcordanceRow = Schema.Struct({
  id: Schema.Finite,
  otherSource: Schema.Literals(["wd:id", "gn:id"]),
  otherId: Schema.String,
})

const AncestorRow = Schema.Struct({
  id: Schema.Finite,
  ancestorId: Schema.Finite,
  ancestorPlacetype: Schema.Literals(["region", "country"]),
})

const AliasRow = Schema.Struct({ municipalityId: Schema.Finite, name: Schema.String })

/** Points and invalid outlines don't decode: only places with an area are kept. */
const GeometryBody = Schema.fromJsonString(Schema.Struct({ geometry: AreaGeometry }))

const run = ({ command, args }: Readonly<{ command: string; args: ReadonlyArray<string> }>) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const exitCode = yield* spawner.exitCode(
      ChildProcess.make(command, args, { stdout: "inherit", stderr: "inherit" }),
    )
    if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
      return yield* new GazetteerBuildError({ message: `${command} exited with code ${exitCode}` })
    }
  })

const downloadSource = (country: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const database = path.join(SOURCES_DIRECTORY, `whosonfirst-data-admin-${country}-latest.db`)
    if (yield* fs.exists(database)) {
      yield* Effect.log(`Using cached ${database}`)
      return database
    }

    yield* fs.makeDirectory(SOURCES_DIRECTORY, { recursive: true })
    yield* Effect.log(`Downloading ${sourceUrl(country)}`)

    yield* run({
      command: "curl",
      args: [
        "--fail",
        "--location",
        "--silent",
        "--show-error",
        "--output",
        `${database}.bz2`,
        sourceUrl(country),
      ],
    })

    yield* run({ command: "bunzip2", args: [`${database}.bz2`] })
    return database
  })

const query = <A extends Schema.Top>(
  Result: A,
  statement: (sql: SqlClient.SqlClient) => Effect.Effect<ReadonlyArray<unknown>, SqlError.SqlError>,
) =>
  SqlSchema.findAll({
    Request: Schema.Void,
    Result,
    execute: () => SqlClient.SqlClient.use(statement),
  })()

const byId = <A>(rows: ReadonlyArray<A>, id: (row: A) => number) =>
  EffectArray.groupBy(rows, (row) => String(id(row)))

/** Reads one country's places from its Who's On First database, handing each to `write`. */
const readCountry = <E, R>({
  country,
  write,
}: Readonly<{
  country: string
  write: (place: GazetteerPlaceInput) => Effect.Effect<void, E, R>
}>) =>
  Effect.gen(function* () {
    const countryCode = country.toUpperCase()
    const localLanguage = localLanguageOf(countryCode)
    const current = (sql: SqlClient.SqlClient) =>
      sql`is_current != 0 AND is_deprecated = 0 AND is_superseded = 0`

    const places = yield* query(
      SpatialRow,
      (sql) => sql`
        SELECT id, name, placetype, country FROM spr
        WHERE placetype IN ('country', 'region', 'county') AND ${current(sql)}
      `,
    )

    const keptIds = Record.fromEntries(places.map((place) => [String(place.id), true] as const))

    const names = byId(
      yield* query(
        NameRow,
        (sql) => sql`
          SELECT n.id, n.language, n.privateuse, n.name FROM names n
          JOIN spr s ON s.id = n.id AND s.placetype IN ('country', 'region', 'county')
          WHERE n.language IN ('por', 'spa', 'eng') AND n.privateuse IN ('preferred', 'variant')
        `,
      ),
      (row) => row.id,
    )

    // Who's On First sometimes places towns named after other municipalities inside a
    // municipality; an alias never shadows a place's own name.
    const placeFoldedNames = Record.fromEntries(
      [
        ...places.map((place) => place.name),
        ...Record.values(names).flatMap((rows) => rows.map((row) => row.name)),
      ].map((name) => [toSearchableText(name), true] as const),
    )

    const concordances = byId(
      yield* query(
        ConcordanceRow,
        (sql) => sql`
          SELECT id, other_source, other_id FROM concordances
          WHERE other_source IN ('wd:id', 'gn:id')
        `,
      ),
      (row) => row.id,
    )

    const ancestors = byId(
      yield* query(
        AncestorRow,
        (sql) => sql`
          SELECT id, ancestor_id, ancestor_placetype FROM ancestors
          WHERE ancestor_placetype IN ('region', 'country') AND id != ancestor_id
        `,
      ),
      (row) => row.id,
    )

    // Towns are points in Who's On First; they're searchable as aliases of their municipality.
    const aliases = byId(
      yield* query(
        AliasRow,
        (sql) => sql`
          SELECT a.ancestor_id AS municipality_id, s.name FROM spr s
          JOIN ancestors a ON a.id = s.id AND a.ancestor_placetype = 'county'
          WHERE s.placetype = 'locality' AND s.name IS NOT NULL AND ${current(sql)}
        `,
      ),
      (row) => row.municipalityId,
    )

    const findGeometry = (place: SpatialRow) =>
      Effect.map(
        query(
          Schema.Struct({ body: Schema.String }),
          (sql) => sql`SELECT body FROM geojson WHERE id = ${place.id} AND is_alt = 0`,
        ),
        (bodies) =>
          EffectArray.findFirst(bodies, (row) =>
            Option.map(Schema.decodeOption(GeometryBody)(row.body), (body) => body.geometry),
          ),
      )

    const toInput = (place: SpatialRow, geometry: AreaGeometry): GazetteerPlaceInput => {
      const placeKind = KIND_BY_PLACETYPE[place.placetype]
      const placeNames = names[String(place.id)] ?? []
      const localNames = placeNames.filter(
        (name) => LANGUAGE_BY_WOF_LANGUAGE[name.language] === localLanguage,
      )
      const preferredLocal = localNames.find((name) => name.privateuse === "preferred")?.name

      const displayName =
        preferredLocal === undefined
          ? place.name
          : bestSpelling(
              preferredLocal,
              localNames.map((name) => name.name),
            )

      const concordance = (source: "wd:id" | "gn:id") =>
        (concordances[String(place.id)] ?? []).find((row) => row.otherSource === source)?.otherId

      // Regions first, then the country: one of each, from the parent up.
      const ancestorIds = EffectArray.dedupeWith(
        EffectArray.sort(
          (ancestors[String(place.id)] ?? []).filter(
            (ancestor) => keptIds[String(ancestor.ancestorId)] === true,
          ),
          Order.mapInput(Order.Number, (ancestor: typeof AncestorRow.Type) =>
            ancestor.ancestorPlacetype === "region" ? 0 : 1,
          ),
        ),
        (a: typeof AncestorRow.Type, b: typeof AncestorRow.Type) =>
          a.ancestorPlacetype === b.ancestorPlacetype,
      ).map((ancestor) => ancestor.ancestorId)

      const languageNames = placeNames.map((name): GazetteerPlaceName => ({
        language: LANGUAGE_BY_WOF_LANGUAGE[name.language],
        name: name.name,
        isPreferred: name.privateuse === "preferred",
        isAlias: false,
      }))

      const aliasNames = (aliases[String(place.id)] ?? [])
        .filter((alias) => placeFoldedNames[toSearchableText(alias.name)] !== true)
        .map((alias): GazetteerPlaceName => ({
          language: null,
          name: alias.name,
          isPreferred: false,
          isAlias: true,
        }))

      return {
        id: place.id,
        placeKind,
        countryCode,
        name: displayName,
        geometry,
        simplifiedGeometry: simplifyArea(geometry, SIMPLIFICATION_TOLERANCE[placeKind]),
        wikidataId: concordance("wd:id") ?? null,
        geonamesId: concordance("gn:id")?.replace(/\.0$/, "") ?? null,
        names: [
          { language: localLanguage, name: displayName, isPreferred: true, isAlias: false },
          ...languageNames,
          ...aliasNames,
        ],
        ancestorIds,
      }
    }

    const written = yield* Effect.forEach(
      places,
      (place) =>
        Effect.gen(function* () {
          const geometry = yield* findGeometry(place)
          if (Option.isNone(geometry)) {
            yield* Effect.logWarning(`Skipping ${place.name} (${place.id}): no polygon`)
            return 0
          }
          const input = toInput(place, geometry.value)
          yield* write(input)
          return input.names.length
        }),
      { concurrency: 1 },
    )

    const placeCount = written.filter((nameCount) => nameCount > 0).length
    yield* Effect.log(
      `${countryCode}: ${placeCount} places, ${written.reduce((sum, count) => sum + count, 0)} names`,
    )
    return placeCount
  })

const parseArguments = Effect.gen(function* () {
  const args = process.argv.slice(2)
  const valueOf = (flag: string) => {
    const index = args.indexOf(flag)
    return index === -1 ? undefined : args[index + 1]
  }
  const countries = (valueOf("--countries") ?? "")
    .split(",")
    .map((country) => country.trim().toLowerCase())
    .filter((country) => /^[a-z]{2}$/.test(country))

  return yield* EffectArray.match(countries, {
    onEmpty: () =>
      Effect.fail(
        new GazetteerBuildError({
          message: "Usage: build-gazetteer.ts --countries co,br [--output data/gazetteer.db]",
        }),
      ),
    onNonEmpty: (selected) =>
      Effect.succeed({ countries: selected, output: valueOf("--output") ?? DEFAULT_OUTPUT }),
  })
})

const program = Effect.gen(function* () {
  const { countries, output } = yield* parseArguments
  const fs = yield* FileSystem.FileSystem
  const building = `${output}.building`
  const sidecars = (database: string) => [`${database}-wal`, `${database}-shm`]

  const removeAll = (files: ReadonlyArray<string>) =>
    Effect.forEach(files, (file) => fs.remove(file, { force: true }), {
      concurrency: 1,
      discard: true,
    })

  yield* removeAll([building, ...sidecars(building)])

  const placeCounts = yield* Effect.scoped(
    Effect.gen(function* () {
      const outputSql = yield* TursoClient.make({
        ...gazetteerSqlClientConfig(building),
        readonly: false,
      })
      const intoOutput = Effect.provideService(SqlClient.SqlClient, outputSql)
      yield* intoOutput(createGazetteerSchema)

      return yield* Effect.forEach(
        countries,
        (country) =>
          Effect.gen(function* () {
            const sourceSql = yield* SqliteClient.make({
              filename: yield* downloadSource(country),
              readonly: true,
              transformResultNames: EffectString.snakeToCamel,
            })

            return yield* outputSql.withTransaction(
              readCountry({
                country,
                write: (place) => intoOutput(insertGazetteerPlace(place)),
              }).pipe(Effect.provideService(SqlClient.SqlClient, sourceSql)),
            )
          }),
        { concurrency: 1 },
      )
    }),
  ).pipe(Effect.provide(Reactivity.layer))

  yield* removeAll([output, ...sidecars(output)])
  yield* fs.rename(building, output)
  yield* removeAll(sidecars(building))
  yield* Effect.log(
    `Wrote ${placeCounts.reduce((sum, count) => sum + count, 0)} places to ${output}`,
  )
})

pipe(program, Effect.provide(NodeServices.layer), NodeRuntime.runMain)
