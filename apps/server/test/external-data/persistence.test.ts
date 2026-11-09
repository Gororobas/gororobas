import { assert, describe, expect, it } from "@effect/vitest"
import {
  BookExternalDataResult,
  ExternalDataFetchError,
  ExternalDataFetchRequest,
  GbifPlantResult,
  IdGen,
  LoroDocFrontier,
  MediaAssetId,
  PlantExternalDataResult,
  type ProviderPhoto,
  TransformedImageWidthBreakpoints,
  WikiArticleEditableData,
  WikidataResult,
} from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import {
  ConfigProvider,
  DateTime,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Result,
  Schema,
} from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { HttpClient, HttpClientResponse } from "effect/http"
import { SqlClient } from "effect/sql"
import sharp from "sharp"

import { withMediaCredits } from "../../src/media-assets/credits.js"
import { MediaAssetsRepository } from "../../src/media-assets/repository.js"
import { MediaAssetsService } from "../../src/media-assets/service.js"
import { MediaAssetsStorage } from "../../src/media-assets/storage.js"
import { getWikiArticleDebug } from "../../src/wiki/debug.js"
import { buildExternalDataRequest } from "../../src/wiki/external-data/inputs.js"
import { persistBook } from "../../src/wiki/external-data/kinds/book-persister.js"
import { persistPlant } from "../../src/wiki/external-data/kinds/plant-persister.js"
import { importProviderPhotos } from "../../src/wiki/external-data/photo-imports.js"
import { findExternalData } from "../../src/wiki/external-data/queries.js"
import { findArticlesDueForExternalData } from "../../src/wiki/external-data/refresh.js"
import { ExternalDataReport, reportExternalData } from "../../src/wiki/external-data/report.js"
import { GbifLive } from "../../src/wiki/external-data/services/gbif.js"
import { GoogleBooksLive } from "../../src/wiki/external-data/services/google-books.js"
import { ProviderPhotoDownloaderLive } from "../../src/wiki/external-data/services/provider-photo-downloader.js"
import { WikidataLive } from "../../src/wiki/external-data/services/wikidata.js"
import {
  FetchArticleExternalData,
  FetchArticleExternalDataLive,
} from "../../src/wiki/external-data/workflow.js"
import { findDatabaseRowById } from "../../src/wiki/queries.js"
import { WikiArticlesRepository } from "../../src/wiki/repository.js"
import { seedPerson, TestLayerWithServices, withSession } from "../test-helpers.js"

type BookIdentifiers = { googleBooksVolumeId?: string; isbn13?: string; isbn10?: string }

const createArticle = Effect.fn(function* (
  kind: "PLANT" | "BOOK" = "PLANT",
  bookIdentifiers: BookIdentifiers = { googleBooksVolumeId: "test_volume" },
) {
  const { person } = yield* seedPerson("ADMIN")
  const repository = yield* WikiArticlesRepository.make
  const translations = {
    pt: { commonNames: [{ id: "testname0001", name: "Test article" }] },
  } as const

  const wikiArticle = yield* Schema.decodeEffect(WikiArticleEditableData)(
    kind === "PLANT"
      ? { kind, attributes: { wikidataId: "Q23501" }, translations }
      : { kind, attributes: bookIdentifiers, translations },
  )

  const id = yield* repository.createWikiArticle({
    wikiArticle,
    createdById: person.id,
    status: "PUBLISHED",
  })

  return buildExternalDataRequest(Option.getOrThrow(yield* findDatabaseRowById(id)))
})

const failure = new ExternalDataFetchError({
  provider: "GBIF",
  message: "Provider unavailable",
  retryable: true,
})

const wikidata = WikidataResult.make({
  observation: {
    provider: "WIKIDATA",
    externalId: "Q23501",
    sourceUrl: "https://www.wikidata.org/wiki/Q23501",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    payload: {},
  },
  gbifId: { kind: "taxon", id: "4Y369" },
  taxonName: "Solanum lycopersicum",
  wikipediaLinks: [{ language: "pt", url: "https://pt.wikipedia.org/wiki/Tomate" }],
})

