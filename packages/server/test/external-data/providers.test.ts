import { describe, expect, it } from "@effect/vitest"
import { ExternalDataFetchRequest, ExternalDataInputs, ExternalDataResult } from "@gororobas/domain"
import { GbifTaxonId, WikidataId } from "@gororobas/domain"
import { assertProperty } from "@gororobas/domain/testing"
import { WikidataEntity } from "@gororobas/server/wiki/external-data/services/wikidata.schema"
import { Clock, Effect, Fiber, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { HttpClient, HttpClientResponse, HttpClientError } from "effect/http"

import { makeProviderHttp } from "../../src/common/generic-http-service.js"
import { normalizeBookLanguage } from "../../src/wiki/external-data/kinds/book-fetcher.js"
import { fetchGoogleBooksVolume } from "../../src/wiki/external-data/kinds/book-fetcher.js"
import { fetchPlantWikidata } from "../../src/wiki/external-data/kinds/plant-fetcher.js"
import { fetchPlantGbif } from "../../src/wiki/external-data/kinds/plant-fetcher.js"
import { Gbif } from "../../src/wiki/external-data/services/gbif.js"
import { makeGbif } from "../../src/wiki/external-data/services/gbif.js"
import { GoogleBooks } from "../../src/wiki/external-data/services/google-books.js"
import { makeGoogleBooks } from "../../src/wiki/external-data/services/google-books.js"
import { Wikidata } from "../../src/wiki/external-data/services/wikidata.js"
import { makeWikidata } from "../../src/wiki/external-data/services/wikidata.js"

const client = (respond: (url: string) => { body: unknown; status?: number }) =>
  HttpClient.make((request) =>
    Effect.sync(() => {
      const response = respond(request.url)
      return HttpClientResponse.fromWeb(
        request,
        new Response(Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(response.body), {
          status: response.status ?? 200,
        }),
      )
    }),
  )

const wikidata = {
  entities: {
    Q23501: {
      id: "Q23501",
      type: "item",
      claims: {
        P846: [
          {
            rank: "deprecated",
            mainsnak: {
              snaktype: "value",
              property: "P846",
              datatype: "external-id",
              datavalue: { value: "1", type: "external-id" },
            },
          },
          {
            rank: "normal",
            mainsnak: {
              snaktype: "value",
              property: "P846",
              datatype: "external-id",
              datavalue: { value: "2930137", type: "external-id" },
            },
          },
        ],
        P31: [
          {
            rank: "normal",
            mainsnak: {
              snaktype: "value",
              property: "P31",
              datatype: "wikibase-item",
              datavalue: {
                value: { "entity-type": "item", "numeric-id": 16521, id: "Q16521" },
                type: "wikibase-item",
              },
            },
          },
        ],
      },
      labels: { en: { language: "en", value: "tomato" } },
      sitelinks: {
        enwiki: {
          site: "enwiki",
          title: "Tomato",
          badges: [],
          url: "https://en.wikipedia.org/wiki/Tomato",
        },
        frwiki: {
          site: "frwiki",
          title: "Tomate",
          badges: [],
          url: "https://fr.wikipedia.org/wiki/Tomate",
        },
      },
    },
  },
}

describe("external data providers", () => {
  it.live("extracts accepted Wikidata claims and only supported locales", () =>
    Effect.gen(function* () {
      const provider = yield* makeWikidata
      const fetched = yield* provider.entity("Q23501")
      expect(fetched.value.claims.P846).toHaveLength(2)
      expect(fetched.value.claims.P31?.[0]?.mainsnak.datavalue?.value).toEqual({
        entityType: "item",
        numericId: 16521,
        id: "Q16521",
      })
      expect(fetched.value.labels).toEqual({ en: { language: "en", value: "tomato" } })
      const result = yield* fetchPlantWikidata("Q23501").pipe(
        Effect.provideService(Wikidata, provider),
      )
      expect(result.gbifId).toEqual({ kind: "deprecated-species", id: "2930137" })
      expect(result.wikipediaLinks).toEqual([
        { locale: "en", url: "https://en.wikipedia.org/wiki/Tomato" },
      ])
      expect(result.observation.payload).toEqual(wikidata)
    }).pipe(
      Effect.provideService(
        HttpClient.HttpClient,
        client(() => ({ body: wikidata })),
      ),
    ),
  )

  it.live("extracts taxonomy and media while preserving individual rights", () =>
    Effect.gen(function* () {
      const provider = yield* makeGbif
      const result = yield* fetchPlantGbif({ kind: "deprecated-species", id: "2930137" }).pipe(
        Effect.provideService(Gbif, provider),
      )
      expect(result.gbifTaxonId).toBe("4Y369")
      expect(result.classification).toEqual([
        { taxonId: "6W", scientificName: "Solanaceae", taxonRank: "FAMILY" },
      ])
      expect(result.media[0]?.creditLine).toBe("Photographer · Institution")
      expect(result.media[0]?.licenseUrl).toBe("https://creativecommons.org/licenses/by/4.0/")
    }).pipe(
      Effect.provideService(
        HttpClient.HttpClient,
        client((url) => {
          if (url.includes("/v2/species/match")) {
            return { body: { usage: { key: "4Y369" } } }
          }
          if (url.includes("/info"))
            return {
              body: {
                taxonID: "4Y369",
                scientificName: "Solanum lycopersicum",
                taxonRank: "SPECIES",
                taxonomicGroup: "Angiosperms",
                classification: [
                  {
                    taxonID: "6W",
                    scientificName: "Solanaceae",
                    taxonRank: "FAMILY",
                  },
                ],
              },
            }
          expect(url).toContain("taxonKey=4Y369")
          expect(url).toContain("checklistKey=7ddf754f-d193-4cc9-b351-99906754a03b")
          return {
            body: {
              offset: 0,
              limit: url.includes("limit=0") ? 0 : 20,
              endOfRecords: false,
              count: 42,
              results: url.includes("limit=0")
                ? []
                : [
                    {
                      key: 123,
                      media: [
                        {
                          type: "StillImage",
                          identifier: "https://example.org/tomato.jpg",
                          creator: "Photographer",
                          rightsHolder: "Institution",
                          license: "https://creativecommons.org/licenses/by/4.0/",
                        },
                      ],
                    },
                  ],
              facets: [],
            },
          }
        }),
      ),
    ),
  )

  it.live("retrieves a Google volume precisely without guessing other editions", () =>
    Effect.gen(function* () {
      const provider = yield* makeGoogleBooks
      const result = yield* fetchGoogleBooksVolume("volume_1").pipe(
        Effect.provideService(GoogleBooks, provider),
      )
      expect(result.editions[0]?.languages).toEqual(["es"])
      expect(result.editions[0]?.isbn).toEqual(["8490000000"])
      expect(result.editions[0]?.pageCount).toBeNull()
      expect(result.observations[0]?.sourceUrl).not.toContain("key=")
    }).pipe(
      Effect.provideService(
        HttpClient.HttpClient,
        client(() => ({
          body: {
            kind: "books#volume",
            id: "volume_1",
            etag: "etag_1",
            selfLink: "https://www.googleapis.com/books/v1/volumes/volume_1",
            volumeInfo: {
              title: "Libro",
              subtitle: "Subtítulo",
              description: "Descripción",
              authors: ["Autora"],
              publisher: "Editorial",
              publishedDate: "2020-01-01",
              language: "es",
              industryIdentifiers: [
                { type: "ISBN_10", identifier: "8490000000" },
                { type: "OTHER", identifier: "xyz" },
              ],
              categories: ["Fiction"],
              imageLinks: { smallThumbnail: "https://example.org/s.jpg" },
            },
            saleInfo: {
              country: "ES",
              saleability: "FOR_SALE",
              retailPrice: { amount: 12.5, currencyCode: "EUR" },
            },
            accessInfo: {
              country: "ES",
              viewability: "PARTIAL",
              embeddable: true,
              publicDomain: false,
              epub: { isAvailable: false },
            },
          },
        })),
      ),
    ),
  )

  it.live("does not retry malformed responses", () => {
    let attempts = 0
    return Effect.gen(function* () {
      const http = yield* makeProviderHttp("GBIF", "https://example.org")
      const result = yield* http
        .get("/invalid", Schema.Struct({ count: Schema.Number }))
        .pipe(Effect.result)
      expect(result._tag).toBe("Failure")
      expect(attempts).toBe(1)
    }).pipe(
      Effect.provideService(
        HttpClient.HttpClient,
        client(() => {
          attempts++
          return { body: { count: "wrong" } }
        }),
      ),
    )
  })

  it.live("paces concurrent requests and retries 429 responses through the same semaphore", () => {
    const starts: number[] = []
    let attempts = 0
    const httpClient = HttpClient.make((request) =>
      Effect.gen(function* () {
        starts.push(yield* Clock.currentTimeMillis)
        attempts++
        return HttpClientResponse.fromWeb(
          request,
          new Response("{}", { status: attempts === 1 ? 429 : 200 }),
        )
      }),
    )
    return Effect.gen(function* () {
      const http = yield* makeProviderHttp("GBIF", "https://example.org")
      const first = yield* http.get("/first", Schema.Struct({})).pipe(Effect.forkChild)
      yield* http.get("/second", Schema.Struct({}))
      yield* Fiber.join(first)
      expect(starts).toHaveLength(3)
      const [firstStart, secondStart, thirdStart] = yield* Schema.decodeUnknownEffect(
        Schema.Tuple([Schema.Number, Schema.Number, Schema.Number]),
      )(starts)
      expect(secondStart - firstStart).toBeGreaterThanOrEqual(990)
      expect(thirdStart - secondStart).toBeGreaterThanOrEqual(990)
    }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient))
  })

  it("normalizes provider language codes idempotently", () => {
    assertProperty(
      Arbitrary.schema(Schema.Literals(["eng", "por", "spa", "fr", "de", "jpn", "rus", "cze"])),
      (code) => {
        expect(normalizeBookLanguage(normalizeBookLanguage(code))).toBe(normalizeBookLanguage(code))
        return true
      },
    )
  })

  it("decodes every Wikidata datavalue shape from a real entity", () => {
    // Trimmed from the real Q23501 (tomato) Special:EntityData payload. Every datavalue shape the
    // EntitySchema documents appears at least once, including the `somevalue` snak that has none.
    const entity = {
      pageid: 26885,
      ns: 0,
      title: "Q23501",
      lastrevid: 2547649593,
      modified: "2026-09-19T03:54:31Z",
      type: "item",
      id: "Q23501",
      labels: { en: { language: "en", value: "tomato" } },
      descriptions: { en: { language: "en", value: "type of plant species" } },
      aliases: { en: [{ language: "en", value: "tomato plant" }] },
      claims: {
        P31: [
          {
            mainsnak: {
              snaktype: "value",
              property: "P31",
              hash: "06629d89",
              datavalue: {
                value: { "entity-type": "item", "numeric-id": 16521, id: "Q16521" },
                type: "wikibase-item",
              },
              datatype: "wikibase-item",
            },
            type: "statement",
            id: "Q23501$95360261",
            rank: "normal",
            references: [
              {
                hash: "5ba49922",
                snaks: {
                  P854: [
                    {
                      snaktype: "value",
                      property: "P854",
                      hash: "8108d1e4",
                      datavalue: { value: "https://example.org/a", type: "url" },
                      datatype: "url",
                    },
                  ],
                },
                "snaks-order": ["P854"],
              },
            ],
          },
        ],
        P225: [
          {
            mainsnak: {
              snaktype: "value",
              property: "P225",
              datavalue: { value: "Solanum lycopersicum", type: "string" },
              datatype: "string",
            },
            qualifiers: {
              P574: [
                {
                  snaktype: "value",
                  property: "P574",
                  datavalue: {
                    value: {
                      time: "+1753-01-01T00:00:00Z",
                      timezone: 0,
                      before: 0,
                      after: 0,
                      precision: 9,
                      calendarmodel: "http://www.wikidata.org/entity/Q1985727",
                    },
                    type: "time",
                  },
                  datatype: "time",
                },
              ],
            },
            "qualifiers-order": ["P574"],
            type: "statement",
            rank: "preferred",
          },
        ],
        P366: [
          {
            mainsnak: {
              snaktype: "value",
              property: "P366",
              datavalue: {
                value: { "entity-type": "item", "numeric-id": 2095, id: "Q2095" },
                type: "wikibase-item",
              },
              datatype: "wikibase-item",
            },
            qualifiers: {
              P518: [{ snaktype: "somevalue", property: "P518", datatype: "wikibase-item" }],
            },
            "qualifiers-order": ["P518"],
            type: "statement",
            rank: "deprecated",
          },
        ],
        P846: [
          {
            mainsnak: {
              snaktype: "value",
              property: "P846",
              datavalue: { value: "2930137", type: "external-id" },
              datatype: "external-id",
            },
            type: "statement",
            rank: "normal",
          },
        ],
        P18: [
          {
            mainsnak: {
              snaktype: "value",
              property: "P18",
              datavalue: { value: "Pomodorini sulla pianta.jpg", type: "commonsMedia" },
              datatype: "commonsMedia",
            },
            type: "statement",
            rank: "normal",
          },
        ],
        P1843: [
          {
            mainsnak: {
              snaktype: "value",
              property: "P1843",
              datavalue: {
                value: { text: "garden tomato", language: "en" },
                type: "monolingualtext",
              },
              datatype: "monolingualtext",
            },
            type: "statement",
            rank: "normal",
          },
        ],
        P11196: [
          {
            mainsnak: {
              snaktype: "value",
              property: "P11196",
              datavalue: { value: "番茄", type: "external-id" },
              datatype: "external-id",
            },
            qualifiers: {
              P3740: [
                {
                  snaktype: "value",
                  property: "P3740",
                  datavalue: { value: { amount: "+221922", unit: "1" }, type: "quantity" },
                  datatype: "quantity",
                },
              ],
            },
            "qualifiers-order": ["P3740"],
            type: "statement",
            rank: "normal",
          },
        ],
      },
      sitelinks: {
        enwiki: {
          site: "enwiki",
          title: "Tomato",
          badges: ["Q17437798"],
          url: "https://en.wikipedia.org/wiki/Tomato",
        },
      },
    }

    const decoded = Schema.decodeUnknownSync(WikidataEntity)(entity)
    expect(decoded.id).toBe("Q23501")
    expect(decoded.type).toBe("item")
    expect(decoded.lastrevid).toBe(2547649593)
    expect(decoded.labels?.en?.value).toBe("tomato")
    expect(decoded.aliases?.en?.[0]?.value).toBe("tomato plant")
    expect(decoded.sitelinks.enwiki?.badges).toEqual(["Q17437798"])
    expect(decoded.claims.P31?.[0]?.mainsnak.datavalue?.value).toEqual({
      entityType: "item",
      numericId: 16521,
      id: "Q16521",
    })
    expect(decoded.claims.P31?.[0]?.references?.[0]?.snaks.P854?.[0]?.datavalue?.value).toBe(
      "https://example.org/a",
    )
    expect(decoded.claims.P225?.[0]?.qualifiers?.P574?.[0]?.datavalue?.value).toMatchObject({
      time: "+1753-01-01T00:00:00Z",
      precision: 9,
    })
    expect(decoded.claims.P225?.[0]?.rank).toBe("preferred")
    // A `somevalue` snak states an unknown value; it must not read as a value that was dropped.
    expect(decoded.claims.P366?.[0]?.qualifiers?.P518?.[0]?.datavalue).toBeUndefined()
    expect(decoded.claims.P366?.[0]?.qualifiers?.P518?.[0]?.snaktype).toBe("somevalue")
    expect(decoded.claims.P846?.[0]?.mainsnak.datavalue?.value).toBe("2930137")
    expect(decoded.claims.P18?.[0]?.mainsnak.datavalue?.value).toBe("Pomodorini sulla pianta.jpg")
    expect(decoded.claims.P1843?.[0]?.mainsnak.datavalue?.value).toEqual({
      text: "garden tomato",
      language: "en",
    })
    expect(decoded.claims.P11196?.[0]?.qualifiers?.P3740?.[0]?.datavalue?.value).toMatchObject({
      amount: "+221922",
      unit: "1",
    })
  })

  it("round-trips generated identity values through their schemas", () => {
    ;[WikidataId, GbifTaxonId].forEach((schema) => {
      assertProperty(Arbitrary.schema(schema), (value) => {
        expect(Schema.decodeUnknownSync(schema)(Schema.encodeSync(schema)(value))).toBe(value)
        return true
      })
    })
  })
})

