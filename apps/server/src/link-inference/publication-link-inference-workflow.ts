import {
  InferredLinks,
  InvalidCrdtUpdateError,
  LinkInferenceModel,
  LinkInferenceModelError,
  LinkInferenceRun,
  LoroDocFrontier,
  makeAliasIndex,
  PublicationCrdt,
  PublicationId,
  publicationSourceText,
  snapshotToLoroDoc,
  SourceText,
  TimestampColumn,
} from "@gororobas/domain"
/**
 * Durable link inference over a publication's source content, submitted after people edit it.
 * Links from entity references are projected synchronously with the publication instead.
 */
import { DateTime, Effect, Equal, Layer, Option, Schedule, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { Activity, Workflow } from "effect/workflow"

import { PublicationsRepository } from "../publications/repository.js"
import { WikiArticlesRepository } from "../wiki/repository.js"
import { inferLinks } from "./infer-links.js"
import { LINK_INFERENCE_VERSION } from "./link-inference-version.js"
import { LinkInferencePersistenceError, withPersistenceRetries } from "./persistence-errors.js"

const retryPolicy = { times: 3, schedule: Schedule.exponential("200 millis") }

const encodeFrontier = Schema.encodeSync(Schema.fromJsonString(LoroDocFrontier))

export const PublicationLinkInferenceWorkflow = Workflow.make("PublicationLinkInference", {
  payload: {
    publicationId: PublicationId,
    crdtFrontier: LoroDocFrontier,
  },
  success: Schema.Null,
  error: Schema.Union([LinkInferenceModelError, LinkInferencePersistenceError]),
  idempotencyKey: ({ publicationId, crdtFrontier }) =>
    `${publicationId}:${encodeFrontier(crdtFrontier)}:${LINK_INFERENCE_VERSION}`,
})

/**
 * The source content at the run's frontier, while it's still the publication's latest. Later
 * revisions that only translate or change metadata leave it, and so the inferred links, current; a
 * later content edit submits its own run.
 */
const findCurrentSourceContent = (
  payload: typeof PublicationLinkInferenceWorkflow.payloadSchema.Type,
) =>
  Effect.gen(function* () {
    const repository = yield* PublicationsRepository
    const stored = yield* repository.findPublicationCrdtSnapshotById(payload.publicationId)
    if (Option.isNone(stored)) return Option.none()

    const current = snapshotToLoroDoc(stored.value.crdtSnapshot)
    const requested = current.fork()
    yield* Effect.try({
      try: () => requested.checkout([...payload.crdtFrontier]),
      catch: () => new InvalidCrdtUpdateError({ reason: "InvalidFormat" }),
    })
    const [atRequest, latest] = yield* Effect.all(
      [PublicationCrdt.read(requested), PublicationCrdt.read(current)],
      { concurrency: 1 },
    )

    return latest.sourceLanguage === atRequest.sourceLanguage &&
      Equal.equals(latest.sourceContent, atRequest.sourceContent)
      ? Option.some(latest.sourceContent)
      : Option.none()
  })

const inferPublicationLinks = Effect.fn("PublicationLinkInferenceWorkflow")(function* (
  payload: typeof PublicationLinkInferenceWorkflow.payloadSchema.Type,
) {
  const publicationsRepository = yield* PublicationsRepository
  const wikiArticlesRepository = yield* WikiArticlesRepository

  const source = yield* Activity.make({
    name: "load-source-content",
    success: Schema.NullOr(SourceText),
    error: LinkInferencePersistenceError,
    execute: findCurrentSourceContent(payload).pipe(
      Effect.map(
        Option.match({
          onNone: () => null,
          onSome: (sourceContent) => publicationSourceText({ sourceContent }),
        }),
      ),
      withPersistenceRetries,
    ),
  })

  if (source === null) return null

  const inferred = yield* Activity.make({
    name: "infer-links",
    success: Schema.Struct({
      links: InferredLinks,
      startedAt: TimestampColumn,
      finishedAt: TimestampColumn,
    }),
    error: Schema.Union([LinkInferenceModelError, LinkInferencePersistenceError]),
    execute: Effect.gen(function* () {
      const startedAt = yield* DateTime.now
      const aliases = yield* wikiArticlesRepository
        .listWikiArticleAliases()
        .pipe(withPersistenceRetries)

      const links = yield* inferLinks({
        source,
        context: Option.none(),
        aliases: makeAliasIndex(aliases),
        exclude: Option.none(),
      }).pipe(Effect.retry(retryPolicy))

      return { links, startedAt, finishedAt: yield* DateTime.now }
    }),
  })

  const model = yield* LinkInferenceModel

  yield* Activity.make({
    name: "persist-links",
    error: LinkInferencePersistenceError,
    execute: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const { links, suggestions } = inferred.links

      const mentions = links.flatMap((link) =>
        link.source === "MENTION"
          ? [{ publicationId: payload.publicationId, ...link, source: link.source }]
          : [],
      )

      const inferences = links.flatMap((link) =>
        link.source === "INFERENCE"
          ? [{ publicationId: payload.publicationId, ...link, source: link.source }]
          : [],
      )

      yield* sql.withTransaction(
        Effect.gen(function* () {
          // A content edit during inference submits a run that may finish first; this run's links
          // are stale and mustn't overwrite that run's.
          if (Option.isNone(yield* findCurrentSourceContent(payload))) return

          yield* Effect.all(
            [
              publicationsRepository.replacePublicationWikiArticleLinks({
                publicationId: payload.publicationId,
                source: "MENTION",
                rows: mentions,
              }),
              publicationsRepository.replacePublicationWikiArticleLinks({
                publicationId: payload.publicationId,
                source: "INFERENCE",
                rows: inferences,
              }),
              publicationsRepository.updatePublicationLinkInference({
                id: payload.publicationId,
                linkInference: LinkInferenceRun.make({
                  version: LINK_INFERENCE_VERSION,
                  model: model.model,
                  crdtFrontier: payload.crdtFrontier,
                  startedAt: inferred.startedAt,
                  finishedAt: inferred.finishedAt,
                  suggestions,
                }),
              }),
            ],
            { concurrency: 1, discard: true },
          )
        }),
      )
    }).pipe(withPersistenceRetries),
  })

  return null
})

export const PublicationLinkInferenceWorkflowLayer = Layer.unwrap(
  Effect.gen(function* () {
    const applicationSql = yield* SqlClient.SqlClient

    // Cluster activities use workflow storage SQL; link writes must use application SQL.
    return PublicationLinkInferenceWorkflow.toLayer((payload) =>
      inferPublicationLinks(payload).pipe(
        Effect.provideService(SqlClient.SqlClient, applicationSql),
      ),
    )
  }),
)

/** Best-effort submission after the publication transaction commits. */
export const requestPublicationLinkInference = (publication: {
  readonly id: PublicationId
  readonly currentCrdtFrontier: LoroDocFrontier
}) =>
  PublicationLinkInferenceWorkflow.execute(
    { publicationId: publication.id, crdtFrontier: publication.currentCrdtFrontier },
    { discard: true },
  ).pipe(Effect.catchCause((cause) => Effect.logError("Link inference submission failed", cause)))
