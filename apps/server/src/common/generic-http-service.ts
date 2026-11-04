import { ExternalDataFetchError, type ExternalDataProvider } from "@gororobas/domain"
import { Config, DateTime, Effect, Option, Schema, Semaphore } from "effect"
import { HttpClient, HttpClientResponse, HttpClientError } from "effect/http"

const MAX_SCHEMA_ISSUE_LENGTH = 500

/** One shared instance per provider layer; the permit includes a cooldown after every attempt. */
export const makeProviderHttp = Effect.fn(function* (
  provider: typeof ExternalDataProvider.Type,
  baseUrl: string,
) {
  const client = yield* HttpClient.HttpClient
  const semaphore = yield* Semaphore.make(1)
  const userAgent = yield* Config.String("EXTERNAL_DATA_USER_AGENT").pipe(
    Config.withDefault("Gororobas/1.0 (https://gororobas.com)"),
  )

  const get = <A, I>(path: string, schema: Schema.Codec<A, I>) => {
    // Query parameters can contain credentials; the path still identifies the endpoint.
    const endpoint = new URL(`${baseUrl}${path}`)
    endpoint.search = ""
    const safeEndpoint = endpoint.toString()

    return Effect.gen(function* () {
      const response = yield* client
        .get(`${baseUrl}${path}`, {
          headers: { "User-Agent": userAgent },
        })
        .pipe(
          Effect.timeout("30 seconds"),
          Effect.mapError(
            (error) =>
              new ExternalDataFetchError({
                provider,
                message: `Request failed for ${safeEndpoint} (${HttpClientError.isHttpClientError(error) ? error.reason._tag : error._tag})`,
                retryable: true,
              }),
          ),
        )

      yield* Effect.annotateCurrentSpan("http.response.status_code", response.status)

      if (response.status < 200 || response.status >= 300) {
        const retryable = response.status === 429 || response.status >= 500
        const header = response.headers["retry-after"]
        const now = DateTime.toEpochMillis(yield* DateTime.now)
        const seconds = Number(header)

        const retryAfterMs = Number.isFinite(seconds)
          ? seconds * 1000
          : Option.match(DateTime.make(header ?? ""), {
              onNone: () => 0,
              onSome: (date) => DateTime.toEpochMillis(date) - now,
            })

        if (retryable && Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
          yield* Effect.sleep(retryAfterMs)
        }

        return yield* new ExternalDataFetchError({
          provider,
          message: `Provider returned HTTP ${response.status} for ${safeEndpoint}`,
          retryable,
        })
      }

      const payload = yield* HttpClientResponse.schemaBodyJson(Schema.Json)(response).pipe(
        Effect.timeout("30 seconds"),
        Effect.mapError(
          () =>
            new ExternalDataFetchError({
              provider,
              message: `Invalid JSON response from ${safeEndpoint}`,
              retryable: false,
            }),
        ),
      )

      // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- External HTTP JSON has not yet been validated against the provider schema.
      const value = yield* Schema.decodeUnknownEffect(schema)(payload).pipe(
        Effect.mapError(
          // Observations store this message, so it keeps the start of the decoding issue.
          (error) =>
            new ExternalDataFetchError({
              provider,
              message: `Response does not match provider schema for ${safeEndpoint}: ${error.message.slice(0, MAX_SCHEMA_ISSUE_LENGTH)}`,
              retryable: false,
            }),
        ),
      )

      const fetchedAt = DateTime.formatIso(yield* DateTime.now)

      return {
        value,
        observation: {
          provider,
          externalId: path,
          sourceUrl: `${baseUrl}${path}`,
          fetchedAt,
          payload,
        },
      }
    }).pipe(
      Effect.tapError((error) =>
        Effect.logWarning("External data request failed", {
          provider,
          endpoint: safeEndpoint,
          message: error.message,
          retryable: error.retryable,
        }),
      ),
      Effect.withSpan("ExternalData.request", {
        attributes: { "external_data.provider": provider, "url.full": safeEndpoint },
      }),
      Effect.ensuring(Effect.sleep("1 second")),
      semaphore.withPermits(1),
      Effect.retry({ times: 2, while: (error) => error.retryable }),
    )
  }

  return { get }
})
