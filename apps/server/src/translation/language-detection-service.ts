import { ContentLanguage, type TiptapDocument } from "@gororobas/domain"
import { Context, Effect, Layer, Schema } from "effect"

export class LanguageDetectionError extends Schema.TaggedError<LanguageDetectionError>()(
  "LanguageDetectionError",
  { message: Schema.String, retryable: Schema.Boolean, cause: Schema.optional(Schema.Defect()) },
) {}

export const LanguageDetectionService = Context.Service<{
  detectLanguage: (
    content: TiptapDocument,
  ) => Effect.Effect<ContentLanguage, LanguageDetectionError>
}>("LanguageDetectionService")

// Replace with a detector; undetermined is the honest fallback while this is a stub.
export const LanguageDetectionServiceStub = Layer.succeed(LanguageDetectionService, {
  detectLanguage: () => Effect.succeed(ContentLanguage.make("und")),
})
