import { describe, expect, it } from "@effect/vitest"
import { ContentLanguage, IdGen, type SupportedLanguage } from "@gororobas/domain"
import { Context, Effect, Layer, Option, Array as EffectArray, Order } from "effect"
import { SqlClient } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"

import {
  TestLayerWithRepositories,
  fixture,
  makeDocument,
} from "../../test/publication-comments/fixtures.js"
import { listPublicationCommentTranslationRowsByPublicationCommentId } from "../publication-comments/queries.js"
import { LanguageDetectionError, LanguageDetectionService } from "./language-detection-service.js"
import {
  PublicationCommentTranslationWorkflow,
  PublicationCommentTranslationWorkflowLayer,
} from "./publication-comment-translation-workflow.js"
import { TranslationError, TranslationService } from "./translation-service.js"

const memoryWorkflows = (
  dependencies: Layer.Layer<
    | Context.Service.Identifier<typeof LanguageDetectionService>
    | Context.Service.Identifier<typeof TranslationService>
  >,
) =>
  PublicationCommentTranslationWorkflowLayer.pipe(
    Layer.provideMerge(WorkflowEngine.layerMemory),
    Layer.provideMerge(dependencies),
    Layer.provideMerge(TestLayerWithRepositories),
  )

describe("PublicationCommentTranslationWorkflow", () => {
  it.live("retries detection and translation independently and persists partial success", () => {
    let detections = 0
    const attempts: Record<SupportedLanguage, number> = { en: 0, pt: 0, es: 0 }

    const dependencies = Layer.mergeAll(
      Layer.succeed(LanguageDetectionService, {
        detectLanguage: () =>
          Effect.suspend(() =>
            ++detections === 1
              ? Effect.fail(
                  new LanguageDetectionError({
                    message: "Transient",
                    retryable: true,
                    cause: new Error("Transient"),
                  }),
                )
              : Effect.succeed(ContentLanguage.make("en-US")),
          ),
      }),
      Layer.succeed(TranslationService, {
        getServiceId: () => "test",
        translate: ({ targetLanguage }) =>
          Effect.suspend(() => {
            attempts[targetLanguage]++

            return targetLanguage === "es" || attempts[targetLanguage] === 1
              ? Effect.fail(
                  new TranslationError({ message: "Unavailable", cause: new Error("Unavailable") }),
                )
              : Effect.succeed("<p>Translated</p>")
          }),
      }),
    )

    return Effect.gen(function* () {
      const { publicationComments, publicationCommentId } = yield* fixture
      const before = Option.getOrThrow(
        yield* publicationComments.findPublicationCommentRowById(publicationCommentId),
      )

      const payload = {
        publicationCommentId,
        sourceRevisionId: before.currentRevisionId,
        sourceContent: before.sourceContent,
      }

      yield* PublicationCommentTranslationWorkflow.execute(payload)
      const after = Option.getOrThrow(
        yield* publicationComments.findPublicationCommentRowById(publicationCommentId),
      )
      expect(after.sourceLanguage).toBe("en-US")
      expect(after.currentRevisionId).toBe(before.currentRevisionId)
      expect(after.editCount).toBe(0)
      expect(after.updatedAt).toEqual(before.updatedAt)
      const translations =
        yield* listPublicationCommentTranslationRowsByPublicationCommentId(publicationCommentId)
      expect(translations.map((row) => row.language)).toEqual(["pt"])
      expect(translations[0]?.translatedAtRevisionId).toBe(before.currentRevisionId)
      expect(detections).toBe(2)
      expect(attempts).toEqual({ en: 0, pt: 2, es: 4 })
      yield* PublicationCommentTranslationWorkflow.execute(payload)
      expect(detections).toBe(2)
      expect(attempts).toEqual({ en: 0, pt: 2, es: 4 })
    }).pipe(Effect.provide(memoryWorkflows(dependencies)))
  })

  it.live(
    "skips existing translations and translates all supported languages from an unsupported source",
    () => {
      const requested: SupportedLanguage[] = []

      return Effect.gen(function* () {
        const { publicationComments, publicationCommentId } = yield* fixture
        const before = Option.getOrThrow(
          yield* publicationComments.findPublicationCommentRowById(publicationCommentId),
        )

        yield* publicationComments.setPublicationCommentSourceLanguage({
          publicationCommentId,
          sourceRevisionId: before.currentRevisionId,
          sourceLanguage: ContentLanguage.make("fr"),
        })

        yield* publicationComments.upsertPublicationCommentTranslations({
          publicationCommentId,
          sourceRevisionId: before.currentRevisionId,
          translations: [{ language: "pt", content: makeDocument("Existing") }],
        })

        yield* PublicationCommentTranslationWorkflow.execute({
          publicationCommentId,
          sourceRevisionId: before.currentRevisionId,
          sourceContent: before.sourceContent,
        })

        expect(EffectArray.sort(requested, Order.String)).toEqual(["en", "es"])

        expect(
          EffectArray.sort(
            (yield* listPublicationCommentTranslationRowsByPublicationCommentId(
              publicationCommentId,
            )).map((row) => row.language),
            Order.String,
          ),
        ).toEqual(["en", "es", "pt"])
      }).pipe(
        Effect.provide(
          memoryWorkflows(
            Layer.mergeAll(
              Layer.succeed(LanguageDetectionService, {
                detectLanguage: () => Effect.succeed(ContentLanguage.make("fr")),
              }),
              Layer.succeed(TranslationService, {
                getServiceId: () => "test",
                translate: ({ targetLanguage }) =>
                  Effect.sync(() => {
                    requested.push(targetLanguage)
                    return "<p>Translated</p>"
                  }),
              }),
            ),
          ),
        ),
      )
    },
  )

  it.live("rejects results if the source is edited during translation", () =>
    Effect.gen(function* () {
      const { publicationComments, person, publicationCommentId } = yield* fixture
      const before = Option.getOrThrow(
        yield* publicationComments.findPublicationCommentRowById(publicationCommentId),
      )
      const testContext = yield* Effect.context<IdGen | SqlClient.SqlClient>()

      const dependencies = Layer.mergeAll(
        Layer.succeed(LanguageDetectionService, {
          detectLanguage: () => Effect.succeed(ContentLanguage.make("pt")),
        }),
        Layer.succeed(TranslationService, {
          getServiceId: () => "test",
          translate: ({ targetLanguage }) =>
            Effect.gen(function* () {
              if (targetLanguage === "en") {
                yield* publicationComments
                  .updatePublicationComment({
                    publicationCommentId,
                    authorId: person.id,
                    expectedCurrentRevisionId: before.currentRevisionId,
                    sourceContent: makeDocument("Edited"),
                  })
                  .pipe(Effect.orDie)
              }

              return "<p>Old translation</p>"
            }).pipe(Effect.provide(testContext)),
        }),
      )

      const error = yield* PublicationCommentTranslationWorkflow.execute({
        publicationCommentId,
        sourceRevisionId: before.currentRevisionId,
        sourceContent: before.sourceContent,
      }).pipe(
        Effect.provide(
          PublicationCommentTranslationWorkflowLayer.pipe(
            Layer.provideMerge(WorkflowEngine.layerMemory),
            Layer.provide(dependencies),
          ),
        ),
        Effect.flip,
      )

      expect(error).toMatchObject({ _tag: "PublicationCommentConcurrentUpdateError" })
      expect(
        yield* listPublicationCommentTranslationRowsByPublicationCommentId(publicationCommentId),
      ).toEqual([])

      expect(
        Option.getOrThrow(
          yield* publicationComments.findPublicationCommentRowById(publicationCommentId),
        ).sourceLanguage,
      ).toBe("und")
    }).pipe(Effect.provide(TestLayerWithRepositories)),
  )
})