const gbif = GbifPlantResult.make({
  observations: [],
  gbifTaxonId: "4Y369",
  taxonomyGroup: "Angiosperms",
  classification: [{ taxonId: "6W", scientificName: "Solanaceae", taxonRank: "FAMILY" }],
  photos: [
    {
      mediaUrl: "https://example.org/tomato.jpg",
      sourceUrl: "https://www.gbif.org/occurrence/1",
      credits: ["Photographer"],
      licenseUrl: "http://creativecommons.org/licenses/by/4.0/",
    },
  ],
})

/** A provider's photo as the fetch workflow imports it, without its files. */
const insertImportedPhoto = Effect.fn(function* (credits: ReadonlyArray<string> = []) {
  const repository = yield* MediaAssetsRepository
  const id = yield* IdGen.make(MediaAssetId)
  const now = yield* DateTime.now

  yield* repository.insertMediaAsset({
    id,
    format: "IMAGE",
    metadata: { format: "IMAGE", originalWidth: 1024, originalHeight: 768 },
    contentType: "image/jpeg",
    byteSize: 1,
    category: null,
    descriptions: {},
    moderationStatus: "APPROVED_BY_DEFAULT",
    ownerProfileId: null,
    licenseUrl: "http://creativecommons.org/licenses/by/4.0/",
    createdAt: now,
    updatedAt: now,
  })

  yield* repository.insertMediaAssetImport({
    mediaAssetId: id,
    provider: "GBIF",
    mediaUrl: `https://example.org/photos/${id}.jpg`,
    sourceUrl: "https://www.gbif.org/occurrence/1",
  })

  yield* Effect.forEach(
    credits,
    (creditLine, orderIndex) =>
      repository.insertMediaAssetCredit({
        mediaAssetId: id,
        orderIndex,
        creditLine,
        creditUrl: null,
        personId: null,
      }),
    { concurrency: 1, discard: true },
  )

  return id
})

const successfulPlant = (gbifPhotos: ReadonlyArray<MediaAssetId>) =>
  PlantExternalDataResult.make({
    kind: "PLANT",
    attributes: { wikidata: Result.succeed(wikidata), gbif: Result.succeed(gbif), gbifPhotos },
  })

const persistSuccessfulPlant = Effect.fn(function* (request: ExternalDataFetchRequest) {
  yield* persistPlant(request, successfulPlant([yield* insertImportedPhoto()]))
})

