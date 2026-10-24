import { type TiptapDocument, WikiArticleId } from "@gororobas/domain"
import { Context, Effect, Layer, Schema } from "effect"

export class WikiArticleClassificationError extends Schema.TaggedError<WikiArticleClassificationError>()(
  "WikiArticleClassificationError",
  { message: Schema.String, retryable: Schema.Boolean, cause: Schema.optional(Schema.Defect()) },
) {}

/** An existing wiki article the content is about, and the span it was recognized in. */
export const ClassifiedWikiArticle = Schema.Struct({
  wikiArticleId: WikiArticleId,
  extractionText: Schema.String,
})
export type ClassifiedWikiArticle = typeof ClassifiedWikiArticle.Type

export const WikiArticleClassifier = Context.Service<{
  /** Recognizes existing wiki articles in rich text. Suggestions of articles to create are left out. */
  classify: (
    contents: ReadonlyArray<TiptapDocument>,
  ) => Effect.Effect<ReadonlyArray<ClassifiedWikiArticle>, WikiArticleClassificationError>
}>("WikiArticleClassifier")

/** Recognizes nothing, for environments without a language model. */
export const WikiArticleClassifierStub = Layer.succeed(WikiArticleClassifier, {
  classify: () => Effect.succeed([]),
})
