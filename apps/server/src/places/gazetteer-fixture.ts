/**
 * A small in-memory gazetteer for tests and the seeded API: two places named Madrid, a
 * municipality with a town inside it, and one place in each of Colombia, Spain and Brazil.
 *
 * Colombian IDs and bounds come from Who's On First; the others are made up, and Wikidata IDs are
 * only set where verified. Shapes are rough polygons around the real places.
 */
import type { AreaGeometry, BoundingBox } from "@gororobas/domain"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"

import { createGazetteerSchema } from "./gazetteer-schema.js"
import { type GazetteerPlaceInput, insertGazetteerPlace } from "./gazetteer-writer.js"
import { GazetteerFromSql, GazetteerSql, makeGazetteerSql } from "./gazetteer.js"

/** A box with one corner cut, so it has more vertices than its bounds. */
const roughBox = ({
  minLongitude,
  minLatitude,
  maxLongitude,
  maxLatitude,
}: BoundingBox): AreaGeometry => {
  const cut = (maxLongitude - minLongitude) / 4

  return {
    type: "Polygon",
    coordinates: [
      [
        [minLongitude, minLatitude],
        [maxLongitude - cut, minLatitude],
        [maxLongitude, minLatitude + cut],
        [maxLongitude, maxLatitude],
        [minLongitude, maxLatitude],
        [minLongitude, minLatitude],
      ],
    ],
  }
}

/** Named the same in every language, unless `names` gives a language its own preferred name. */
const place = (
  input: Omit<GazetteerPlaceInput, "simplifiedGeometry" | "names" | "geonamesId"> & {
    readonly names?: GazetteerPlaceInput["names"]
  },
): GazetteerPlaceInput => {
  const names = input.names ?? []
  const ownLanguages = names.filter((name) => name.isPreferred).map((name) => name.language)

  return {
    ...input,
    simplifiedGeometry: input.geometry,
    geonamesId: null,
    names: [
      ...(["pt", "es", "en"] as const)
        .filter((language) => !ownLanguages.includes(language))
        .map((language) => ({ language, name: input.name, isPreferred: true, isAlias: false })),
      ...names,
    ],
  }
}

export const FIXTURE_GAZETTEER_IDS = {
  colombia: "85632519",
  boyaca: "85670133",
  villaDeLeyva: "421170589",
  cundinamarca: "85670159",
  madridColombia: "421190823",
  spain: "900000001",
  communityOfMadrid: "900000002",
  madridSpain: "900000003",
  brazil: "900000004",
  minasGerais: "900000005",
  vicosa: "900000006",
} as const

/** Inside Villa de Leyva's municipality, near its main square. */
export const VILLA_DE_LEYVA_COORDINATES = { latitude: 5.6348, longitude: -73.549 } as const

