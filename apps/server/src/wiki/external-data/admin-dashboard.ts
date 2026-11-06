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

const UNREADABLE_OUTCOME = {
  message: "The stored outcome doesn't match the current schema",
  isRetryable: false,
}

/**
 * Payloads stay out of the list: a page of GBIF occurrence searches would weigh megabytes.
 * Older rows may not match the codec that reads outcomes now, so they're summarized as unreadable.
 */
const toLogEntry = (row: ObservationRow): ExternalDataObservationLogEntry => {
  const summary = Option.match(
    Schema.decodeOption(Schema.toCodecJson(ExternalDataObservation.fields.outcome))(row.outcome),
    {
      onNone: () => ({ outcome: "Failure" as const, sources: [], error: UNREADABLE_OUTCOME }),
      onSome: Result.match({
        onSuccess: (observations) => ({
          outcome: "Success" as const,
          sources: observations.map((observation) => ({
            externalId: observation.externalId,
            sourceUrl: observation.sourceUrl,
            fetchedAt: observation.fetchedAt,
            payloadLength: Schema.encodeSync(Schema.fromJsonString(Schema.Json))(
              observation.payload,
            ).length,
          })),
          error: null,
        }),
        onFailure: (failure) => ({
          outcome: "Failure" as const,
          sources: [],
          error: { message: failure.message, isRetryable: failure.retryable },
        }),
      }),
    },
  )

  return {
    id: row.id,
    provider: row.provider,
    observedAt: row.observedAt,
    article: { id: row.wikiArticleId, kind: row.kind, handle: row.handle, title: row.title },
    inputs: row.inputs,
    ...summary,
  }
}

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
    entries: rows.map(toLogEntry),
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

  return { entry: toLogEntry(row.value), outcome: row.value.outcome }
})