describe("provider error reporting", () => {
  it.live("identifies endpoints without leaking query credentials or transport messages", () =>
    Effect.forEach(
      [
        HttpClient.make((request) =>
          Effect.fail(
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({
                request,
                description: "secret-api-key",
              }),
            }),
          ),
        ),
        client(() => ({ body: {}, status: 404 })),
        client(() => ({ body: {} })),
        HttpClient.make((request) =>
          Effect.succeed(HttpClientResponse.fromWeb(request, new Response("invalid JSON"))),
        ),
      ],
      (httpClient) =>
        Effect.gen(function* () {
          const http = yield* makeProviderHttp("GOOGLE_BOOKS", "https://example.org")
          const error = yield* http
            .get("/books/volume_1?key=secret-api-key", Schema.Struct({ title: Schema.String }))
            .pipe(Effect.flip)
          expect(error.message).toContain("https://example.org/books/volume_1")
          expect(error.message).not.toContain("secret-api-key")
          expect(error.message).not.toContain("key=")
        }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient)),
      { discard: true, concurrency: 1 },
    ),
  )
})

describe("shared external data schemas", () => {
  it("round-trips generated inputs, frontiers, and provider Results through JSON", () => {
    const assertRoundTrip = <A, I>(schema: Schema.Codec<A, I>) => {
      const codec = Schema.toCodecJson(schema)
      assertProperty(Arbitrary.schema(schema), (value) => {
        const decoded = Schema.decodeUnknownSync(codec)(Schema.encodeSync(codec)(value))
        expect(Schema.toEquivalence(schema)(value, decoded)).toBe(true)
        return true
      })
    }
    assertRoundTrip(ExternalDataInputs)
    assertRoundTrip(ExternalDataFetchRequest)
    assertRoundTrip(ExternalDataResult)
  })
})
