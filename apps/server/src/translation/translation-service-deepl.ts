import { ContentLanguage, SupportedLanguage } from "@gororobas/domain"
import { Array as EffectArray, Config, Effect, Layer, Redacted, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"

import { TranslationError, TranslationService } from "./translation-service.js"

const LANGUAGE_TO_DEEPL: Record<SupportedLanguage, string> = {
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
    const apiKey = yield* Config.Redacted("DEEPL_API_KEY")
    const client = yield* HttpClient.HttpClient

    const translate = Effect.fn("TranslationServiceDeepl.translate")(function* ({
      text,
      sourceLanguage,
      targetLanguage,
    }: {
      text: string
      sourceLanguage: ContentLanguage
      targetLanguage: SupportedLanguage
    }) {
      const response = yield* HttpClientRequest.post(
        "https://api-free.deepl.com/v2/translate",
      ).pipe(
        HttpClientRequest.setHeader("Authorization", `DeepL-Auth-Key ${Redacted.value(apiKey)}`),
        HttpClientRequest.bodyJson({
          text: [text],
          ...(sourceLanguage === "und" || sourceLanguage === "mul" || sourceLanguage === "zxx"
            ? {}
            : { source_lang: new Intl.Locale(sourceLanguage).language.toUpperCase() }),
          target_lang: LANGUAGE_TO_DEEPL[targetLanguage],
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

      if (EffectArray.isReadonlyArrayEmpty(response.translations)) {
        return yield* new TranslationError({
          message: "DeepL returned no translations",
        })
      }

      return response.translations[0].text
    })

    return { translate, getServiceId: () => "deepl" }
  }),
).pipe(Layer.provide(FetchHttpClient.layer))
