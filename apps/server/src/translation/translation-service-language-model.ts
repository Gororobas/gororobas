import { ContentLanguage, SupportedLanguage } from "@gororobas/domain"
import { Config, Effect, Layer } from "effect"
import { LanguageModel, Model } from "effect/ai"

import { openAiCompatibleLanguageModel } from "../language-models/openai-compatible-language-model.js"
import { CODE_TO_LANG, TranslationError, TranslationService } from "./translation-service.js"

function generatePrompt({
  sourceLanguage,
  targetLanguage,
  text,
}: {
  sourceLanguage: ContentLanguage
  targetLanguage: SupportedLanguage
  text: string
}) {
  return `You are a professional ${new Intl.DisplayNames(["en"], { type: "language" }).of(sourceLanguage) ?? sourceLanguage} (${sourceLanguage}) to ${CODE_TO_LANG[targetLanguage]} (${targetLanguage}) translator. Your goal is to accurately convey the meaning and nuances of the original ${new Intl.DisplayNames(["en"], { type: "language" }).of(sourceLanguage) ?? sourceLanguage} text while adhering to ${CODE_TO_LANG[targetLanguage]} grammar, vocabulary, and cultural sensitivities. Text is encoded as HTML.
  Produce only the ${CODE_TO_LANG[targetLanguage]} translation, without any additional explanations or commentary. Please translate the following ${new Intl.DisplayNames(["en"], { type: "language" }).of(sourceLanguage) ?? sourceLanguage} text into ${CODE_TO_LANG[targetLanguage]}:

  ${text}`
}

/** Requires a `LanguageModel` from any `effect/ai` provider. */
export const TranslationServiceLanguageModelLive = Layer.effect(
  TranslationService,
  Effect.gen(function* () {
    const languageModel = yield* LanguageModel.LanguageModel
    const modelId = yield* Model.ModelName

    return {
      getServiceId: () => modelId,
      translate: Effect.fn("TranslationServiceLanguageModel.translate")(function* ({
        text,
        sourceLanguage,
        targetLanguage,
      }: {
        text: string
        sourceLanguage: ContentLanguage
        targetLanguage: SupportedLanguage
      }) {
        const response = yield* languageModel
          .generateText({ prompt: generatePrompt({ sourceLanguage, targetLanguage, text }) })
          .pipe(
            Effect.mapError(
              (cause) =>
                new TranslationError({
                  message: "Failed to translate with a language model",
                  cause,
                }),
            ),
          )

        return response.text
      }),
    }
  }),
)

export const TranslationLanguageModel = openAiCompatibleLanguageModel({
  modelId: Config.String("TRANSLATION_MODEL").pipe(Config.withDefault("translategemma")),
  temperature: Config.Number("TRANSLATION_TEMPERATURE").pipe(Config.withDefault(0)),
})
