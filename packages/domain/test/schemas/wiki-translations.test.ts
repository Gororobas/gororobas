import { assert, describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Option, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

import { WikiArticleId } from "../../src/common/ids.js"
import { loroDocToUpdate, snapshotToLoroDoc } from "../../src/crdts/lib.js"
import { toLoroValue } from "../../src/crdts/loro-values.js"
import { assertPropertyEffect, deepEquals } from "../../src/testing.js"
import { WikiPlantArticle } from "../../src/wiki/kinds/plant.js"
import {
  applyWikiArticleEdit,
  createWikiArticleCrdtDocument,
  parseWikiArticleCrdtUpdate,
} from "../../src/wiki/wiki-article-crdt.js"
import {
  WikiArticleEditableData,
  WikiArticleTranslationMaterializedRow,
  editableToMaterializedTranslation,
} from "../../src/wiki/wiki-article.js"
import { withEditorRichText } from "../fixtures/wiki-rich-text.js"

const decodePlant = Schema.decodeUnknownSync(WikiPlantArticle.EditableArticle)
const plant = decodePlant({
  kind: "PLANT",
  attributes: {},
  translations: {
    en: {
      commonNames: [{ id: "commonname01", value: "Pumpkin" }],
      origin: "Central America",
      content: {
        type: "doc",
        version: 1,
        content: [{ type: "paragraph", attrs: { ["__proto__"]: "retained" } }],
      },
    },
    pt: { commonNames: [{ id: "commonname02", value: "Abóbora" }] },
  },
})

describe("Kind-specific wiki translations", () => {
  it.effect("article creation preserves every kind and its translations in the snapshot", () =>
    assertPropertyEffect(
      Arbitrary.schema(WikiArticleEditableData),
      (generated) =>
        Effect.gen(function* () {
          const article = withEditorRichText(generated)
          const created = yield* createWikiArticleCrdtDocument(article)
          const parsed = yield* parseWikiArticleCrdtUpdate({
            snapshot: created.crdtSnapshot,
            crdtUpdate: created.initialCrdtUpdate,
          })
          const codec = Schema.toCodecJson(WikiArticleEditableData)
          const normalized = yield* Schema.decodeEffect(codec)(
            toLoroValue(yield* Schema.encodeEffect(codec)(article)),
          )
          return deepEquals(normalized, parsed.data)
        }),
      { runs: 30 },
    ),
  )

  it("materializes origin only for plants and accepts older translations without origin", () => {
    const id = Schema.decodeUnknownSync(WikiArticleId)("0199a000-0000-7000-8000-000000000001")
    const row = Option.getOrThrow(editableToMaterializedTranslation(plant, "en", id))
    expect(row.kind).toBe("PLANT")
    assert(row.kind === "PLANT")
    expect(row.origin).toEqual(Option.some("Central America"))
    const portuguese = Option.getOrThrow(editableToMaterializedTranslation(plant, "pt", id))
    assert(portuguese.kind === "PLANT")
    expect(portuguese.origin).toEqual(Option.none())
    expect(editableToMaterializedTranslation(plant, "es", id)).toEqual(Option.none())
    const encoded = Schema.encodeSync(WikiArticleTranslationMaterializedRow)(row)
    expect(encoded.commonNames).toBe('["Pumpkin"]')
    const animal = Schema.decodeUnknownSync(WikiArticleTranslationMaterializedRow)({
      ...encoded,
      kind: "ANIMAL",
      origin: null,
    })
    expect(animal).not.toHaveProperty("origin")
  })

  it.effect(
    "origin edits affect only the requested locale and reject missing locales and other kinds",
    () =>
      Effect.gen(function* () {
        const created = yield* createWikiArticleCrdtDocument(plant)
        const document = snapshotToLoroDoc(created.crdtSnapshot)
        yield* applyWikiArticleEdit(document, {
          _tag: "SetPlantOrigin",
          locale: "pt",
          value: "América Central",
        })
        let parsed = yield* parseWikiArticleCrdtUpdate({
          snapshot: created.crdtSnapshot,
          crdtUpdate: loroDocToUpdate(document),
        })
        assert(parsed.data.kind === "PLANT")
        expect(parsed.data.translations.pt?.origin).toEqual(Option.some("América Central"))
        expect(parsed.data.translations.en?.origin).toEqual(Option.some("Central America"))
        expect(parsed.data.translations.en?.content).toEqual(plant.translations.en?.content)
        yield* applyWikiArticleEdit(document, { _tag: "UnsetPlantOrigin", locale: "pt" })
        parsed = yield* parseWikiArticleCrdtUpdate({
          snapshot: created.crdtSnapshot,
          crdtUpdate: loroDocToUpdate(document),
        })
        assert(parsed.data.kind === "PLANT")
        expect(parsed.data.translations.pt?.origin).toEqual(Option.none())
        expect(
          Exit.isFailure(
            yield* Effect.exit(
              applyWikiArticleEdit(document, {
                _tag: "SetPlantOrigin",
                locale: "es",
                value: "América Central",
              }),
            ),
          ),
        ).toBe(true)
        expect(
          Exit.isFailure(
            yield* Effect.exit(
              applyWikiArticleEdit(document, {
                _tag: "UnsetPlantOrigin",
                locale: "es",
              }),
            ),
          ),
        ).toBe(true)
        expect(document.getMap("translations").get("es")).toBeUndefined()
        document.getMap("kind").set("value", "ANIMAL")
        expect(
          Exit.isFailure(
            yield* Effect.exit(
              applyWikiArticleEdit(document, {
                _tag: "SetPlantOrigin",
                locale: "en",
                value: "Africa",
              }),
            ),
          ),
        ).toBe(true)
      }),
  )
})
