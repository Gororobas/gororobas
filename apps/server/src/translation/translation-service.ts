import { ContentLanguage, SupportedLanguage } from "@gororobas/domain"
import { Effect, Schema, Context } from "effect"

export const CODE_TO_LANG: Record<SupportedLanguage, string> = {
  en: "English",
  pt: "Portuguese",
  es: "Spanish",
}

export class TranslationError extends Schema.TaggedError<TranslationError>()("TranslationError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export interface TranslationServiceApi {
  translate(input: {
    text: string
    sourceLanguage: ContentLanguage
    targetLanguage: SupportedLanguage
  }): Effect.Effect<string, TranslationError>
  getServiceId(): string
}

export const TranslationService = Context.Service<TranslationServiceApi>("TranslationService")
