import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import { FastCheck } from "effect/testing"

import { loroDocToUpdate, snapshotToLoroDoc } from "../../src/crdts/lib.js"
import { assertPropertyEffect } from "../../src/testing.js"
import { WikiPlantArticle } from "../../src/wiki/kinds/plant.js"
import {
  applyWikiArticleEdit,
  createWikiArticleCrdtDocument,
  parseWikiArticleCrdtUpdate,
} from "../../src/wiki/wiki-article-crdt.js"
import { WikiArticleEditableData } from "../../src/wiki/wiki-article.js"
import { withEditorRichText } from "../fixtures/wiki-rich-text.js"

const articleJson = Schema.fromJsonString(WikiArticleEditableData)
const plant = Schema.decodeUnknownSync(WikiPlantArticle.EditableArticle)({
  kind: "PLANT",
  attributes: {},
  translations: { en: { commonNames: [{ id: "commonname01", value: "Pumpkin" }] } },
})

describe("Wiki CRDT review stress tests", () => {
  WikiArticleEditableData.members.forEach((member) => {
    it.effect(`preserves the JSON representation of ${member.fields.kind.literal}`, () =>
      assertPropertyEffect(
        Schema.toArbitrary(member)(FastCheck),
        (generated) =>
          Effect.gen(function* () {
            const article = withEditorRichText(generated)
            const created = yield* createWikiArticleCrdtDocument(article)
            const parsed = yield* parseWikiArticleCrdtUpdate({
              snapshot: created.crdtSnapshot,
              crdtUpdate: created.initialCrdtUpdate,
            })
            expect(yield* Schema.encodeEffect(articleJson)(parsed.data)).toBe(
              yield* Schema.encodeEffect(articleJson)(article),
            )
            return true
          }),
        { numRuns: 100, seed: 20261002 },
      ),
    )
  })

  it.effect("preserves arbitrary JSON rich-text attributes, including reserved keys", () =>
    assertPropertyEffect(
      Schema.toArbitrary(Schema.Json)(FastCheck),
      (value) =>
        Effect.gen(function* () {
          const article = Schema.decodeUnknownSync(WikiPlantArticle.EditableArticle)({
            ...Schema.encodeSync(WikiPlantArticle.EditableArticle)(plant),
            translations: {
              en: {
                commonNames: [{ id: "commonname01", value: "Pumpkin" }],
                content: {
                  type: "doc",
                  version: 1,
                  content: [{ type: "paragraph", attrs: { ["__proto__"]: value, value } }],
                },
              },
            },
          })
          const created = yield* createWikiArticleCrdtDocument(article)
          const parsed = yield* parseWikiArticleCrdtUpdate({
            snapshot: created.crdtSnapshot,
            crdtUpdate: created.initialCrdtUpdate,
          })
          const normalized = yield* Schema.decodeEffect(articleJson)(
            yield* Schema.encodeEffect(articleJson)(article),
          )
          expect(parsed.data.translations.en?.content).toEqual(normalized.translations.en?.content)
          return true
        }),
      { numRuns: 200, seed: 20261002 },
    ),
  )

  it.effect("merges concurrent additions to the same initially absent plant set", () =>
    assertPropertyEffect(
      Schema.toArbitrary(Schema.Tuple([Schema.String, Schema.String]))(FastCheck),
      ([englishOrigin, portugueseOrigin]) =>
        Effect.gen(function* () {
          const article = WikiPlantArticle.EditableArticle.make({
            ...plant,
            translations: { en: plant.translations.en, pt: plant.translations.en },
          })
          const created = yield* createWikiArticleCrdtDocument(article)
          const first = snapshotToLoroDoc(created.crdtSnapshot)
          const second = first.fork()
          yield* applyWikiArticleEdit(first, { _tag: "AddedPlantUsage", value: "HUMAN_FEED" })
          yield* applyWikiArticleEdit(second, { _tag: "AddedPlantUsage", value: "ANIMAL_FEED" })
          yield* applyWikiArticleEdit(first, {
            _tag: "SetPlantOrigin",
            locale: "en",
            value: englishOrigin,
          })
          yield* applyWikiArticleEdit(second, {
            _tag: "SetPlantOrigin",
            locale: "pt",
            value: portugueseOrigin,
          })
          first.import(loroDocToUpdate(second))
          second.import(loroDocToUpdate(first))
          expect(first.toJSON()).toEqual(second.toJSON())
          const parsed = yield* parseWikiArticleCrdtUpdate({
            snapshot: created.crdtSnapshot,
            crdtUpdate: loroDocToUpdate(first),
          })
          expect(parsed.data.kind).toBe("PLANT")
          if (parsed.data.kind !== "PLANT") return false
          const usage = Array.from(Option.getOrThrow(parsed.data.attributes.usage))
          expect(usage).toHaveLength(2)
          expect(usage).toEqual(expect.arrayContaining(["ANIMAL_FEED", "HUMAN_FEED"]))
          expect(parsed.data.translations.en?.origin).toEqual(Option.some(englishOrigin))
          expect(parsed.data.translations.pt?.origin).toEqual(Option.some(portugueseOrigin))
          return true
        }),
      { numRuns: 100, seed: 20261002 },
    ),
  )
})
