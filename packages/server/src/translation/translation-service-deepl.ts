import { Locale } from "@gororobas/domain"
import { Config, Effect, Layer, Redacted, Schema } from "effect"
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http"

import { TranslationError, TranslationService } from "./translation-service.js"

const LOCALE_TO_DEEPL: Record<Locale, string> = {
  en: "EN",
  pt: "PT",
  es: "ES",
}

const DeeplResponse = Schema.Struct({
  translations: Schema.Array(
    Schema.Struct({
      detectedSourceLanguage: Schema.String,
      text: Schema.String,
    }),
  ),
})

export const TranslationServiceDeepl = Layer.effect(TranslationService)(
  Effect.gen(function* () {
    const apiKey = yield* Config.redacted("DEEPL_API_KEY")
    const client = yield* HttpClient.HttpClient

    const translate = Effect.fn("TranslationServiceDeepl.translate")(function* (
      text: string,
      sourceLocale: Locale,
      targetLocale: Locale,
    ) {
      const response = yield* HttpClientRequest.post(
        "https://api-free.deepl.com/v2/translate",
      ).pipe(
        HttpClientRequest.setHeader("Authorization", `DeepL-Auth-Key ${Redacted.value(apiKey)}`),
        HttpClientRequest.bodyJson({
          text: [text],
          source_lang: LOCALE_TO_DEEPL[sourceLocale],
          target_lang: LOCALE_TO_DEEPL[targetLocale],
        }),
        Effect.flatMap(client.execute),
        Effect.flatMap(HttpClientResponse.schemaBodyJson(DeeplResponse)),
        Effect.scoped,
        Effect.mapError(
          (error) =>
            new TranslationError({
              message: "Failed to translate with DeepL",
              cause: error,
            }),
        ),
      )

      if (response.translations.length === 0) {
        return yield* new TranslationError({
          message: "DeepL returned no translations",
        })
      }

      return response.translations[0].text
    })

    return { translate, getServiceId: () => "deepl" }
  }),
).pipe(Layer.provide(FetchHttpClient.layer))
