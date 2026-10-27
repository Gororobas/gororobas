/**
 * Durable link inference over a wiki article's approved state, run once per approved CRDT frontier.
 * Relations from entity references are projected synchronously with the article instead (see
 * `persistArticleProjection`).
 */
import {
  InferredLinks,
  LinkInferenceModelError,
  LoroDocFrontier,
  makeAliasIndex,
  snapshotToLoroDoc,
  SourceText,
  wikiArticleContext,
  WikiArticleCrdt,
  WikiArticleId,
  wikiArticleSourceText,
} from "@gororobas/domain"
import { Effect, Layer, Option, Schedule, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { Activity, Workflow } from "effect/workflow"

import { replaceRelations } from "../wiki/mutations.js"
import { findCrdtRowById, findDatabaseRowById, listWikiArticleAliases } from "../wiki/queries.js"
import { inferLinks } from "./infer-links.js"
import { LINK_INFERENCE_VERSION } from "./link-inference-version.js"
import { LinkInferencePersistenceError, withPersistenceRetries } from "./persistence-errors.js"

const retryPolicy = { times: 3, schedule: Schedule.exponential("200 millis") }

const encodeFrontier = Schema.encodeSync(Schema.fromJsonString(LoroDocFrontier))

export const WikiArticleLinkInferenceWorkflow = Workflow.make("WikiArticleLinkInference", {
  payload: {
    wikiArticleId: WikiArticleId,
    crdtFrontier: LoroDocFrontier,
  },
  success: Schema.Null,
  error: Schema.Union([LinkInferenceModelError, LinkInferencePersistenceError]),
  idempotencyKey: ({ wikiArticleId, crdtFrontier }) =>
    `${wikiArticleId}:${encodeFrontier(crdtFrontier)}:${LINK_INFERENCE_VERSION}`,
})

/** Whether the run's frontier is still the article's approved state. */
const isCurrentFrontier = (payload: typeof WikiArticleLinkInferenceWorkflow.payloadSchema.Type) =>
  findDatabaseRowById(payload.wikiArticleId).pipe(
    Effect.map(
      Option.exists((current) =>
        Schema.toEquivalence(LoroDocFrontier)(current.currentCrdtFrontier, payload.crdtFrontier),
      ),
    ),
  )

const ArticleSource = Schema.Struct({ source: SourceText, context: Schema.String })

const inferWikiArticleLinks = Effect.fn("WikiArticleLinkInferenceWorkflow")(function* (
  payload: typeof WikiArticleLinkInferenceWorkflow.payloadSchema.Type,
) {
  // A later approval submits its own run, which owns the article's relations from then on.
  const article = yield* Activity.make({
    name: "load-current-article",
    success: Schema.NullOr(ArticleSource),
    error: LinkInferencePersistenceError,
    execute: Effect.gen(function* () {
      const isCurrent = yield* isCurrentFrontier(payload)
      const crdt = yield* findCrdtRowById(payload.wikiArticleId)
      if (!isCurrent || Option.isNone(crdt)) return null

      const data = yield* WikiArticleCrdt.read(snapshotToLoroDoc(crdt.value.crdtSnapshot))
      return { source: wikiArticleSourceText(data), context: wikiArticleContext(data) }
    }).pipe(withPersistenceRetries),
  })

  if (article === null) return null

  const inferred = yield* Activity.make({
    name: "infer-links",
    success: InferredLinks,
    error: Schema.Union([LinkInferenceModelError, LinkInferencePersistenceError]),
    execute: Effect.gen(function* () {
      const aliases = yield* listWikiArticleAliases().pipe(withPersistenceRetries)

      return yield* inferLinks({
        source: article.source,
        context: Option.some(article.context),
        aliases: makeAliasIndex(aliases),
        exclude: Option.some(payload.wikiArticleId),
      }).pipe(Effect.retry(retryPolicy))
    }),
  })

  yield* Activity.make({
    name: "persist-relations",
    error: LinkInferencePersistenceError,
    execute: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const relationFields = (link: { readonly wikiArticleId: WikiArticleId }) => ({
        wikiArticleId: payload.wikiArticleId,
        relatedWikiArticleId: link.wikiArticleId,
      })

      const mentions = inferred.links.flatMap((link) =>
        link.source === "MENTION"
          ? [{ ...relationFields(link), source: link.source, evidence: link.evidence }]
          : [],
      )

      const inferences = inferred.links.flatMap((link) =>
        link.source === "INFERENCE"
          ? [{ ...relationFields(link), source: link.source, evidence: link.evidence }]
          : [],
      )

      yield* sql.withTransaction(
        Effect.gen(function* () {
          // Interrupting a superseded run doesn't stop one already inferring, and the newer run
          // may finish first: this run's relations are stale and mustn't overwrite its.
          if (!(yield* isCurrentFrontier(payload))) return

          yield* Effect.all(
            [
              replaceRelations({
                wikiArticleId: payload.wikiArticleId,
                source: "MENTION",
                rows: mentions,
              }),
              replaceRelations({
                wikiArticleId: payload.wikiArticleId,
                source: "INFERENCE",
                rows: inferences,
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

export const WikiArticleLinkInferenceWorkflowLayer = Layer.unwrap(
  Effect.gen(function* () {
    const applicationSql = yield* SqlClient.SqlClient

    // Cluster activities use workflow storage SQL; relation writes must use application SQL.
    return WikiArticleLinkInferenceWorkflow.toLayer((payload) =>
      inferWikiArticleLinks(payload).pipe(
        Effect.provideService(SqlClient.SqlClient, applicationSql),
      ),
    )
  }),
)

/** Best-effort submission after the article transaction commits. */
export const requestWikiArticleLinkInference = Effect.fn(function* (
  article: { id: WikiArticleId; currentCrdtFrontier: LoroDocFrontier },
  previous?: { currentCrdtFrontier: LoroDocFrontier },
) {
  const payload = { wikiArticleId: article.id, crdtFrontier: article.currentCrdtFrontier }

  // Interrupt the run for the replaced content, so it doesn't spend model calls on stale text.
  if (
    previous &&
    !Schema.toEquivalence(LoroDocFrontier)(previous.currentCrdtFrontier, payload.crdtFrontier)
  ) {
    yield* WikiArticleLinkInferenceWorkflow.interrupt(
      yield* WikiArticleLinkInferenceWorkflow.executionId({
        wikiArticleId: article.id,
        crdtFrontier: previous.currentCrdtFrontier,
      }),
    )
  }

  yield* WikiArticleLinkInferenceWorkflow.execute(payload, { discard: true })
})
