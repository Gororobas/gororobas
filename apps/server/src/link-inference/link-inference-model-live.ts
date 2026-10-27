/**
 * Link inference with a language model: structured completions quote the spans naming or implying
 * articles, `alignQuotes` locates them in the source text, and another completion picks among
 * candidates sharing a name.
 */
import {
  alignQuotes,
  type AlignedQuote,
  type LinkInferenceRequest,
  LinkInferenceModel,
  LinkInferenceModelError,
  type ModelExtraction,
  splitIntoPassages,
} from "@gororobas/domain"
import {
  Array as EffectArray,
  Config,
  Duration,
  Effect,
  Layer,
  Option,
  Schedule,
  Schema,
  Semaphore,
  String as EffectString,
} from "effect"
import { type AiError, LanguageModel, Model } from "effect/ai"

import { openAiCompatibleLanguageModel } from "../language-models/openai-compatible-language-model.js"
import {
  type Answers,
  type Example,
  type Inference,
  INFERENCE_INSTRUCTIONS,
  Inferences,
  type Mention,
  MENTION_INSTRUCTIONS,
  Mentions,
  renderPrompt,
} from "./link-inference-prompts.js"
import { inferenceExamples, mentionExamples } from "./link-inference.examples.js"

/**
 * Longer texts are prompted a few blocks at a time: small models miss more in long passages, and
 * passages run concurrently.
 */
const MAXIMUM_PASSAGE_LENGTH = 2000

const cleanNames = (names: ReadonlyArray<string>) =>
  names.map((name) => name.trim()).filter(EffectString.isNonEmpty)

const toModelExtraction = ({
  extraction,
  aligned,
  offset,
}: {
  readonly extraction: Mention | Inference
  readonly aligned: Option.Option<AlignedQuote>
  /** Where the passage the model read starts in the source text. */
  readonly offset: number
}): ModelExtraction => ({
  interval: Option.match(aligned, {
    onNone: () => null,
    onSome: ({ start, end }) => ({ start: offset + start, end: offset + end }),
  }),
  alignmentStatus: Option.match(aligned, { onNone: () => null, onSome: ({ status }) => status }),
  names: {
    pt: cleanNames(extraction.names.pt),
    es: cleanNames(extraction.names.es),
    en: cleanNames(extraction.names.en),
  },
  rationale: "rationale" in extraction ? extraction.rationale : null,
})

const Choice = Schema.Struct({ choice: Schema.NullOr(Schema.Int) })

/** Requires a `LanguageModel` from any `effect/ai` provider. */
export const LinkInferenceModelLive = Layer.effect(
  LinkInferenceModel,
  Effect.gen(function* () {
    const languageModel = yield* LanguageModel.LanguageModel
    const provider = yield* Model.ProviderName
    const modelId = yield* Model.ModelName
    const maxConcurrentCalls = yield* Config.Number("LINK_INFERENCE_MAX_CONCURRENT_CALLS").pipe(
      Config.withDefault(2),
    )
    const semaphore = yield* Semaphore.make(maxConcurrentCalls)

    const callModel = <A>(effect: Effect.Effect<A, AiError.AiError>) =>
      effect.pipe(
        Effect.retry({
          while: (error) => error.isRetryable,
          schedule: Schedule.max([
            Schedule.exponential(Duration.millis(100), 2),
            Schedule.recurs(3),
          ]),
        }),
        semaphore.withPermits(1),
      )

    const extractSpans = <E extends Mention | Inference>(
      request: LinkInferenceRequest,
      task: {
        readonly instructions: string
        readonly objectName: string
        readonly answers: Answers<E>
        readonly examples: ReadonlyArray<Example<E>>
      },
    ) =>
      Effect.forEach(
        splitIntoPassages(request.source.text, MAXIMUM_PASSAGE_LENGTH),
        (passage) =>
          callModel(
            languageModel.generateObject({
              objectName: task.objectName,
              schema: task.answers,
              prompt: renderPrompt({ ...task, context: request.context, text: passage.text }),
            }),
          ).pipe(
            Effect.map(({ value: { extractions } }) =>
              EffectArray.zipWith(
                extractions,
                alignQuotes(
                  passage.text,
                  extractions.map((extraction) => extraction.quote),
                ),
                (extraction, aligned) =>
                  toModelExtraction({ extraction, aligned, offset: passage.start }),
              ),
            ),
          ),
        { concurrency: "unbounded" },
      ).pipe(
        Effect.map(EffectArray.flatten),
        Effect.mapError(
          (cause) => new LinkInferenceModelError({ message: "Extraction failed", cause }),
        ),
      )

    return {
      model: { provider, modelId },
      detectMentions: Effect.fn("LinkInferenceModelLive.detectMentions")((request) =>
        extractSpans(request, {
          instructions: MENTION_INSTRUCTIONS,
          objectName: "mentions",
          answers: Mentions,
          examples: mentionExamples,
        }),
      ),
      detectInferences: Effect.fn("LinkInferenceModelLive.detectInferences")((request) =>
        extractSpans(request, {
          instructions: INFERENCE_INSTRUCTIONS,
          objectName: "inferences",
          answers: Inferences,
          examples: inferenceExamples,
        }),
      ),
      disambiguate: Effect.fn("LinkInferenceModelLive.disambiguate")(
        ({ text, passage, candidates }) =>
          callModel(
            languageModel.generateObject({
              objectName: "choice",
              schema: Choice,
              prompt: [
                `In the passage below, which of the numbered wiki articles does "${text}" refer to?`,
                `Answer {"choice": <number>}, or {"choice": null} if none fits.`,
                "",
                ...candidates.map(
                  (candidate, index) =>
                    `${index + 1}. ${candidate.kind.toLowerCase()}: ${candidate.names.join(", ")}`,
                ),
                "",
                `Passage: ${passage}`,
              ].join("\n"),
            }),
          ).pipe(
            Effect.mapError(
              (cause) => new LinkInferenceModelError({ message: "Disambiguation failed", cause }),
            ),
            Effect.map(({ value: { choice } }) =>
              Option.fromNullishOr(choice).pipe(
                Option.flatMap((number) => EffectArray.get(candidates, number - 1)),
                Option.map((candidate) => candidate.wikiArticleId),
              ),
            ),
          ),
      ),
    }
  }),
)

export const LinkInferenceLanguageModel = openAiCompatibleLanguageModel({
  modelId: Config.String("LINK_INFERENCE_MODEL").pipe(Config.withDefault("gemma4:e4b")),
  /** Evaluations in `experiments/link-inference` scored fewer false inferences at 0 than at 0.2. */
  temperature: Config.Number("LINK_INFERENCE_TEMPERATURE").pipe(Config.withDefault(0)),
  /**
   * Thinking made Gemma 4 several times slower on the evaluations without improving them. "default"
   * leaves it to the model.
   */
  reasoningEffort: Config.String("LINK_INFERENCE_REASONING_EFFORT").pipe(
    Config.withDefault("none"),
    Config.map((effort) => (effort === "default" ? Option.none() : Option.some(effort))),
  ),
})
