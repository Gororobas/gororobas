import { Locale } from "@gororobas/domain"
import { Effect, ServiceMap } from "effect"
import ollama from "ollama"

import { CODE_TO_LANG, TranslationError, TranslationService } from "./translation-service.js"

function generatePrompt({
  sourceLocale,
  targetLocale,
  text,
}: {
  sourceLocale: Locale
  targetLocale: Locale
  text: string
}) {
  return `You are a professional ${CODE_TO_LANG[sourceLocale]} (${sourceLocale}) to ${CODE_TO_LANG[targetLocale]} (${targetLocale}) translator. Your goal is to accurately convey the meaning and nuances of the original ${CODE_TO_LANG[sourceLocale]} text while adhering to ${CODE_TO_LANG[targetLocale]} grammar, vocabulary, and cultural sensitivities. Text is encoded as HTML.
  Produce only the ${CODE_TO_LANG[targetLocale]} translation, without any additional explanations or commentary. Please translate the following ${CODE_TO_LANG[sourceLocale]} text into ${CODE_TO_LANG[targetLocale]}:

  ${text}`
}

export const TranslationServiceOllama = ServiceMap.make(TranslationService, {
  getServiceId: () => "ollama",
  translate: Effect.fn("TranslationServiceOllama.translate")(function* (
    text: string,
    sourceLocale: Locale,
    targetLocale: Locale,
  ) {
    const response = yield* Effect.tryPromise({
      try: () =>
        ollama.chat({
          model: "translategemma",
          messages: [
            {
              role: "user",
              content: generatePrompt({ sourceLocale, targetLocale, text }),
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
