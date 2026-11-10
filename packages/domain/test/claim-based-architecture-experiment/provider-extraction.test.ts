import { describe, expect, it } from "@effect/vitest"
import { Array as EffectArray, Effect, Option, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

import { extractArticle } from "../../src/claim-based-architecture-experiment/article-extraction.js"
import type { ExtractionContext } from "../../src/claim-based-architecture-experiment/extraction.js"
import { articleToJsonLd } from "../../src/claim-based-architecture-experiment/json-ld.js"
import { DatePublishedProperty } from "../../src/claim-based-architecture-experiment/properties/date-published.js"
import { GbifTaxonIdProperty } from "../../src/claim-based-architecture-experiment/properties/gbif-taxon-id.js"
import { properties } from "../../src/claim-based-architecture-experiment/properties/index.js"
import { Name } from "../../src/claim-based-architecture-experiment/properties/names.js"
import type { PropertyExtraction } from "../../src/claim-based-architecture-experiment/property.js"
import { GbifResultWithImportedPhotos } from "../../src/claim-based-architecture-experiment/providers/index.js"
import { WhosOnFirstPlace } from "../../src/claim-based-architecture-experiment/providers/whos-on-first.js"
import {
  WikidataEntity,
  type WikidataStatement,
} from "../../src/claim-based-architecture-experiment/providers/wikidata.js"
import { GbifTaxonId, WhosOnFirstId, WikidataId } from "../../src/common/external-identifiers.js"
import { MediaAssetId, WikiArticleId } from "../../src/common/ids.js"
import { PartialDate } from "../../src/common/utils/dates.js"
import { assertPropertyEffect } from "../../src/testing.js"
import { wikidataEntities, wikidataReferencedItems } from "../fixtures/wikidata-entities.js"

// The fixtures are raw provider JSON, decoded as a response would be.
// oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- see above.
const entities = Schema.decodeUnknownSync(Schema.Record(Schema.String, WikidataEntity))(
  wikidataEntities,
)

const referenced = Schema.decodeSync(
  Schema.Record(
    Schema.String,
    Schema.Struct({
      labels: Schema.Record(Schema.String, Schema.String),
      languageTag: Schema.NullOr(Schema.String),
    }),
  ),
)(wikidataReferencedItems)

const entity = (wikidataId: string) => Option.getOrThrow(Option.fromNullishOr(entities[wikidataId]))

const rachelCarson = WikiArticleId.make("0190a000-0000-7000-8000-000000000001")
const boyaca = WikiArticleId.make("0190a000-0000-7000-8000-000000000002")

/**
 * We have articles for Rachel Carson and for Boyacá (but not for Colombia); everything else is
 * looked up in the fixtures.
 */
const context: ExtractionContext = {
  articleWithWikidataId: (wikidataId) =>
    Option.fromNullishOr({ Q100948: rachelCarson }[wikidataId]),
  articleWithWhosOnFirstId: (whosOnFirstId) =>
    whosOnFirstId === "85682059" ? Option.some(boyaca) : Option.none(),
  labelOf: (wikidataId, language) => Option.fromNullishOr(referenced[wikidataId]?.labels[language]),
  languageTagOf: (wikidataId) => Option.fromNullishOr(referenced[wikidataId]?.languageTag),
  importedFile: () => Option.some(MediaAssetId.make("0190a000-0000-7000-8000-0000000000aa")),
}

const fromWikidata = (
  wikidataEntity: WikidataEntity,
  kind: Parameters<typeof extractArticle>[0]["kind"],
) => extractArticle({ input: { provider: "WIKIDATA", result: wikidataEntity }, kind, context })

const extractionOf = (
  extraction: { readonly properties: ReadonlyArray<PropertyExtraction<unknown>> },
  propertyId: string,
) =>
  Option.getOrThrow(
    EffectArray.findFirst(extraction.properties, (property) => property.propertyId === propertyId),
  )

const namesIn = (extraction: PropertyExtraction<unknown>, language: string) =>
  extraction.values.flatMap(({ language: valueLanguage, value }) =>
    valueLanguage === language && Schema.is(Name)(value) ? [value.name] : [],
  )

const statement = ({
  id,
  rank,
  mainsnak,
  qualifiers,
}: {
  readonly id: string
  readonly rank: WikidataStatement["rank"]
  readonly mainsnak: WikidataStatement["mainsnak"]
  readonly qualifiers?: WikidataStatement["qualifiers"]
}): WikidataStatement => ({
  id,
  rank,
  mainsnak,
  ...(qualifiers === undefined ? {} : { qualifiers }),
})

const GREGORIAN = "Q1985727"
const JULIAN = "Q1985786"

const time = ({
  value,
  precision,
  calendar = GREGORIAN,
}: {
  readonly value: string
  readonly precision: number
  readonly calendar?: string
}) => ({
  snaktype: "value" as const,
  property: "P577",
  datatype: "time",
  datavalue: {
    type: "time",
    value: { time: value, precision, calendarmodel: `http://www.wikidata.org/entity/${calendar}` },
  },
})

const withClaims = (claims: WikidataEntity["claims"]): WikidataEntity => ({
  ...entity("Q591623"),
  claims,
})

const datePublishedFrom = (claims: WikidataEntity["claims"]) =>
  Option.getOrThrow(
    DatePublishedProperty.extractFrom(
      { provider: "WIKIDATA", result: withClaims(claims) },
      context,
    ),
  )

describe("extraction from Wikidata", () => {
  it("reads a book: authors linked to our articles, the rest named", () => {
    const silentSpring = fromWikidata(entity("Q591623"), "BOOK")

    expect(silentSpring.issues).toEqual([])
    expect(extractionOf(silentSpring, "authors").values).toEqual([
      { language: null, value: { _tag: "ARTICLE", wikiArticleId: rachelCarson } },
    ])
    expect(extractionOf(silentSpring, "publisher").values).toEqual([
      { language: null, value: { _tag: "NAME", name: "Houghton Mifflin Harcourt" } },
    ])
    expect(extractionOf(silentSpring, "inLanguage").values).toEqual([
      { language: null, value: "en-US" },
    ])
  })

  it("reads a plant's names without its scientific name, and not the legacy GBIF ID", () => {
    const tomato = fromWikidata(entity("Q23501"), "PLANT")
    const names = extractionOf(tomato, "names")

    // The label first, then aliases, then taxon common names (P1843), deduplicated.
    expect(namesIn(names, "pt")).toEqual(["tomateiro", "tomate"])
    expect(namesIn(names, "en")).toEqual(["tomato", "garden tomato", "love apple", "tomato plant"])
    // Spanish's label is "Solanum lycopersicum": a scientific name, left out.
    expect(namesIn(names, "es")).toEqual(["tomatera"])
    // Tomato only has P846, a Backbone ID: never read as a taxon ID.
    expect(extractionOf(tomato, "gbifTaxonId")).toMatchObject({ values: [], issues: [] })
  })

  it("reads nothing from an item that isn't of the article's kind", () => {
    expect(fromWikidata(entity("Q23501"), "BOOK")).toEqual({
      issues: [
        {
          _tag: "NOT_OF_KIND",
          expected: ["Q47461344", "Q7725634", "Q571", "Q35760"],
          found: ["Q16521", "Q31839438"],
        },
      ],
      properties: [],
    })
  })

  it("prefers preferred statements, and skips ones that ended", () => {
    const carson = fromWikidata(entity("Q100948"), "NOTEWORTHY_PERSON")

    // Birth and death have a preferred day and a normal year: the day wins.
    expect(extractionOf(carson, "lifespan").values).toMatchObject([
      {
        value: { born: { year: 1907, month: 5, day: 27 }, died: { year: 1964, month: 4, day: 14 } },
      },
    ])

    // Her website has an end time (P582).
    expect(extractionOf(carson, "website").values).toEqual([])
  })

  it("never guesses: ambiguous, unsupported and unknown values become issues", () => {
    expect(
      datePublishedFrom({
        P577: [
          statement({
            id: "a",
            rank: "normal",
            mainsnak: time({ value: "+1962-09-27T00:00:00Z", precision: 11 }),
          }),
          statement({
            id: "b",
            rank: "normal",
            mainsnak: time({ value: "+1963-00-00T00:00:00Z", precision: 9 }),
          }),
        ],
      }),
    ).toMatchObject({ values: [], issues: [{ _tag: "AMBIGUOUS", language: null, count: 2 }] })

    expect(
      datePublishedFrom({
        P577: [
          statement({
            id: "a",
            rank: "normal",
            mainsnak: time({ value: "+1960-00-00T00:00:00Z", precision: 8 }),
          }),
        ],
      }),
    ).toMatchObject({ values: [], issues: [{ _tag: "UNSUPPORTED_TIME", detail: "precision 8" }] })

    expect(
      datePublishedFrom({
        P577: [
          statement({
            id: "a",
            rank: "normal",
            mainsnak: time({ value: "+1962-09-27T00:00:00Z", precision: 11, calendar: JULIAN }),
          }),
        ],
      }),
    ).toMatchObject({ issues: [{ _tag: "UNSUPPORTED_TIME" }] })

    expect(
      datePublishedFrom({
        P577: [
          statement({
            id: "a",
            rank: "deprecated",
            mainsnak: time({ value: "+1900-00-00T00:00:00Z", precision: 9 }),
          }),
          statement({
            id: "b",
            rank: "normal",
            mainsnak: { snaktype: "somevalue", property: "P577" },
          }),
        ],
      }),
    ).toMatchObject({ values: [], issues: [{ _tag: "UNKNOWN_VALUE" }] })

    expect(
      datePublishedFrom({
        P577: [
          statement({
            id: "a",
            rank: "normal",
            mainsnak: { snaktype: "novalue", property: "P577" },
          }),
        ],
      }),
    ).toMatchObject({ values: [], issues: [{ _tag: "NO_VALUE" }] })

    // Upstream changed the property's datatype.
    expect(
      datePublishedFrom({
        P577: [
          statement({
            id: "a",
            rank: "normal",
            mainsnak: {
              snaktype: "value",
              property: "P577",
              datatype: "string",
              datavalue: { type: "string", value: "1962" },
            },
          }),
        ],
      }),
    ).toMatchObject({
      issues: [{ _tag: "UNEXPECTED_DATATYPE", expected: ["time"], found: "string" }],
    })
  })

  it("reads GBIF's new taxon ID property, never the one it replaced", () => {
    const externalId = (property: string, value: string) => ({
      snaktype: "value" as const,
      property,
      datatype: "external-id",
      datavalue: { type: "string", value },
    })

    expect(
      GbifTaxonIdProperty.extractFrom(
        {
          provider: "WIKIDATA",
          result: withClaims({
            P14607: [
              statement({ id: "a", rank: "normal", mainsnak: externalId("P14607", "4RJ6X") }),
            ],
            P846: [statement({ id: "b", rank: "normal", mainsnak: externalId("P846", "2930137") })],
          }),
        },
        context,
      ),
    ).toEqual(
      Option.some({
        propertyId: "gbifTaxonId",
        values: [{ language: null, value: "4RJ6X" }],
        issues: [],
      }),
    )
  })
})

describe("extraction from Who's On First", () => {
  const villaDeLeyva = WhosOnFirstPlace.make({
    id: WhosOnFirstId.make("421178521"),
    placeKind: "MUNICIPALITY",
    names: [
      { language: "es", name: "Villa de Leiva", isPreferred: false, isAlias: false },
      { language: "es", name: "Villa de Leyva", isPreferred: true, isAlias: false },
      { language: null, name: "Sachica", isPreferred: false, isAlias: true },
    ],
    wikidataId: WikidataId.make("Q1525127"),
    geonamesId: null,
    ancestorIds: [WhosOnFirstId.make("85682059"), WhosOnFirstId.make("85632519")],
  })

  const fromGazetteer = (place: WhosOnFirstPlace) =>
    extractArticle({ input: { provider: "WHOS_ON_FIRST", result: place }, kind: "PLACE", context })

  it("creates a place's article from its record: its ID, kind, names, concordances and parent", () => {
    const extraction = fromGazetteer(villaDeLeyva)
    const valuesOf = (propertyId: string) =>
      extractionOf(extraction, propertyId).values.map(({ value }) => value)

    expect(valuesOf("whosOnFirstId")).toEqual(["421178521"])
    expect(valuesOf("placeKind")).toEqual(["MUNICIPALITY"])
    // The preferred name first; the town it contains isn't one of its names.
    expect(namesIn(extractionOf(extraction, "names"), "es")).toEqual([
      "Villa de Leyva",
      "Villa de Leiva",
    ])
    expect(valuesOf("wikidataId")).toEqual(["Q1525127"])
    expect(valuesOf("geonamesId")).toEqual([])
    // Only its state, not the country its state is in.
    expect(valuesOf("containedInPlace")).toEqual([boyaca])
  })

  it("reports a parent without an article instead of leaving the place unplaced silently", () => {
    const boyacaRecord = WhosOnFirstPlace.make({
      ...villaDeLeyva,
      id: WhosOnFirstId.make("85682059"),
      placeKind: "STATE",
      ancestorIds: [WhosOnFirstId.make("85632519")],
    })

    expect(extractionOf(fromGazetteer(boyacaRecord), "containedInPlace")).toEqual({
      propertyId: "containedInPlace",
      values: [],
      issues: [{ _tag: "UNMATCHED_PLACE", whosOnFirstId: "85632519" }],
    })
  })
})

describe("extraction from GBIF", () => {
  it("reads nothing from a taxon outside the article's kingdom", () => {
    const honeyBee = GbifResultWithImportedPhotos.make({
      observations: [],
      gbifTaxonId: GbifTaxonId.make("4RJ6X"),
      taxonomyGroup: null,
      classification: [
        { taxonId: "1", scientificName: "Animalia", taxonRank: "KINGDOM" },
        { taxonId: "1341976", scientificName: "Apis mellifera", taxonRank: "SPECIES" },
      ],
      photos: [],
    })

    expect(
      extractArticle({ input: { provider: "GBIF", result: honeyBee }, kind: "PLANT", context }),
    ).toEqual({
      issues: [{ _tag: "NOT_OF_KIND", expected: ["Plantae"], found: ["Animalia"] }],
      properties: [],
    })
  })
})

describe("JSON-LD", () => {
  it("publishes a book with its author as a link and its identifiers as sameAs", () => {
    const silentSpring = fromWikidata(entity("Q591623"), "BOOK")

    const jsonLd = articleToJsonLd({
      kind: "BOOK",
      articleId: WikiArticleId.make("0190a000-0000-7000-8000-0000000000bb"),
      context: {
        language: "pt",
        articleUrl: (id) => `https://gororobas.com/pt/${id}`,
        mediaUrl: (id) => `https://gororobas.com/media/${id}`,
      },
      propertyValues: [
        ...silentSpring.properties.flatMap(({ propertyId, values }) =>
          EffectArray.findFirst(properties, (property) => property.id === propertyId).pipe(
            Option.map((property) => ({
              propertyId: property.id,
              values: values.flatMap(({ language, value }) =>
                language === null || language === "pt" ? [value] : [],
              ),
            })),
            Option.toArray,
          ),
        ),
        { propertyId: "wikidataId", values: ["Q591623"] },
        // A value of the wrong type (a stale projection) is left out, not published.
        { propertyId: "numberOfPages", values: ["297"] },
      ],
    })

    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "Book",
      "@id": "https://gororobas.com/pt/0190a000-0000-7000-8000-0000000000bb",
      url: "https://gororobas.com/pt/0190a000-0000-7000-8000-0000000000bb",
      name: "Silent Spring",
      author: { "@id": `https://gororobas.com/pt/${rachelCarson}` },
      publisher: { name: "Houghton Mifflin Harcourt" },
      datePublished: "1962-09-27",
      inLanguage: "en-US",
      sameAs: "https://www.wikidata.org/wiki/Q591623",
    })
  })
})

