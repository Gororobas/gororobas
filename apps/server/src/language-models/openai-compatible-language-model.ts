import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat"
import { Config, Effect, Layer, Option } from "effect"
import { FetchHttpClient } from "effect/http"

/**
 * A language model served by an OpenAI-compatible chat completions API: Ollama's `/v1` locally,
 * or any hosted provider offering one. Features depend on `effect/ai`'s `LanguageModel`, so moving
 * to a provider with its own Effect integration only means replacing this layer.
 */
export const openAiCompatibleLanguageModel = (options: {
  readonly modelId: Config.Config<string>
  readonly temperature: Config.Config<number>
  /**
   * Values depend on the provider, such as "none" to skip thinking on Ollama. `None` leaves it to
   * the model, as models that don't reason reject the parameter.
   */
  readonly reasoningEffort?: Config.Config<Option.Option<string>>
}) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const modelId = yield* options.modelId
      const temperature = yield* options.temperature
      const reasoningEffort = Option.flatten(
        yield* Effect.transposeOption(Option.fromNullishOr(options.reasoningEffort)),
      )

      return OpenAiLanguageModel.model(modelId, {
        temperature,
        ...Option.match(reasoningEffort, {
          onNone: () => ({}),
          onSome: (effort) => ({ reasoning_effort: effort }),
        }),
      })
    }),
  ).pipe(
    Layer.provide(
      OpenAiClient.layerConfig({
        apiUrl: Config.String("LANGUAGE_MODEL_API_URL").pipe(
          Config.withDefault("http://localhost:11434/v1"),
        ),
        apiKey: Config.Redacted("LANGUAGE_MODEL_API_KEY").pipe(Config.withDefault(undefined)),
      }),
    ),
    Layer.provide(FetchHttpClient.layer),
  )
