import { Locale, TiptapDocument } from "@gororobas/domain"
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
  source: Locale
  target: Locale
}) {
  const html = tiptapToHtml(content)

  const service = yield* TranslationService
  const translatedHtml = yield* service.translate(html, source, target)

  return {
    content: tiptapFromHtml(translatedHtml),
    html: translatedHtml,
    serviceId: service.getServiceId(),
  }
})
