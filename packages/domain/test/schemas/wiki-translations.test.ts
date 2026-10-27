import { assert, describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Option, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { LoroMap } from "loro-crdt"

import { GrammaticalGender, SupportedLanguage } from "../../src/common/enums.js"
import { WikiArticleId } from "../../src/common/ids.js"
import { ValidName } from "../../src/common/primitives.js"
import { loroDocToUpdate, snapshotToLoroDoc } from "../../src/crdts/lib.js"
import { toLoroValue } from "../../src/crdts/loro-values.js"
import { assertPropertyEffect, deepEquals } from "../../src/testing.js"
import { WikiPlantArticle } from "../../src/wiki/kinds/plant.js"
import { WikiArticleCrdt } from "../../src/wiki/wiki-article-crdt.js"
import { WikiArticleEditableTranslation } from "../../src/wiki/wiki-article-translation.js"
import {
  WikiArticleEditableData,
  WikiArticleTranslationProjectionRow,
  projectTranslation,
} from "../../src/wiki/wiki-article.js"
import { wikiRichText } from "../fixtures/wiki-rich-text.js"
import { withEditorRichText } from "../fixtures/wiki-rich-text.js"

const decodePlant = Schema.decodeSync(WikiPlantArticle.EditableArticle)

const plant = decodePlant({
  kind: "PLANT",
  attributes: {},
  translations: {
    en: {
      commonNames: [{ id: "commonname01", name: "Pumpkin" }],
      origin: "Central America",
      content: {
        type: "doc",
        version: 1,
        content: [
          { type: "paragraph", attrs: { ["__proto__"]: "retained", nodeId: "paragraph001" } },
        ],
      },
    },
    pt: { commonNames: [{ id: "commonname02", name: "Abóbora" }] },
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
    expect(JSON.parse(encoded.commonNames)).toEqual([{ name: "Pumpkin", grammaticalGender: null }])

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

  it.effect(
    "translation field edits preserve unrelated data and list/rich-text identities across article kinds",
    () =>
      assertPropertyEffect({
        arbitrary: Arbitrary.schema(
          Schema.Struct({
            article: WikiArticleEditableData,
            language: SupportedLanguage,
            addedName: ValidName,
            updatedName: ValidName,
            grammaticalGender: GrammaticalGender,
          }),
        ),
        options: { runs: 30 },
        predicate: ({ article, language, addedName, updatedName, grammaticalGender }) =>
          Effect.gen(function* () {
            const created = yield* WikiArticleCrdt.create(withEditorRichText(article))
            const document = snapshotToLoroDoc(created.crdtSnapshot)

            if (document.getMap("translations").get(language) === undefined) {
              yield* WikiArticleCrdt.applyEdit(document, {
                _tag: "AddedWikiArticleTranslation",
                language,
                value: Schema.decodeSync(WikiArticleEditableTranslation)({
                  commonNames: [{ id: "translation1", name: "Pumpkin" }],
                }),
              })
            }

            const before = yield* WikiArticleCrdt.read(document)
            const beforeTranslation = Option.getOrThrow(
              Option.fromUndefinedOr(before.translations[language]),
            )
            const translation = document.getMap("translations").get(language)
            assert(translation instanceof LoroMap)
            const listId = translation.ensureMergeableMovableList("commonNames").id
            const originalContent = translation.get("content")
            const originalContentId =
              originalContent instanceof LoroMap ? originalContent.id : undefined

            yield* WikiArticleCrdt.applyEdit(document, {
              _tag: "AddedWikiArticleTranslationCommonName",
              language,
              value: { name: addedName, grammaticalGender: Option.none() },
            })

            const added = yield* WikiArticleCrdt.read(document)
            const names = Option.getOrThrow(
              Option.fromUndefinedOr(added.translations[language]),
            ).commonNames
            const newName = Option.getOrThrow(
              Option.fromUndefinedOr(names[beforeTranslation.commonNames.length]),
            )
            expect(names).toHaveLength(beforeTranslation.commonNames.length + 1)

            yield* WikiArticleCrdt.applyEdit(document, {
              _tag: "UpdatedWikiArticleTranslationCommonName",
              language,
              id: newName.id,
              name: updatedName,
            })

            yield* WikiArticleCrdt.applyEdit(document, {
              _tag: "MovedWikiArticleTranslationCommonName",
              language,
              id: newName.id,
              newIndex: 0,
            })

            const moved = yield* WikiArticleCrdt.read(document)

            expect(
              Option.getOrThrow(Option.fromUndefinedOr(moved.translations[language]))
                .commonNames[0],
            ).toEqual({
              id: newName.id,
              name: updatedName,
              grammaticalGender: Option.none(),
            })

            expect(translation.ensureMergeableMovableList("commonNames").id).toBe(listId)

            yield* WikiArticleCrdt.applyEdit(document, {
              _tag: "SetWikiArticleTranslationContent",
              language,
              content: wikiRichText,
            })

            const contentContainer = translation.get("content")
            assert(contentContainer instanceof LoroMap)
            const contentId = contentContainer.id
            expect(contentId).toBe(originalContentId ?? contentId)

            yield* WikiArticleCrdt.applyEdit(document, {
              _tag: "SetWikiArticleTranslationContent",
              language,
              content: wikiRichText,
            })

            const sameContent = translation.get("content")
            assert(sameContent instanceof LoroMap)
            expect(sameContent.id).toBe(contentId)

            yield* WikiArticleCrdt.applyEdit(document, {
              _tag: "SetWikiArticleTranslationCommonNameGrammaticalGender",
              language,
              id: newName.id,
              value: grammaticalGender,
            })

            const set = yield* WikiArticleCrdt.read(document)
            const setTranslation = Option.getOrThrow(
              Option.fromUndefinedOr(set.translations[language]),
            )
            expect(setTranslation.content).toEqual(Option.some(wikiRichText))
            expect(setTranslation.commonNames[0].grammaticalGender).toEqual(
              Option.some(grammaticalGender),
            )

            yield* WikiArticleCrdt.applyEdit(document, {
              _tag: "UnsetWikiArticleTranslationContent",
              language,
            })

            yield* WikiArticleCrdt.applyEdit(document, {
              _tag: "UnsetWikiArticleTranslationCommonNameGrammaticalGender",
              language,
              id: newName.id,
            })

            expect(
              (yield* WikiArticleCrdt.read(document)).translations[language]?.commonNames[0]
                .grammaticalGender,
            ).toEqual(Option.none())

            yield* WikiArticleCrdt.applyEdit(document, {
              _tag: "RemovedWikiArticleTranslationCommonName",
              language,
              id: newName.id,
            })

            const after = yield* WikiArticleCrdt.read(document)
            const afterTranslation = Option.getOrThrow(
              Option.fromUndefinedOr(after.translations[language]),
            )
            expect(afterTranslation.content).toEqual(Option.none())

            expect({
              ...afterTranslation,
              content: beforeTranslation.content,
            }).toEqual(beforeTranslation)

            expect({ ...after.translations, [language]: beforeTranslation }).toEqual(
              before.translations,
            )
            expect(deepEquals(after.attributes, before.attributes)).toBe(true)
            expect(after.kind).toBe(before.kind)
            return true
          }),
      }),
  )

  it.effect(
    "adding and removing a translation leaves other languages intact and rejects duplicate additions",
    () =>
      Effect.gen(function* () {
        const created = yield* WikiArticleCrdt.create(plant)
        const document = snapshotToLoroDoc(created.crdtSnapshot)

        const value = Schema.decodeSync(WikiArticleEditableTranslation)({
          commonNames: [{ id: "translation1", name: "Calabaza", grammaticalGender: "FEMALE" }],
          content: wikiRichText,
        })

        yield* WikiArticleCrdt.applyEdit(document, {
          _tag: "AddedWikiArticleTranslation",
          language: "es",
          value,
        })

        const added = yield* WikiArticleCrdt.read(document)
        expect(added.translations.es).toMatchObject(value)
        expect(added.translations.en).toEqual(created.data.translations.en)
        expect(added.translations.pt).toEqual(created.data.translations.pt)
        const before = document.toJSON()

        expect(
          Exit.isFailure(
            yield* Effect.exit(
              WikiArticleCrdt.applyEdit(document, {
                _tag: "AddedWikiArticleTranslation",
                language: "es",
                value,
              }),
            ),
          ),
        ).toBe(true)

        expect(document.toJSON()).toEqual(before)
        yield* WikiArticleCrdt.applyEdit(document, {
          _tag: "RemovedWikiArticleTranslation",
          language: "es",
        })
        expect(yield* WikiArticleCrdt.read(document)).toEqual(created.data)
      }),
  )

  it.effect(
    "re-adding a deleted translation does not restore old names, content, gender, or kind-specific fields",
    () =>
      Effect.gen(function* () {
        const created = yield* WikiArticleCrdt.create(plant)
        const document = snapshotToLoroDoc(created.crdtSnapshot)

        yield* WikiArticleCrdt.applyEdit(document, {
          _tag: "SetWikiArticleTranslationCommonNameGrammaticalGender",
          language: "en",
          id: Option.getOrThrow(Option.fromUndefinedOr(plant.translations.en)).commonNames[0].id,
          value: "FEMALE",
        })

        yield* WikiArticleCrdt.applyEdit(document, {
          _tag: "RemovedWikiArticleTranslation",
          language: "en",
        })
        const value = Schema.decodeSync(WikiArticleEditableTranslation)({
          commonNames: [{ id: "translation2", name: "Squash" }],
        })

        yield* WikiArticleCrdt.applyEdit(document, {
          _tag: "AddedWikiArticleTranslation",
          language: "en",
          value,
        })

        const restored = yield* WikiArticleCrdt.read(document)
        assert(restored.kind === "PLANT")
        expect(restored.translations.en).toEqual({ ...value, origin: Option.none() })
        expect(restored.translations.pt).toEqual(created.data.translations.pt)

        yield* WikiArticleCrdt.applyEdit(document, {
          _tag: "SetWikiArticleTranslationContent",
          language: "en",
          content: wikiRichText,
        })

        expect((yield* WikiArticleCrdt.read(document)).translations.en?.content).toEqual(
          Option.some(wikiRichText),
        )
      }),
  )

  it.effect(
    "missing translations, invalid moves, and removal of the last common name fail without changing the document",
    () =>
      Effect.gen(function* () {
        const created = yield* WikiArticleCrdt.create(plant)
        const document = snapshotToLoroDoc(created.crdtSnapshot)
        const before = document.toJSON()
        const name = Option.getOrThrow(
          Option.fromUndefinedOr(created.data.translations.pt?.commonNames[0]),
        )

        const missingEdits = [
          { _tag: "RemovedWikiArticleTranslation", language: "es" },
          { _tag: "SetWikiArticleTranslationContent", language: "es", content: wikiRichText },
          { _tag: "UnsetWikiArticleTranslationContent", language: "es" },
          {
            _tag: "AddedWikiArticleTranslationCommonName",
            language: "es",
            value: { name: name.name, grammaticalGender: name.grammaticalGender },
          },
          {
            _tag: "UpdatedWikiArticleTranslationCommonName",
            language: "es",
            id: name.id,
            name: name.name,
          },
          {
            _tag: "MovedWikiArticleTranslationCommonName",
            language: "es",
            id: name.id,
            newIndex: 0,
          },
          { _tag: "RemovedWikiArticleTranslationCommonName", language: "es", id: name.id },
          {
            _tag: "SetWikiArticleTranslationCommonNameGrammaticalGender",
            language: "es",
            id: name.id,
            value: "FEMALE",
          },
          {
            _tag: "UnsetWikiArticleTranslationCommonNameGrammaticalGender",
            language: "es",
            id: name.id,
          },
        ] as const

        yield* Effect.forEach(
          missingEdits,
          (edit) =>
            Effect.gen(function* () {
              expect(
                Exit.isFailure(yield* Effect.exit(WikiArticleCrdt.applyEdit(document, edit))),
              ).toBe(true)
              expect(document.toJSON()).toEqual(before)
            }),
          { concurrency: 1 },
        )

        expect(
          Exit.isFailure(
            yield* Effect.exit(
              WikiArticleCrdt.applyEdit(document, {
                _tag: "RemovedWikiArticleTranslationCommonName",
                language: "pt",
                id: name.id,
              }),
            ),
          ),
        ).toBe(true)

        expect(document.toJSON()).toEqual(before)

        yield* Effect.forEach(
          [-1, 1],
          (newIndex) =>
            Effect.gen(function* () {
              expect(
                Exit.isFailure(
                  yield* Effect.exit(
                    WikiArticleCrdt.applyEdit(document, {
                      _tag: "MovedWikiArticleTranslationCommonName",
                      language: "pt",
                      id: name.id,
                      newIndex,
                    }),
                  ),
                ),
              ).toBe(true)

              expect(document.toJSON()).toEqual(before)
            }),
          { concurrency: 1 },
        )
      }),
  )
})
