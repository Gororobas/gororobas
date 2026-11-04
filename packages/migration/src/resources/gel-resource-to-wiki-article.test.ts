import { NodeServices } from "@effect/platform-node"
import { assert, expect, it } from "@effect/vitest"
import { IdGen, TiptapDocument, ValidName } from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { Array as EffectArray, Effect, Layer, Option, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { KeyValueStore } from "effect/persistence"

import { GelResourceWithRelations } from "../schemas/gel/entities.js"
import { MigrationContext, MigrationContextLive } from "../services/migration-context.js"
import {
  gelResourceRelatedWikiArticleIds,
  gelResourceToWikiArticle,
} from "./gel-resource-to-wiki-article.js"

const timestamp = Schema.decodeSync(Schema.DateFromString)("2025-04-01T12:00:00Z")

const source = Schema.decodeSync(GelResourceWithRelations)({
  id: "gel-resource",
  handle: "test-resource",
  title: "Test resource",
  created_at: timestamp,
  updated_at: null,
  format: "BOOK",
  description: TiptapDocument.make({ type: "doc", version: 1, content: [] }),
  url: "https://example.com/book",
  tags: [{ id: "gel-tag" }],
  related_vegetables: [],
})

const tagId = "019a0dce-1fc0-7abc-8abc-123456789abc"

const migrationLayer = MigrationContextLive.pipe(
  Layer.provide(KeyValueStore.layerMemory),
  Layer.provideMerge(NodeServices.layer),
)

it.effect("repairs packed legacy author credits without splitting individual names", () =>
  Effect.forEach(
    [
      { creditLine: "Davi Kopenawa e Bruce Albert", authors: ["Davi Kopenawa", "Bruce Albert"] },
      {
        creditLine: "Mestre Joelson Ferreira e Erahsto Felício",
        authors: ["Mestre Joelson Ferreira", "Erahsto Felício"],
      },
      {
        creditLine: "José Fernando dos Santos Rebello e Daniela Ghiringhello Sakamoto",
        authors: ["José Fernando dos Santos Rebello", "Daniela Ghiringhello Sakamoto"],
      },
      {
        creditLine: "Alejandro Reyes & Mestre Joelson Ferreira",
        authors: ["Alejandro Reyes", "Mestre Joelson Ferreira"],
      },
      {
        creditLine: "Stone Barns Center e contribuintes",
        authors: ["Stone Barns Center", "Martha Hodgkins"],
      },
      { creditLine: "João Cabral de Melo e Neto", authors: ["João Cabral de Melo e Neto"] },
      { creditLine: null, authors: undefined },
    ],
    ({ creditLine, authors }) =>
      Effect.gen(function* () {
        const book = yield* gelResourceToWikiArticle({ ...source, credit_line: creditLine })
        assert(book.kind === "BOOK")
        expect(Option.getOrUndefined(book.attributes.authors)?.map(({ value }) => value)).toEqual(
          authors,
        )
        const names = Option.getOrElse(book.attributes.authors, () => [])
        expect(EffectArray.dedupe(names.map(({ id }) => id))).toHaveLength(names.length)
      }),
    { concurrency: 1 },
  ).pipe(Effect.provide(migrationLayer), Effect.provideService(IdGen, { generate: () => tagId })),
)

it.effect("imports checksum-valid ISBNs from book URLs and preserves the source URL", () =>
  Effect.forEach(
    [
      {
        url: "https://expressaopopular.com.br/livraria/9788577432868manejo-ecologico-de-pragas-e-doencas/",
        isbn13: "9788577432868",
        isbn10: undefined,
      },
      {
        url: "https://www.companhiadasletras.com.br/livro/9788535926200/a-queda-do-ceu",
        isbn13: "9788535926200",
        isbn10: undefined,
      },
      {
        url: "https://example.com/books/080442957X?other=9788535926200",
        isbn10: "080442957X",
        isbn13: "9788535926200",
      },
      { url: "https://example.com/9788535926201", isbn10: undefined, isbn13: undefined },
      { url: "https://example.com/19788535926200", isbn10: undefined, isbn13: undefined },
      {
        url: "https://amazon.com.br/ebook/dp/B0876HG28P",
        isbn10: undefined,
        isbn13: undefined,
      },
    ],
    ({ url, isbn10, isbn13 }) =>
      Effect.gen(function* () {
        const book = yield* gelResourceToWikiArticle({ ...source, url })
        assert(book.kind === "BOOK")
        expect(Option.getOrUndefined(book.attributes.isbn10)).toBe(isbn10)
        expect(Option.getOrUndefined(book.attributes.isbn13)).toBe(isbn13)
        expect(Option.getOrThrow(book.attributes.url).href).toBe(url)
      }),
    { concurrency: 1 },
  ).pipe(Effect.provide(migrationLayer), Effect.provideService(IdGen, { generate: () => tagId })),
)

it.effect("imports the volume ID of a Google Books source URL", () =>
  Effect.gen(function* () {
    const book = yield* gelResourceToWikiArticle({
      ...source,
      url: "https://books.google.com.br/books/about/Manejo_ecol%C3%B3gico_do_solo_a_agricultura.html?id=DHo2zLdESkEC&redir_esc=y",
    })
    assert(book.kind === "BOOK")
    expect(Option.getOrUndefined(book.attributes.googleBooksVolumeId)).toBe("DHo2zLdESkEC")

    const elsewhere = yield* gelResourceToWikiArticle(source)
    assert(elsewhere.kind === "BOOK")
    expect(elsewhere.attributes.googleBooksVolumeId).toEqual(Option.none())
  }).pipe(Effect.provide(migrationLayer), Effect.provideService(IdGen, { generate: () => tagId })),
)

it.effect(
  "carries credits, book authors and URLs into converted resources, and maps tag IDs to related concepts",
  () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(ValidName),
      predicate: (creditLine) =>
        Effect.gen(function* () {
          const context = yield* MigrationContext

          yield* context.registerMapping({
            gelId: "gel-tag",
            sqliteId: tagId,
            entityType: "Tag",
            contentHash: "tag",
            lastSyncedAt: timestamp.toISOString(),
          })

          const book = yield* gelResourceToWikiArticle({ ...source, credit_line: creditLine })

          const resource = yield* gelResourceToWikiArticle({
            ...source,
            format: "PODCAST",
            credit_line: creditLine,
          })

          const organization = yield* gelResourceToWikiArticle({
            ...source,
            format: "ORGANIZATION",
            credit_line: creditLine,
          })

          if (
            book.kind !== "BOOK" ||
            resource.kind !== "RESOURCE" ||
            organization.kind !== "NOTEWORTHY_ENTITY"
          ) {
            return false
          }

          expect(Option.getOrThrow(book.attributes.authors).map((author) => author.value)).toEqual([
            creditLine,
          ])
          expect(Option.getOrThrow(book.attributes.url).href).toBe(source.url)
          expect(Option.getOrThrow(resource.attributes.creditLine)).toBe(creditLine)
          expect(resource.attributes.url.href).toBe(source.url)
          expect(yield* gelResourceRelatedWikiArticleIds(source)).toEqual([tagId])

          expect(
            Option.getOrThrow(organization.translations.pt?.content ?? Option.none()).content,
          ).toEqual([
            { type: "paragraph", content: [{ type: "text", text: `Créditos: ${creditLine}` }] },
          ])

          return true
        }).pipe(
          Effect.provide(
            MigrationContextLive.pipe(
              Layer.provide(KeyValueStore.layerMemory),
              Layer.provideMerge(NodeServices.layer),
            ),
          ),
          Effect.provideService(IdGen, { generate: () => tagId }),
        ),
    }),
)
