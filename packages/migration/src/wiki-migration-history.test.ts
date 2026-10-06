import { it } from "@effect/vitest"
import {
  LoroDocSnapshot,
  LoroDocUpdate,
  parseWikiArticleCrdtUpdate,
  WikiArticleEditableData,
  WikiPlantArticle,
  TiptapDocument,
} from "@gororobas/domain"
import { toLoroValue } from "@gororobas/domain/crdts/loro-values"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { Effect, Option, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { LoroDoc } from "loro-crdt"
import { assert, expect } from "vitest"

import { gelVegetableNamesToCrdtList } from "./vegetables/gel-vegetable-to-wiki-plant-article.js"
import { buildWikiMigrationHistory } from "./wiki-migration-history.js"

it.effect("replays migrated origin and marked content, including clearing and restoring them", () =>
  assertPropertyEffect({
    arbitrary: Arbitrary.schema(
      Schema.Struct({
        origin: Schema.String,
        text: Schema.NonEmptyString,
      }),
    ),
    predicate: ({ origin, text }) =>
      Effect.gen(function* () {
        const article = WikiPlantArticle.EditableArticle.make({
          kind: "PLANT",
          attributes: Schema.decodeUnknownSync(WikiPlantArticle.EditableAttributes)({}),
          translations: {
            pt: {
              commonNames: gelVegetableNamesToCrdtList(["Test plant"]),
              origin: Option.some(origin),
              grammaticalGender: Option.none(),
              content: Option.some(
                Schema.decodeUnknownSync(TiptapDocument)({
                  type: "doc",
                  version: 1,
                  content: [
                    {
                      type: "paragraph",
                      attrs: { ["__proto__"]: ["retained"] },
                      content: [{ type: "text", text, marks: [{ type: "bold" }] }],
                    },
                  ],
                }),
              ),
            },
          },
        })

        const translation = article.translations.pt
        assert(translation)
        const cleared = WikiPlantArticle.EditableArticle.make({
          ...article,
          translations: { pt: { ...translation, origin: Option.none(), content: Option.none() } },
        })

        const inputs = [article, cleared, article].map((article, index) => ({
          article,
          sourceEditId: `edit-${index}`,
          actorId: null,
          reviewerId: null,
          timestamp: "2025-04-01T12:00:00Z",
        }))

        const versions = yield* buildWikiMigrationHistory(inputs)

        yield* Effect.forEach(
          versions,
          (version, index) =>
            Effect.gen(function* () {
              const snapshot = LoroDocSnapshot.make(Buffer.from(version.loroSnapshot, "base64"))
              const document = new LoroDoc()
              document.import(snapshot)
              const parsed = yield* parseWikiArticleCrdtUpdate({
                snapshot,
                crdtUpdate: LoroDocUpdate.make(document.export({ mode: "update" })),
              })

              expect(
                Schema.encodeSync(Schema.toCodecJson(WikiArticleEditableData))(parsed.data),
              ).toEqual(
                toLoroValue(
                  Schema.encodeSync(Schema.toCodecJson(WikiArticleEditableData))(
                    inputs[index].article,
                  ),
                ),
              )

              expect(document.frontiers()).toEqual(version.frontier)
            }),
          { concurrency: 1 },
        )

        expect(versions[1].changes).not.toEqual([])
        expect(versions[1].loroDiff).not.toEqual([])
        return true
      }),
  }),
)
