import { ContentLanguage, SupportedLanguage, TiptapDocument } from "@gororobas/domain"
import { tiptapFromHtml, tiptapToHtml } from "@gororobas/domain"
import { Effect, Schema } from "effect"

import { TranslationService } from "./translation-service.js"

export const TranslationResult = Schema.Struct({
  content: TiptapDocument,
  html: Schema.String,
  serviceId: Schema.String,
})

export const translateTiptapContent = Effect.fn("translateTiptapContent")(function* ({
  content,
  source,
  target,
}: {
  content: TiptapDocument
  source: ContentLanguage
  target: SupportedLanguage
}) {
  const html = tiptapToHtml(content)

  const service = yield* TranslationService

  const translatedHtml = yield* service.translate({
    text: html,
    sourceLanguage: source,
    targetLanguage: target,
  })

  return {
    content: tiptapFromHtml(translatedHtml),
    html: translatedHtml,
    serviceId: service.getServiceId(),
  }
})