describe("the property registry", () => {
  it("lists each source at most once per property, since its position is its rank", () => {
    expect(
      properties.filter(
        (property) => EffectArray.dedupe(property.sourceKeys).length !== property.sourceKeys.length,
      ),
    ).toEqual([])
  })

  it("leaves agroecology's own properties unmapped: candidates to propose upstream", () => {
    const unmapped = properties
      .filter(
        (property) =>
          !("schemaOrg" in property && property.schemaOrg !== undefined) &&
          !property.sourceKeys.some((key) => key === "WIKIDATA"),
      )
      .map(({ id }) => id)

    expect(unmapped).toEqual(expect.arrayContaining(["strata", "edibleParts", "plantingMethods"]))
  })
})

/** Random publication date statements, in every shape Wikidata serializes. */
const RandomStatements = Schema.Array(
  Schema.Struct({
    rank: Schema.Literals(["preferred", "normal", "deprecated"]),
    precision: Schema.Int.check(Schema.isBetween({ minimum: 6, maximum: 12 })),
    year: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 2100 })),
    month: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 13 })),
    snaktype: Schema.Literals(["value", "novalue", "somevalue"]),
    isEnded: Schema.Boolean,
  }),
).check(Schema.isMaxLength(5))

describe("extraction, for any statements", () => {
  it.effect("yields only values the property accepts, and at most one for ONE properties", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(RandomStatements),
      predicate: (specs) =>
        Effect.sync(() => {
          const extraction = datePublishedFrom({
            P577: specs.map((spec, index) =>
              statement({
                id: `s${index}`,
                rank: spec.rank,
                mainsnak:
                  spec.snaktype === "value"
                    ? time({
                        value: `+${String(spec.year).padStart(4, "0")}-${String(spec.month).padStart(2, "0")}-01T00:00:00Z`,
                        precision: spec.precision,
                      })
                    : { snaktype: spec.snaktype, property: "P577" },
                ...(spec.isEnded
                  ? { qualifiers: { P582: [{ snaktype: "somevalue" as const, property: "P582" }] } }
                  : {}),
              }),
            ),
          })

          return (
            extraction.values.length <= 1 &&
            extraction.values.every(
              ({ language, value }) => language === null && Schema.is(PartialDate)(value),
            )
          )
        }),
    }),
  )
})
