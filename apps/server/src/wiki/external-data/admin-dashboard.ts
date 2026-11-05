import {
  ExternalDataObservation,
  type ExternalDataObservationId,
  type ExternalDataObservationLogEntry,
  type ExternalDataObservationLogQuery,
  ExternalDataObservationNotFoundError,
  Policies,
} from "@gororobas/domain"
import { Effect, Option, Result, Schema } from "effect"

import {
  countObservations,
  findObservationById,
  findObservationPage,
  findTallies,
  type LogFilters,
  type ObservationRow,
} from "./queries.js"

const OBSERVATION_LOG_PAGE_SIZE = 50

const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Json))

const UNREADABLE_OUTCOME = {
  message: "The stored outcome doesn't match the current schema",
  isRetryable: false,
}

// oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Rows are JSON until the codec that wrote them reads them back; older rows may not match it.
const decodeOutcome = Schema.decodeUnknownEffect(
  Schema.toCodecJson(ExternalDataObservation.fields.outcome),
)

/** Payloads stay out of the list: a page of GBIF occurrence searches would weigh megabytes. */
const toLogEntry = Effect.fn(function* (row: ObservationRow) {
  const maybeOutcome = yield* decodeOutcome(row.outcome).pipe(Effect.option)

  const summary = yield* Option.match(maybeOutcome, {
    onNone: () =>
      Effect.succeed({ outcome: "Failure" as const, sources: [], error: UNREADABLE_OUTCOME }),
    onSome: Result.match({
      onSuccess: (observations) =>
        Effect.forEach(
          observations,
          (observation) =>
            Effect.map(encodeJson(observation.payload), (payload) => ({
              externalId: observation.externalId,
              sourceUrl: observation.sourceUrl,
              fetchedAt: observation.fetchedAt,
              payloadLength: payload.length,
            })),
          { concurrency: 1 },
        ).pipe(Effect.map((sources) => ({ outcome: "Success" as const, sources, error: null }))),
      onFailure: (failure) =>
        Effect.succeed({
          outcome: "Failure" as const,
          sources: [],
          error: { message: failure.message, isRetryable: failure.retryable },
        }),
    }),
  })

  return {
    id: row.id,
    provider: row.provider,
    observedAt: row.observedAt,
    article: { id: row.wikiArticleId, kind: row.kind, handle: row.handle, title: row.title },
    inputs: row.inputs,
    ...summary,
  } satisfies ExternalDataObservationLogEntry
})

const toFilters = (query: ExternalDataObservationLogQuery): typeof LogFilters.Type => ({
  provider: query.provider ?? null,
  outcome: query.outcome ?? null,
  wikiArticleId: query.wikiArticleId ?? null,
})

/** What every fetch observed, newest first, for people who keep the encyclopedia's data healthy. */
export const listObservations = Effect.fn("ExternalData.listObservations")(function* (
  query: ExternalDataObservationLogQuery,
) {
  yield* Policies.moderation.canModerateContent

  const filters = toFilters(query)
  const currentPage = query.currentPage ?? 0

  const { rows, count, tallies } = yield* Effect.all(
    {
      rows: findObservationPage({
        ...filters,
        limit: OBSERVATION_LOG_PAGE_SIZE,
        offset: currentPage * OBSERVATION_LOG_PAGE_SIZE,
      }),
      count: countObservations(filters),
      tallies: findTallies(),
    },
    { concurrency: 1 },
  )

  return {
    entries: yield* Effect.forEach(rows, toLogEntry, { concurrency: 1 }),
    totalCount: count.total,
    pageSize: OBSERVATION_LOG_PAGE_SIZE,
    tallies,
  }
})

export const getObservation = Effect.fn("ExternalData.getObservation")(function* (
  id: ExternalDataObservationId,
) {
  yield* Policies.moderation.canModerateContent

  const row = yield* findObservationById({ id })
  if (Option.isNone(row)) return yield* new ExternalDataObservationNotFoundError({ id })

  return { entry: yield* toLogEntry(row.value), outcome: row.value.outcome }
})
