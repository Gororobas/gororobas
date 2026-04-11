import { Locale } from "@gororobas/domain"
import { Effect, Schema, Context } from "effect"

export const CODE_TO_LANG: Record<Locale, string> = {
  en: "English",
  pt: "Portuguese",
  es: "Spanish",
}

export class TranslationError extends Schema.TaggedErrorClass<TranslationError>()(
  "TranslationError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export interface TranslationServiceApi {
  translate(text: string, source: Locale, target: Locale): Effect.Effect<string, TranslationError>
  getServiceId(): string
}

export const TranslationService = Context.Service<TranslationServiceApi>("TranslationService")
