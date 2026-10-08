import { ContentLanguage, SupportedLanguage } from "@gororobas/domain"
import { Effect, Context } from "effect"
import ollama from "ollama"

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

export const TranslationServiceOllama = Context.make(TranslationService, {
  getServiceId: () => "ollama",
  translate: Effect.fn("TranslationServiceOllama.translate")(function* ({
    text,
    sourceLanguage,
    targetLanguage,
  }: {
    text: string
    sourceLanguage: ContentLanguage
    targetLanguage: SupportedLanguage
  }) {
    const response = yield* Effect.tryPromise({
      try: () =>
        ollama.chat({
          model: "translategemma",
          messages: [
            {
              role: "user",
              content: generatePrompt({ sourceLanguage, targetLanguage, text }),
            },
          ],
          think: false,
          options: { temperature: 0 },
        }),
      catch: (error) =>
        new TranslationError({
          message: "Failed to translate with Ollama",
          cause: error,
        }),
    })

    return response.message.content
  }),
})
