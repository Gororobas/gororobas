import { Config, Context, Duration, Effect, Schedule, Schema, Semaphore } from "effect"
import { type ExampleData, extract, FormatType } from "langextract"

export class LangExtractError extends Schema.TaggedError<LangExtractError>()("LangExtractError", {
  error: Schema.Unknown,
  html: Schema.String,
  model_id: Schema.String,
  prompt: Schema.String,
}) {}

export class LangExtractService extends Context.Service<LangExtractService>()(
  "LangExtractService",
  {
    make: Effect.gen(function* () {
      const ollamaBaseUrl = yield* Config.string("OLLAMA_BASE_URL").pipe(
        Config.withDefault("http://localhost:11434"),
      )
      const ollamaModel = yield* Config.string("OLLAMA_MODEL").pipe(Config.withDefault("gemma3:4b"))
      const temperature = yield* Config.number("OLLAMA_TEMPERATURE").pipe(Config.withDefault(0.6))
      const maxConcurrentExtractions = yield* Config.number(
        "OLLAMA_MAX_CONCURRENT_EXTRACTIONS",
      ).pipe(Config.withDefault(2))

      const model_info = {
        model_id: ollamaModel,
        model_type: "ollama",
        temperature,
      } as const

      const semaphore = yield* Semaphore.make(maxConcurrentExtractions)

      const extractFromHtml = Effect.fn("LangExtractService.extract")(function* (
        html: string,
        options: {
          readonly promptDescription: string
          readonly examples: ExampleData[]
        },
      ) {
        const result = yield* Effect.tryPromise({
          try: () =>
            extract(html, {
              promptDescription: options.promptDescription,
              examples: options.examples,
              apiKey: ollamaBaseUrl,
              modelType: model_info.model_type,
              modelId: model_info.model_id,
              formatType: FormatType.JSON,
              fenceOutput: true,
              temperature: model_info.temperature,
              debug: false,
            }),
          catch: (error) =>
            new LangExtractError({
              error,
              html,
              model_id: model_info.model_id,
              prompt: options.promptDescription,
            }),
        }).pipe(
          Effect.retry(
            Schedule.max([Schedule.exponential(Duration.millis(100), 2), Schedule.recurs(3)]),
          ),
          semaphore.withPermits(1),
        )

        return Array.isArray(result) ? result[0] : result
      })

      return { extract: extractFromHtml, model_info }
    }),
  },
) {}
