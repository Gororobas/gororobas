import { assert, describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Option, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { type LoroDoc, LoroMap, LoroMovableList } from "loro-crdt"

import { GrammaticalGender } from "../../src/common/enums.js"
import { LoroListItemId, WikiArticleId } from "../../src/common/ids.js"
import { ValidName } from "../../src/common/primitives.js"
import { loroDocToUpdate } from "../../src/crdts/lib.js"
import { assertPropertyEffect } from "../../src/testing.js"
import { WikiPlantArticle } from "../../src/wiki/kinds/plant.js"
import { WikiArticleCrdt } from "../../src/wiki/wiki-article-crdt.js"
import {
  WikiArticleTranslationProjectionRow,
  projectTranslation,
} from "../../src/wiki/wiki-article.js"

const plant = Schema.decodeSync(WikiPlantArticle.EditableArticle)({
  kind: "PLANT",
  attributes: {},
  translations: {
    pt: {
      commonNames: [
        { id: "mandioca0001", name: "Mandioca", grammaticalGender: "FEMALE" },
        { id: "aipim0000001", name: "Aipim", grammaticalGender: "MALE" },
      ],
    },
  },
})

const firstId = LoroListItemId.make("mandioca0001")

const namesIn = (document: LoroDoc) => {
  const translation = document.getMap("translations").get("pt")
  assert(translation instanceof LoroMap)
  const names = translation.get("commonNames")
  assert(names instanceof LoroMovableList)
  return names
}

describe("Wiki common names", () => {
  it.effect("projects different genders per name and round trips the SQL JSON", () =>
    Effect.gen(function* () {
      const created = yield* WikiArticleCrdt.create(plant)

      const row = Option.getOrThrow(
        projectTranslation({
          article: created.data,
          language: "pt",
          wikiArticleId: WikiArticleId.make("0199a000-0000-7000-8000-000000000001"),
        }),
      )

      expect(row.commonNames).toEqual([
        { name: "Mandioca", grammaticalGender: Option.some("FEMALE") },
        { name: "Aipim", grammaticalGender: Option.some("MALE") },
      ])
      expect(row.searchableTitle).toBe("mandioca")
      expect(row.searchableNames).toContain("aipim")

      expect(
        yield* Schema.decodeEffect(WikiArticleTranslationProjectionRow)(
          yield* Schema.encodeEffect(WikiArticleTranslationProjectionRow)(row),
        ),
      ).toEqual(row)
    }),
  )

  it.effect(
    "concurrent rename and gender edits merge independently, including newly added names",
    () =>
      assertPropertyEffect({
        arbitrary: Arbitrary.schema(
          Schema.Struct({
            name: ValidName,
            gender: GrammaticalGender,
            shouldAddName: Schema.Boolean,
          }),
        ),
        options: { runs: 30 },
        predicate: ({ name, gender, shouldAddName }) =>
          Effect.gen(function* () {
            const { document } = yield* WikiArticleCrdt.create(plant)
            let id = firstId

            if (shouldAddName) {
              yield* WikiArticleCrdt.applyEdit(document, {
                _tag: "AddedWikiArticleTranslationCommonName",
                language: "pt",
                value: { name: "Macaxeira", grammaticalGender: Option.none() },
              })

              const data = yield* WikiArticleCrdt.read(document)
              const translation = Option.getOrThrow(Option.fromUndefinedOr(data.translations.pt))
              id = Option.getOrThrow(
                Option.fromUndefinedOr(translation.commonNames[translation.commonNames.length - 1]),
              ).id
            }

            document.commit()
            const spelling = document.fork()
            const grammaticalGender = document.fork()
            const originalMap = namesIn(document)
              .toArray()
              .find((item) => item instanceof LoroMap && item.get("id") === id)
            assert(originalMap instanceof LoroMap)

            yield* WikiArticleCrdt.applyEdit(spelling, {
              _tag: "UpdatedWikiArticleTranslationCommonName",
              language: "pt",
              id,
              name,
            })

            yield* WikiArticleCrdt.applyEdit(grammaticalGender, {
              _tag: "SetWikiArticleTranslationCommonNameGrammaticalGender",
              language: "pt",
              id,
              value: gender,
            })

            const spellingUpdate = spelling.export({ mode: "update", from: document.version() })
            const genderUpdate = grammaticalGender.export({
              mode: "update",
              from: document.version(),
            })
            spelling.import(genderUpdate)
            grammaticalGender.import(spellingUpdate)
            const merged = yield* WikiArticleCrdt.read(spelling)
            expect(merged).toEqual(yield* WikiArticleCrdt.read(grammaticalGender))
            const translation = Option.getOrThrow(Option.fromUndefinedOr(merged.translations.pt))

            expect(translation.commonNames.find((item) => item.id === id)).toEqual({
              id,
              name,
              grammaticalGender: Option.some(gender),
            })

            const mergedMap = namesIn(spelling)
              .toArray()
              .find((item) => item instanceof LoroMap && item.get("id") === id)
            assert(mergedMap instanceof LoroMap)
            expect(mergedMap.id).toBe(originalMap.id)
            expect(translation.commonNames[1]).toEqual(plant.translations.pt?.commonNames[1])
            return true
          }),
      }),
  )

  it.effect(
    "rejects atomic entries and invalid or missing name targets without mutating the document",
    () =>
      Effect.gen(function* () {
        const created = yield* WikiArticleCrdt.create(plant)
        const document = created.document
        const before = document.toJSON()
        const missingId = LoroListItemId.make("missing00001")

        const edits = [
          {
            _tag: "UpdatedWikiArticleTranslationCommonName",
            language: "pt",
            id: missingId,
            name: "Macaxeira",
          },
          { _tag: "RemovedWikiArticleTranslationCommonName", language: "pt", id: missingId },
          {
            _tag: "MovedWikiArticleTranslationCommonName",
            language: "pt",
            id: missingId,
            newIndex: 0,
          },
          {
            _tag: "SetWikiArticleTranslationCommonNameGrammaticalGender",
            language: "pt",
            id: missingId,
            value: "FEMALE",
          },
          {
            _tag: "UnsetWikiArticleTranslationCommonNameGrammaticalGender",
            language: "pt",
            id: missingId,
          },
        ] as const

        yield* Effect.forEach(
          edits,
          (edit) =>
            Effect.gen(function* () {
              expect(
                Exit.isFailure(yield* Effect.exit(WikiArticleCrdt.applyEdit(document, edit))),
              ).toBe(true)
              expect(document.toJSON()).toEqual(before)
            }),
          { concurrency: 1 },
        )

        const malformed = document.fork()
        namesIn(malformed).set(0, { id: firstId, name: "Mandioca", grammaticalGender: "FEMALE" })

        expect(
          Exit.isFailure(
            yield* Effect.exit(
              WikiArticleCrdt.parseUpdate({
                snapshot: created.crdtSnapshot,
                crdtUpdate: loroDocToUpdate(malformed),
              }),
            ),
          ),
        ).toBe(true)
      }),
  )
})