describe("external data persistence", () => {
  ;(["WIKIDATA", "GBIF"] as const).forEach((failedProvider) => {
    it.effect(`preserves ${failedProvider} projections when that provider fails`, () =>
      Effect.gen(function* () {
        const request = yield* createArticle()
        const sql = yield* SqlClient.SqlClient
        yield* persistSuccessfulPlant(request)
        const before =
          yield* sql`SELECT * FROM wiki_article_external_media WHERE wiki_article_id = ${request.wikiArticleId}`

        yield* persistPlant(
          request,
          PlantExternalDataResult.make({
            kind: "PLANT",
            attributes: {
              wikidata:
                failedProvider === "WIKIDATA" ? Result.fail(failure) : Result.succeed(wikidata),
              gbif: failedProvider === "WIKIDATA" ? null : Result.fail(failure),
              gbifPhotos: [],
            },
          }),
        )

        expect(
          yield* sql`SELECT * FROM wiki_article_external_media WHERE wiki_article_id = ${request.wikiArticleId}`,
        ).toEqual(before)
        expect(
          yield* sql`SELECT * FROM wiki_article_external_links WHERE wiki_article_id = ${request.wikiArticleId}`,
        ).toHaveLength(1)
        expect(
          yield* sql`SELECT * FROM wiki_plant_taxonomy_classification WHERE wiki_article_id = ${request.wikiArticleId}`,
        ).toHaveLength(1)
        expect(
          yield* sql`SELECT * FROM wiki_article_external_data_observations WHERE wiki_article_id = ${request.wikiArticleId} AND json_extract(outcome, '$._tag') = 'Failure'`,
        ).toHaveLength(1)
      }).pipe(Effect.provide(TestLayerWithServices)),
    )
  })

  it.effect("reports what each provider stored and why the latest fetch failed", () =>
    Effect.gen(function* () {
      const request = yield* createArticle()
      yield* persistSuccessfulPlant(request)

      yield* persistPlant(request, {
        kind: "PLANT",
        attributes: {
          wikidata: Result.succeed(wikidata),
          gbif: Result.fail(failure),
          gbifPhotos: [],
        },
      })

      const [report] = yield* reportExternalData([request.wikiArticleId])

      expect(report).toMatchObject({
        kind: "PLANT",
        externalLinks: 1,
        externalMedia: 1,
        taxonomyGroup: "Angiosperms",
        taxonomyClassification: 1,
        bookEditions: 0,
        providers: [
          {
            provider: "GBIF",
            observations: 2,
            failures: 1,
            lastOutcome: "Failure",
            lastError: failure.message,
          },
          {
            provider: "WIKIDATA",
            observations: 2,
            failures: 0,
            lastOutcome: "Success",
            lastError: null,
          },
        ],
      })

      const debug = yield* withSession(getWikiArticleDebug(request.wikiArticleId), {
        type: "VISITOR",
      })

      expect(debug.externalDataReport).toEqual(
        yield* Schema.encodeEffect(Schema.Array(ExternalDataReport))(
          report === undefined ? [] : [report],
        ),
      )
    }).pipe(Effect.provide(TestLayerWithServices)),
  )

  it.effect("replaces successful projections, including a successful empty media response", () =>
    Effect.gen(function* () {
      const request = yield* createArticle()
      const sql = yield* SqlClient.SqlClient
      yield* persistSuccessfulPlant(request)

      yield* persistPlant(request, {
        kind: "PLANT",
        attributes: {
          wikidata: Result.succeed({ ...wikidata, wikipediaLinks: [] }),
          gbif: Result.succeed({ ...gbif, photos: [], classification: [] }),
          gbifPhotos: [],
        },
      })

      expect(yield* sql`SELECT * FROM wiki_article_external_media`).toEqual([])
      expect(yield* sql`SELECT * FROM wiki_article_external_links`).toEqual([])
      expect(yield* sql`SELECT * FROM wiki_plant_taxonomy_classification`).toEqual([])
    }).pipe(Effect.provide(TestLayerWithServices)),
  )

  it.effect("unlinks photos a refresh no longer lists, keeping their media", () =>
    Effect.gen(function* () {
      const request = yield* createArticle()
      const sql = yield* SqlClient.SqlClient
      const [kept, dropped] = [yield* insertImportedPhoto(), yield* insertImportedPhoto()]

      yield* persistPlant(request, successfulPlant([dropped, kept]))
      yield* persistPlant(request, successfulPlant([kept]))

      expect(
        yield* sql`SELECT media_asset_id, order_index FROM wiki_article_external_media WHERE wiki_article_id = ${request.wikiArticleId}`,
      ).toEqual([{ mediaAssetId: kept, orderIndex: 0 }])
      expect(
        yield* sql`SELECT id FROM media_assets WHERE ${sql.in("id", [kept, dropped])}`,
      ).toHaveLength(2)
    }).pipe(Effect.provide(TestLayerWithServices)),
  )

  it.effect("keeps book editions on failure and replaces them on a successful empty result", () =>
    Effect.gen(function* () {
      const request = yield* createArticle("BOOK")
      const sql = yield* SqlClient.SqlClient

      yield* persistBook(
        request,
        BookExternalDataResult.make({
          kind: "BOOK",
          attributes: {
            googleBooks: Result.succeed({
              observations: [],
              coverage: "COMPLETE",
              editions: [
                {
                  externalId: "test_volume",
                  title: "Test book",
                  publisher: null,
                  publicationDate: null,
                  pageCount: null,
                  languages: ["pt"],
                  isbn: [],
                  sourceUrl: "https://books.google.com/books?id=test_volume",
                },
              ],
            }),
          },
        }),
      )

      yield* persistBook(request, {
        kind: "BOOK",
        attributes: { googleBooks: Result.fail(failure) },
      })
      expect(yield* sql`SELECT * FROM wiki_book_editions`).toHaveLength(1)
      expect(yield* sql`SELECT * FROM wiki_book_edition_languages`).toHaveLength(1)

      yield* persistBook(request, {
        kind: "BOOK",
        attributes: {
          googleBooks: Result.succeed({ observations: [], coverage: "COMPLETE", editions: [] }),
        },
      })

      expect(yield* sql`SELECT * FROM wiki_book_editions`).toEqual([])
      expect(yield* sql`SELECT * FROM wiki_book_edition_languages`).toEqual([])
    }).pipe(Effect.provide(TestLayerWithServices)),
  )

  it.effect("rejects stale results before writing observations or replacing data", () =>
    Effect.gen(function* () {
      const request = yield* createArticle()
      const sql = yield* SqlClient.SqlClient
      yield* persistSuccessfulPlant(request)
      const observations = yield* sql`SELECT * FROM wiki_article_external_data_observations`

      yield* persistPlant(
        { ...request, articleCrdtFrontier: LoroDocFrontier.make([]) },
        {
          kind: "PLANT",
          attributes: {
            wikidata: Result.succeed({ ...wikidata, wikipediaLinks: [] }),
            gbif: null,
            gbifPhotos: [],
          },
        },
      )

      expect(yield* sql`SELECT * FROM wiki_article_external_data_observations`).toEqual(
        observations,
      )
      expect(yield* sql`SELECT * FROM wiki_article_external_links`).toHaveLength(1)
    }).pipe(Effect.provide(TestLayerWithServices)),
  )

  it.effect("rejects results fetched with IDs the article doesn't have", () =>
    Effect.gen(function* () {
      const request = yield* createArticle()
      const sql = yield* SqlClient.SqlClient
      assert(request.inputs.kind === "PLANT")

      yield* persistPlant(
        { ...request, inputs: { ...request.inputs, wikidataId: Option.some("Q1353278") } },
        successfulPlant([yield* insertImportedPhoto()]),
      )

      expect(yield* sql`SELECT * FROM wiki_article_external_data_observations`).toEqual([])
      expect(yield* sql`SELECT * FROM wiki_article_external_links`).toEqual([])
    }).pipe(Effect.provide(TestLayerWithServices)),
  )

  it.effect(
    "refreshes expired successes and retries failures without selecting fresh attempts",
    () =>
      Effect.gen(function* () {
        const request = yield* createArticle()
        const now = yield* DateTime.now

        const due = () =>
          findArticlesDueForExternalData({
            refreshedBefore: DateTime.subtractDuration(now, Duration.days(14)),
            retriedBefore: DateTime.subtractDuration(now, Duration.hours(1)),
          })

        expect(yield* due()).toEqual([
          { wikiArticleId: request.wikiArticleId, refreshGeneration: "initial" },
        ])
        yield* persistSuccessfulPlant(request)
        expect(yield* due()).toEqual([])
        const sql = yield* SqlClient.SqlClient
        yield* sql`UPDATE wiki_article_external_data_observations SET observed_at = ${DateTime.formatIso(DateTime.subtractDuration(now, Duration.days(15)))}`
        expect(yield* due()).toHaveLength(1)
        yield* persistPlant(request, {
          kind: "PLANT",
          attributes: { wikidata: Result.fail(failure), gbif: null, gbifPhotos: [] },
        })
        yield* sql`DELETE FROM wiki_article_external_data_observations WHERE provider = 'GBIF'`
        expect(yield* due()).toEqual([])
        yield* sql`UPDATE wiki_article_external_data_observations SET observed_at = ${DateTime.formatIso(DateTime.subtractDuration(now, Duration.hours(2)))} WHERE json_extract(outcome, '$._tag') = 'Failure'`
        expect(yield* due()).toHaveLength(1)
      }).pipe(Effect.provide(TestLayerWithServices)),
  )

  it.effect("refreshes books identified only by an ISBN", () =>
    Effect.gen(function* () {
      const now = yield* DateTime.now
      const byIsbn = yield* createArticle("BOOK", { isbn13: "9788535926200" })
      yield* createArticle("BOOK", {})

      expect(
        yield* findArticlesDueForExternalData({ refreshedBefore: now, retriedBefore: now }),
      ).toEqual([{ wikiArticleId: byIsbn.wikiArticleId, refreshGeneration: "initial" }])
    }).pipe(Effect.provide(TestLayerWithServices)),
  )

  it.effect("denies the debug payload in production", () =>
    Effect.gen(function* () {
      const request = yield* createArticle()

      const outcome = yield* withSession(getWikiArticleDebug(request.wikiArticleId), {
        type: "VISITOR",
      }).pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({ NODE_ENV: "production" }),
        ),
        Effect.result,
      )

      expect(Result.isFailure(outcome) && outcome.failure._tag).toBe("UnauthorizedError")
    }).pipe(Effect.provide(TestLayerWithServices)),
  )

  it.effect("decodes SQL JSON columns without reparsing strings inside provider payloads", () =>
    Effect.gen(function* () {
      const request = yield* createArticle()
      const payload = { content: "provider text", languages: "pt" }
      const observation = { ...wikidata.observation, payload }

      yield* persistPlant(request, {
        kind: "PLANT",
        attributes: {
          wikidata: Result.succeed({ ...wikidata, observation }),
          gbif: null,
          gbifPhotos: [],
        },
      })

      const data = yield* withSession(getWikiArticleDebug(request.wikiArticleId), {
        type: "VISITOR",
      }).pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({ NODE_ENV: "test" }),
        ),
      )

      expect(data.externalDataObservations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            outcome: expect.objectContaining({ _tag: "Success", success: [observation] }),
          }),
        ]),
      )

      expect(data.projection).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attributes: expect.objectContaining({ wikidataId: "Q23501" }),
          }),
        ]),
      )
    }).pipe(Effect.provide(TestLayerWithServices)),
  )

  it.effect("preserves arbitrary media collections after a failed refresh", () =>
    Effect.gen(function* () {
      const request = yield* createArticle()

      yield* assertPropertyEffect({
        arbitrary: Arbitrary.schema(Schema.Array(Schema.String)),
        options: { runs: 20 },
        predicate: (creditLines) =>
          Effect.gen(function* () {
            const gbifPhotos = yield* Effect.forEach(
              creditLines,
              (creditLine) => insertImportedPhoto([creditLine]),
              { concurrency: 1 },
            )

            yield* persistPlant(request, successfulPlant(gbifPhotos))

            const sql = yield* SqlClient.SqlClient
            const before =
              yield* sql`SELECT * FROM wiki_article_external_media WHERE wiki_article_id = ${request.wikiArticleId}`
            yield* persistPlant(request, {
              kind: "PLANT",
              attributes: { wikidata: null, gbif: Result.fail(failure), gbifPhotos: [] },
            })
            expect(
              yield* sql`SELECT * FROM wiki_article_external_media WHERE wiki_article_id = ${request.wikiArticleId}`,
            ).toEqual(before)
            return true
          }),
      })
    }).pipe(Effect.provide(TestLayerWithServices)),
  )
})

