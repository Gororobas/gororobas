import { assert, expect, it } from "@effect/vitest"
import { nodeIdOf, WikiArticleCrdt } from "@gororobas/domain"
import {
  LoroDocSnapshot,
  LoroDocUpdate,
  WikiArticleEditableData,
  WikiPlantArticle,
  TiptapDocument,
} from "@gororobas/domain"
import { toLoroValue } from "@gororobas/domain/crdts/loro-values"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { Effect, Option, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { LoroDoc } from "loro-crdt"

import { GelGender } from "./schemas/gel/enums.js"
import { gelVegetableNamesToCrdtList } from "./vegetables/gel-vegetable-to-wiki-plant-article.js"
import { buildWikiMigrationHistory } from "./wiki-migration-history.js"

it.effect(
  "replays migrated name gender, origin, and marked content, including clearing and restoring them",
  () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(
        Schema.Struct({
          origin: Schema.String,
          text: Schema.NonEmptyString,
          gender: GelGender,
        }),
      ),
      predicate: ({ origin, text, gender }) =>
        Effect.gen(function* () {
          const article = WikiPlantArticle.EditableArticle.make({
            kind: "PLANT",
            attributes: Schema.decodeSync(WikiPlantArticle.EditableAttributes)({}),
            translations: {
              pt: {
                commonNames: gelVegetableNamesToCrdtList(["Mandioca", "Aipim"], gender),
                origin: Option.some(origin),
                content: Option.some(
                  Schema.decodeSync(TiptapDocument)({
                    type: "doc",
                    version: 1,
                    content: [
                      {
                        type: "paragraph",
                        attrs: { ["__proto__"]: ["retained"], nodeId: "paragraph001" },
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
            translations: {
              pt: {
                ...translation,
                commonNames: gelVegetableNamesToCrdtList(["Aipim", "Mandioca"], null),
                origin: Option.none(),
                content: Option.none(),
              },
            },
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
                const parsed = yield* WikiArticleCrdt.parseUpdate({
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

it.effect(
  "keeps the node IDs it assigns to legacy content across versions of the same structure",
  () =>
    Effect.gen(function* () {
      const articleSaying = (text: string) =>
        WikiPlantArticle.EditableArticle.make({
          kind: "PLANT",
          attributes: Schema.decodeSync(WikiPlantArticle.EditableAttributes)({}),
          translations: {
            pt: {
              commonNames: gelVegetableNamesToCrdtList(["Mandioca"], null),
              origin: Option.none(),
              content: Option.some(
                Schema.decodeSync(TiptapDocument)({
                  type: "doc",
                  version: 1,
                  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
                }),
              ),
            },
          },
        })

      const versions = yield* buildWikiMigrationHistory(
        [articleSaying("Raiz"), articleSaying("Raiz tuberosa")].map((article, index) => ({
          article,
          sourceEditId: `edit-${index}`,
          actorId: null,
          reviewerId: null,
          timestamp: "2025-04-01T12:00:00Z",
        })),
      )

      const nodeIds = yield* Effect.forEach(
        versions,
        (version) =>
          Effect.gen(function* () {
            const snapshot = LoroDocSnapshot.make(Buffer.from(version.loroSnapshot, "base64"))
            const document = new LoroDoc()
            document.import(snapshot)
            const parsed = yield* WikiArticleCrdt.parseUpdate({
              snapshot,
              crdtUpdate: LoroDocUpdate.make(document.export({ mode: "update" })),
            })

            return Option.flatMap(
              Option.flatMap(
                Option.fromUndefinedOr(parsed.data.translations.pt),
                (translation) => translation.content,
              ),
              (content) => Option.flatMap(Option.fromUndefinedOr(content.content[0]), nodeIdOf),
            )
          }),
        { concurrency: 1 },
      )

      expect(nodeIds[0]?.pipe(Option.isSome)).toBe(true)
      expect(nodeIds[1]).toEqual(nodeIds[0])
    }),
)