export const FIXTURE_GAZETTEER_PLACES: ReadonlyArray<GazetteerPlaceInput> = [
  place({
    id: 85632519,
    placeKind: "COUNTRY",
    countryCode: "CO",
    name: "Colombia",
    names: [{ language: "pt", name: "Colômbia", isPreferred: true, isAlias: false }],
    geometry: roughBox({
      minLongitude: -81.74,
      minLatitude: -4.23,
      maxLongitude: -66.85,
      maxLatitude: 15.89,
    }),
    wikidataId: "Q739",
    ancestorIds: [],
  }),
  place({
    id: 85670133,
    placeKind: "STATE",
    countryCode: "CO",
    name: "Boyacá",
    geometry: roughBox({
      minLongitude: -74.66,
      minLatitude: 4.66,
      maxLongitude: -71.95,
      maxLatitude: 7.05,
    }),
    wikidataId: "Q121233",
    ancestorIds: [85632519],
  }),
  place({
    id: 421170589,
    placeKind: "MUNICIPALITY",
    countryCode: "CO",
    name: "Villa de Leyva",
    names: [
      { language: "es", name: "Leiva", isPreferred: false, isAlias: false },
      { language: null, name: "Salto y Bandera", isPreferred: false, isAlias: true },
    ],
    geometry: roughBox({
      minLongitude: -73.58,
      minLatitude: 5.6,
      maxLongitude: -73.42,
      maxLatitude: 5.73,
    }),
    wikidataId: "Q1409503",
    ancestorIds: [85670133, 85632519],
  }),
  place({
    id: 85670159,
    placeKind: "STATE",
    countryCode: "CO",
    name: "Cundinamarca",
    geometry: roughBox({
      minLongitude: -74.89,
      minLatitude: 3.73,
      maxLongitude: -73.05,
      maxLatitude: 5.84,
    }),
    wikidataId: null,
    ancestorIds: [85632519],
  }),
  place({
    id: 421190823,
    placeKind: "MUNICIPALITY",
    countryCode: "CO",
    name: "Madrid",
    geometry: roughBox({
      minLongitude: -74.33,
      minLatitude: 4.68,
      maxLongitude: -74.17,
      maxLatitude: 4.87,
    }),
    wikidataId: null,
    ancestorIds: [85670159, 85632519],
  }),
  place({
    id: 900000001,
    placeKind: "COUNTRY",
    countryCode: "ES",
    name: "España",
    names: [
      { language: "pt", name: "Espanha", isPreferred: true, isAlias: false },
      { language: "en", name: "Spain", isPreferred: true, isAlias: false },
    ],
    geometry: roughBox({
      minLongitude: -9.3,
      minLatitude: 36,
      maxLongitude: 3.33,
      maxLatitude: 43.79,
    }),
    wikidataId: "Q29",
    ancestorIds: [],
  }),
  place({
    id: 900000002,
    placeKind: "STATE",
    countryCode: "ES",
    name: "Comunidad de Madrid",
    geometry: roughBox({
      minLongitude: -4.58,
      minLatitude: 39.88,
      maxLongitude: -3.05,
      maxLatitude: 41.17,
    }),
    wikidataId: "Q5756",
    ancestorIds: [900000001],
  }),
  place({
    id: 900000003,
    placeKind: "MUNICIPALITY",
    countryCode: "ES",
    name: "Madrid",
    geometry: roughBox({
      minLongitude: -3.89,
      minLatitude: 40.31,
      maxLongitude: -3.52,
      maxLatitude: 40.64,
    }),
    wikidataId: "Q2807",
    ancestorIds: [900000002, 900000001],
  }),
  place({
    id: 900000004,
    placeKind: "COUNTRY",
    countryCode: "BR",
    name: "Brasil",
    names: [{ language: "en", name: "Brazil", isPreferred: true, isAlias: false }],
    geometry: roughBox({
      minLongitude: -73.99,
      minLatitude: -33.75,
      maxLongitude: -34.79,
      maxLatitude: 5.27,
    }),
    wikidataId: "Q155",
    ancestorIds: [],
  }),
  place({
    id: 900000005,
    placeKind: "STATE",
    countryCode: "BR",
    name: "Minas Gerais",
    geometry: roughBox({
      minLongitude: -51.05,
      minLatitude: -22.92,
      maxLongitude: -39.86,
      maxLatitude: -14.23,
    }),
    wikidataId: "Q39109",
    ancestorIds: [900000004],
  }),
  place({
    id: 900000006,
    placeKind: "MUNICIPALITY",
    countryCode: "BR",
    name: "Viçosa",
    geometry: roughBox({
      minLongitude: -42.96,
      minLatitude: -20.85,
      maxLongitude: -42.78,
      maxLatitude: -20.68,
    }),
    wikidataId: null,
    ancestorIds: [900000005, 900000004],
  }),
]

export const populateGazetteerFixture = Effect.andThen(
  createGazetteerSchema,
  Effect.forEach(FIXTURE_GAZETTEER_PLACES, insertGazetteerPlace, { concurrency: 1, discard: true }),
)

const GazetteerFixtureSql = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* GazetteerSql
    yield* populateGazetteerFixture.pipe(Effect.provideService(SqlClient.SqlClient, sql))
  }),
).pipe(Layer.provideMerge(makeGazetteerSql(":memory:")))

export const GazetteerFixture = GazetteerFromSql.pipe(Layer.provide(GazetteerFixtureSql))