const failedHttp = HttpClient.make((request) =>
  Effect.succeed(HttpClientResponse.fromWeb(request, new Response("{}", { status: 404 }))),
)

const workflowLayer = FetchArticleExternalDataLive.pipe(
  Layer.provide(
    Layer.mergeAll(WikidataLive, GbifLive, GoogleBooksLive, ProviderPhotoDownloaderLive).pipe(
      Layer.provide(Layer.succeed(HttpClient.HttpClient, failedHttp)),
    ),
  ),
  Layer.provideMerge(TestLayerWithServices),
)

describe("external data workflow", () => {
  it.live(
    "finishes and records a failed Wikidata fetch, and gives refresh generations distinct executions",
    () =>
      Effect.gen(function* () {
        const request = yield* createArticle()
        yield* FetchArticleExternalData.execute(request)
        const sql = yield* SqlClient.SqlClient
        expect(
          yield* sql`SELECT * FROM wiki_article_external_data_observations WHERE json_extract(outcome, '$._tag') = 'Failure'`,
        ).toHaveLength(1)
        const originalId = yield* FetchArticleExternalData.executionId(request)
        const refresh = { ...request, refreshGeneration: "next" }
        expect(yield* FetchArticleExternalData.executionId(refresh)).not.toBe(originalId)
        yield* FetchArticleExternalData.execute(request)
        expect(yield* sql`SELECT * FROM wiki_article_external_data_observations`).toHaveLength(1)
        yield* FetchArticleExternalData.execute(refresh)
        expect(yield* sql`SELECT * FROM wiki_article_external_data_observations`).toHaveLength(2)
      }).pipe(Effect.provide(workflowLayer)),
  )
})

