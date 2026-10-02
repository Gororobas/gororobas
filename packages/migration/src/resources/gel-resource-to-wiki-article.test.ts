import { NodeServices } from "@effect/platform-node"
import { it } from "@effect/vitest"
import { IdGen, TiptapDocument, ValidName } from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { Effect, Option, Schema } from "effect"
import { FastCheck } from "effect/testing"
import { KeyValueStore } from "effect/unstable/persistence"
import { expect } from "vitest"

import { GelResourceWithRelations } from "../schemas/gel/entities.js"
import { MigrationContext, MigrationContextLive } from "../services/migration-context.js"
import { gelResourceToWikiArticle } from "./gel-resource-to-wiki-article.js"

const timestamp = Schema.decodeUnknownSync(Schema.DateFromString)("2025-04-01T12:00:00Z")
const source = Schema.decodeUnknownSync(GelResourceWithRelations)({
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

it.effect("carries credits, book authors, URLs and mapped tag IDs into converted resources", () =>
  assertPropertyEffect(Schema.toArbitrary(ValidName)(FastCheck), (creditLine) =>
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
      )
        return false
      expect(Option.getOrThrow(book.attributes.authors).map((author) => author.value)).toEqual([
        creditLine,
      ])
      expect(Option.getOrThrow(book.attributes.url).href).toBe(source.url)
      expect(Option.getOrThrow(resource.attributes.creditLine)).toBe(creditLine)
      expect(resource.attributes.url.href).toBe(source.url)
      expect(Array.from(Option.getOrThrow(resource.attributes.tags))).toEqual([tagId])
      expect(
        Option.getOrThrow(organization.translations.pt?.content ?? Option.none()).content,
      ).toEqual([
        { type: "paragraph", content: [{ type: "text", text: `Créditos: ${creditLine}` }] },
      ])
      return true
    }).pipe(
      Effect.provide(MigrationContextLive),
      Effect.provide(KeyValueStore.layerMemory),
      Effect.provide(NodeServices.layer),
      Effect.provideService(IdGen, { generate: () => tagId }),
    ),
  ),
)
