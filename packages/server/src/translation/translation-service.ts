import { Locale } from "@gororobas/domain"
import { Context, Effect, Schema } from "effect"

export const CODE_TO_LANG: Record<Locale, string> = {
  en: "English",
  pt: "Portuguese",
  es: "Spanish",
}

export class TranslationError extends Schema.TaggedError<TranslationError>()("TranslationError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export interface TranslationServiceApi {
  translate(text: string, source: Locale, target: Locale): Effect.Effect<string, TranslationError>
  getServiceId(): string
}

export class TranslationService extends Context.Tag("TranslationService")<
  TranslationService,
  TranslationServiceApi
>() {}