describe("provider photos", () => {
  it.effect("are served to anyone once an article shows them, credited and licensed", () =>
    Effect.gen(function* () {
      const request = yield* createArticle()
      const sql = yield* SqlClient.SqlClient
      const media = yield* MediaAssetsService
      const [shown, censored] = [
        yield* insertImportedPhoto(["Ana", "Instituto"]),
        yield* insertImportedPhoto(),
      ]
      const view = (id: MediaAssetId) =>
        withSession(media.getRow(id), { type: "VISITOR" }).pipe(Effect.result)

      expect(Result.isFailure(yield* view(shown))).toBe(true)

      yield* persistPlant(request, successfulPlant([censored, shown]))
      yield* sql`UPDATE media_assets SET moderation_status = 'CENSORED' WHERE id = ${censored}`

      expect(Result.isSuccess(yield* view(shown))).toBe(true)
      expect(Result.isFailure(yield* view(censored))).toBe(true)

      const { media: photos } = yield* findExternalData(request.wikiArticleId)

      expect(photos).toEqual([
        {
          provider: "GBIF",
          sourceUrl: "https://www.gbif.org/occurrence/1",
          mediaAsset: expect.objectContaining({
            id: shown,
            ownerProfileId: null,
            licenseUrl: "http://creativecommons.org/licenses/by/4.0/",
            credits: [
              { profile: null, creditLine: "Ana", creditUrl: null },
              { profile: null, creditLine: "Instituto", creditUrl: null },
            ],
          }),
        },
      ])
    }).pipe(Effect.provide(TestLayerWithServices)),
  )

  it.live("are downloaded once, at every size, and skipped when they can't be imported", () =>
    Effect.gen(function* () {
      const png = new Uint8Array(
        yield* Effect.tryPromise(() =>
          sharp({ create: { width: 640, height: 480, channels: 3, background: "#6b8e23" } })
            .png()
            .toBuffer(),
        ),
      )

      const requested: Array<string> = []

      const http = HttpClient.make((request) =>
        Effect.sync(() => {
          requested.push(request.url)

          return HttpClientResponse.fromWeb(
            request,
            request.url.endsWith("missing.jpg")
              ? new Response("", { status: 404 })
              : request.url.endsWith("page.jpg")
                ? new Response("<html></html>", { status: 200 })
                : new Response(png, { status: 200 }),
          )
        }),
      )

      const photo = (name: string): ProviderPhoto => ({
        mediaUrl: `https://example.org/${name}`,
        sourceUrl: `https://www.gbif.org/occurrence/${name}`,
        credits: ["Ana"],
        licenseUrl: "http://creativecommons.org/licenses/by/4.0/",
      })

      const photos = ["a.jpg", "missing.jpg", "page.jpg", "b.jpg"].map(photo)

      const imported = yield* importProviderPhotos("GBIF", photos).pipe(
        Effect.provide(ProviderPhotoDownloaderLive),
        Effect.provideService(HttpClient.HttpClient, http),
      )
      expect(imported).toHaveLength(2)

      const refreshed = yield* importProviderPhotos("GBIF", photos).pipe(
        Effect.provide(ProviderPhotoDownloaderLive),
        Effect.provideService(HttpClient.HttpClient, http),
      )
      expect(refreshed).toEqual(imported)
      // Only the photos that failed are requested again.
      expect(requested.filter((url) => url.endsWith("a.jpg"))).toHaveLength(1)
      expect(requested.filter((url) => url.endsWith("missing.jpg"))).toHaveLength(2)

      const repository = yield* MediaAssetsRepository

      const assets = yield* Effect.forEach(
        imported,
        (id) => Effect.map(repository.findMediaAssetById(id), Option.getOrThrow),
        { concurrency: 1 },
      )

      const [first] = yield* withMediaCredits(assets)

      expect(first).toMatchObject({
        format: "IMAGE",
        contentType: "image/png",
        ownerProfileId: null,
        licenseUrl: "http://creativecommons.org/licenses/by/4.0/",
        moderationStatus: "APPROVED_BY_DEFAULT",
        credits: [{ profile: null, creditLine: "Ana", creditUrl: null }],
      })

      expect(
        Option.map(
          yield* repository.findMediaAssetImportByUrl("https://example.org/a.jpg"),
          ({ mediaAssetId }) => mediaAssetId,
        ),
      ).toEqual(Option.some(first?.id))

      const storage = yield* MediaAssetsStorage
      const fileSystem = yield* FileSystem.FileSystem

      const sizes = yield* Effect.forEach(
        TransformedImageWidthBreakpoints.literals,
        (width) => fileSystem.exists(storage.filePath(first?.id ?? imported[0], `${width}.avif`)),
        { concurrency: 1 },
      )

      expect(sizes.every(Boolean)).toBe(true)
    }).pipe(Effect.provide(TestLayerWithServices)),
  )
})
