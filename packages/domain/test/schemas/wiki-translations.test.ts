import { assert, describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Option, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

import { WikiArticleId } from "../../src/common/ids.js"
import { loroDocToUpdate, snapshotToLoroDoc } from "../../src/crdts/lib.js"
import { toLoroValue } from "../../src/crdts/loro-values.js"
import { assertPropertyEffect, deepEquals } from "../../src/testing.js"
import { WikiPlantArticle } from "../../src/wiki/kinds/plant.js"
import { WikiArticleCrdt } from "../../src/wiki/wiki-article-crdt.js"
import {
  WikiArticleEditableData,
  WikiArticleTranslationProjectionRow,
  projectTranslation,
} from "../../src/wiki/wiki-article.js"
import { withEditorRichText } from "../fixtures/wiki-rich-text.js"

const decodePlant = Schema.decodeSync(WikiPlantArticle.EditableArticle)

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
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(WikiArticleEditableData),
      predicate: (generated) =>
        Effect.gen(function* () {
          const article = withEditorRichText(generated)
          const created = yield* WikiArticleCrdt.create(article)
          const parsed = yield* WikiArticleCrdt.parseUpdate({
            snapshot: created.crdtSnapshot,
            crdtUpdate: created.initialCrdtUpdate,
          })
          const codec = Schema.toCodecJson(WikiArticleEditableData)
          const normalized = yield* Schema.decodeEffect(codec)(
            toLoroValue(yield* Schema.encodeEffect(codec)(article)),
          )
          return deepEquals(normalized, parsed.data)
        }),
      options: { runs: 30 },
    }),
  )

  it("projects origin only for plants and accepts older translations without origin", () => {
    const id = Schema.decodeSync(WikiArticleId)("0199a000-0000-7000-8000-000000000001")
    const row = Option.getOrThrow(
      projectTranslation({ article: plant, language: "en", wikiArticleId: id }),
    )
    expect(row.kind).toBe("PLANT")
    assert(row.kind === "PLANT")
    expect(row.origin).toEqual(Option.some("Central America"))
    const portuguese = Option.getOrThrow(
      projectTranslation({ article: plant, language: "pt", wikiArticleId: id }),
    )
    assert(portuguese.kind === "PLANT")
    expect(portuguese.origin).toEqual(Option.none())
    expect(projectTranslation({ article: plant, language: "es", wikiArticleId: id })).toEqual(
      Option.none(),
    )
    const encoded = Schema.encodeSync(WikiArticleTranslationProjectionRow)(row)
    expect(encoded.commonNames).toBe('["Pumpkin"]')

    // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- This test supplies excess fields to verify that fields from other wiki kinds are stripped.
    const animal = Schema.decodeUnknownSync(WikiArticleTranslationProjectionRow)({
      ...encoded,
      kind: "ANIMAL",
      origin: null,
    })

    expect(animal).not.toHaveProperty("origin")
  })

  it.effect(
    "origin edits affect only the requested language and reject missing languages and other kinds",
    () =>
      Effect.gen(function* () {
        const created = yield* WikiArticleCrdt.create(plant)
        const document = snapshotToLoroDoc(created.crdtSnapshot)

        yield* WikiArticleCrdt.applyEdit(document, {
          _tag: "SetPlantOrigin",
          language: "pt",
          value: "América Central",
        })

        let parsed = yield* WikiArticleCrdt.parseUpdate({
          snapshot: created.crdtSnapshot,
          crdtUpdate: loroDocToUpdate(document),
        })
        assert(parsed.data.kind === "PLANT")
        expect(parsed.data.translations.pt?.origin).toEqual(Option.some("América Central"))
        expect(parsed.data.translations.en?.origin).toEqual(Option.some("Central America"))
        expect(parsed.data.translations.en?.content).toEqual(plant.translations.en?.content)
        yield* WikiArticleCrdt.applyEdit(document, { _tag: "UnsetPlantOrigin", language: "pt" })
        parsed = yield* WikiArticleCrdt.parseUpdate({
          snapshot: created.crdtSnapshot,
          crdtUpdate: loroDocToUpdate(document),
        })
        assert(parsed.data.kind === "PLANT")
        expect(parsed.data.translations.pt?.origin).toEqual(Option.none())

        expect(
          Exit.isFailure(
            yield* Effect.exit(
              WikiArticleCrdt.applyEdit(document, {
                _tag: "SetPlantOrigin",
                language: "es",
                value: "América Central",
              }),
            ),
          ),
        ).toBe(true)

        expect(
          Exit.isFailure(
            yield* Effect.exit(
              WikiArticleCrdt.applyEdit(document, {
                _tag: "UnsetPlantOrigin",
                language: "es",
              }),
            ),
          ),
        ).toBe(true)

        expect(document.getMap("translations").get("es")).toBeUndefined()
        document.getMap("kind").set("value", "ANIMAL")

        expect(
          Exit.isFailure(
            yield* Effect.exit(
              WikiArticleCrdt.applyEdit(document, {
                _tag: "SetPlantOrigin",
                language: "en",
                value: "Africa",
              }),
            ),
          ),
        ).toBe(true)
      }),
  )
})
