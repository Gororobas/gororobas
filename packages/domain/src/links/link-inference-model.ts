import { type Array as EffectArray, Context, Effect, Layer, Option, Schema } from "effect"

import type { WikiArticleId } from "../common/ids.js"
import type { WikiArticleCandidate } from "./alias-index.js"
import { AlignmentStatus, type LanguageModelInfo } from "./domain.js"
import type { SourceText } from "./source-text.js"

export class LinkInferenceModelError extends Schema.TaggedError<LinkInferenceModelError>()(
  "LinkInferenceModelError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

/** A span a language model quoted, and the article it names or implies. */
export const ModelExtraction = Schema.Struct({
  /** Where the quote was found in the source text; `null` when it couldn't be. */
  interval: Schema.NullOr(Schema.Struct({ start: Schema.Int, end: Schema.Int })),
  alignmentStatus: Schema.NullOr(AlignmentStatus),
  /** Canonical names the model proposes for the article, to look up among existing ones. */
  names: Schema.Struct({
    pt: Schema.Array(Schema.String),
    es: Schema.Array(Schema.String),
    en: Schema.Array(Schema.String),
  }),
  /** Why the span implies the article; inferences only. */
  rationale: Schema.NullOr(Schema.String),
})

export type ModelExtraction = typeof ModelExtraction.Type

export interface LinkInferenceRequest {
  readonly source: SourceText
  /** What the model should know about the linking entity, without linking from it. */
  readonly context: Option.Option<string>
}

export class LinkInferenceModel extends Context.Service<
  LinkInferenceModel,
  {
    /** `null` when no language model takes part, as in tests and model-less environments. */
    readonly model: LanguageModelInfo | null
    /** Spans naming an article: a name, synonym or regional name, as written. */
    readonly detectMentions: (
      request: LinkInferenceRequest,
    ) => Effect.Effect<ReadonlyArray<ModelExtraction>, LinkInferenceModelError>
    /** Spans implying an article the text doesn't name. */
    readonly detectInferences: (
      request: LinkInferenceRequest,
    ) => Effect.Effect<ReadonlyArray<ModelExtraction>, LinkInferenceModelError>
    /** Picks the article a span refers to among candidates sharing its name, if any fits. */
    readonly disambiguate: (input: {
      readonly text: string
      readonly passage: string
      readonly candidates: EffectArray.NonEmptyReadonlyArray<WikiArticleCandidate>
    }) => Effect.Effect<Option.Option<WikiArticleId>, LinkInferenceModelError>
  }
>()("LinkInferenceModel") {}

/**
 * Infers nothing and resolves no ambiguity, for environments without a language model. Link
 * inference still finds the articles named by their exact names.
 */
export const LinkInferenceModelStub = Layer.succeed(LinkInferenceModel, {
  model: null,
  detectMentions: () => Effect.succeed([]),
  detectInferences: () => Effect.succeed([]),
  disambiguate: () => Effect.succeedNone,
})
