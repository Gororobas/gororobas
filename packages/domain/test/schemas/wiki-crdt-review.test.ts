import { assert, describe, expect, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

import { loroDocToUpdate, snapshotToLoroDoc } from "../../src/crdts/lib.js"
import { toLoroString, toLoroValue } from "../../src/crdts/loro-values.js"
import { TiptapDocument } from "../../src/rich-text/domain.js"
import { assertPropertyEffect } from "../../src/testing.js"
import { WikiPlantArticle } from "../../src/wiki/kinds/plant.js"
import {
  applyWikiArticleEdit,
  createWikiArticleCrdtDocument,
  parseWikiArticleCrdtUpdate,
} from "../../src/wiki/wiki-article-crdt.js"
import { WikiArticleEditableData } from "../../src/wiki/wiki-article.js"
import { withEditorRichText } from "../fixtures/wiki-rich-text.js"

const articleJson = Schema.toCodecJson(WikiArticleEditableData)

const plant = Schema.decodeUnknownSync(WikiPlantArticle.EditableArticle)({
  kind: "PLANT",
  attributes: {},
  translations: { en: { commonNames: [{ id: "commonname01", value: "Pumpkin" }] } },
})

describe("Wiki CRDT review stress tests", () => {
  it.effect("preserves Unicode and normalizes lone surrogates only at Loro writes", () =>
    Effect.gen(function* () {
      const decode = Schema.decodeUnknownSync(WikiPlantArticle.EditableArticle)

      const input = {
        kind: "PLANT",
        attributes: {},
        translations: {
          en: {
            commonNames: [{ id: "commonname01", value: "Pumpkin" }],
            origin: "América 🌱",
            content: {
              type: "doc",
              version: 1,
              content: [{ type: "paragraph", content: [{ type: "text", text: "土 🍅 e\u0301" }] }],
            },
          },
        },
      }

      const article = decode(input)
      const created = yield* createWikiArticleCrdtDocument(article)
      const parsed = yield* parseWikiArticleCrdtUpdate({
        snapshot: created.crdtSnapshot,
        crdtUpdate: created.initialCrdtUpdate,
      })
      expect(Schema.encodeSync(WikiArticleEditableData)(parsed.data)).toEqual(
        Schema.encodeSync(WikiArticleEditableData)(article),
      )

      for (const origin of ["\ud800", "\udc00"]) {
        const raw = decode({
          ...input,
          translations: {
            en: {
              ...input.translations.en,
              origin,
              content: {
                type: "doc",
                version: 1,
                content: [
                  {
                    type: "paragraph",
                    attrs: { [origin]: origin, nested: { ["__proto__"]: origin } },
                    content: [{ type: "text", text: `${origin} 🍅` }],
                  },
                ],
              },
            },
          },
        })

        expect(raw.translations.en?.origin).toEqual(Option.some(origin))
        const stored = yield* createWikiArticleCrdtDocument(raw)
        const document = snapshotToLoroDoc(stored.crdtSnapshot)
        const projected = yield* parseWikiArticleCrdtUpdate({
          snapshot: stored.crdtSnapshot,
          crdtUpdate: loroDocToUpdate(document),
        })
        assert(projected.data.kind === "PLANT")
        expect(projected.data.translations.en?.origin).toEqual(Option.some("�"))
        const content = Option.getOrThrow(projected.data.translations.en?.content ?? Option.none())

        expect(Schema.encodeSync(Schema.toCodecJson(TiptapDocument))(content)).toEqual({
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              attrs: { "�": "�", nested: { ["__proto__"]: "�" } },
              content: [{ type: "text", text: "� 🍅" }],
            },
          ],
        })

        yield* applyWikiArticleEdit(document, {
          _tag: "SetPlantOrigin",
          locale: "en",
          value: "🌱 fixed",
        })

        const edited = yield* parseWikiArticleCrdtUpdate({
          snapshot: stored.crdtSnapshot,
          crdtUpdate: loroDocToUpdate(document),
        })
        assert(edited.data.kind === "PLANT")
        expect(edited.data.translations.en?.origin).toEqual(Option.some("🌱 fixed"))
      }
    }),
  )

  WikiArticleEditableData.members.forEach((member) => {
    it.effect(`preserves the JSON representation of ${member.fields.kind.literal}`, () =>
      assertPropertyEffect({
        arbitrary: Arbitrary.schema(member),
        predicate: (generated) =>
          Effect.gen(function* () {
            const article = withEditorRichText(generated)
            const created = yield* createWikiArticleCrdtDocument(article)
            const parsed = yield* parseWikiArticleCrdtUpdate({
              snapshot: created.crdtSnapshot,
              crdtUpdate: created.initialCrdtUpdate,
            })
            expect(yield* Schema.encodeEffect(articleJson)(parsed.data)).toEqual(
              toLoroValue(yield* Schema.encodeEffect(articleJson)(article)),
            )
            return true
          }),
        options: { runs: 100, seed: 20261002 },
      }),
    )
  })

  it.effect("preserves arbitrary JSON rich-text attributes, including reserved keys", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(Schema.Json),
      predicate: (value) =>
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
            toLoroValue(yield* Schema.encodeEffect(articleJson)(article)),
          )
          expect(parsed.data.translations.en?.content).toEqual(normalized.translations.en?.content)
          return true
        }),
      options: { runs: 200, seed: 20261002 },
    }),
  )

  it.effect("merges concurrent additions to the same initially absent plant set", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(Schema.Tuple([Schema.String, Schema.String])),
      predicate: ([englishOrigin, portugueseOrigin]) =>
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
          expect(parsed.data.translations.en?.origin).toEqual(
            Option.some(toLoroString(englishOrigin)),
          )
          expect(parsed.data.translations.pt?.origin).toEqual(
            Option.some(toLoroString(portugueseOrigin)),
          )
          return true
        }),
      options: { runs: 100, seed: 20261002 },
    }),
  )
})
