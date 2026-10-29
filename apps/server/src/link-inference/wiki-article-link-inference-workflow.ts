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
import { Activity } from "effect/workflow"

import { WikiArticlesRepository } from "../wiki/repository.js"
import { inferLinks } from "./infer-links.js"
import { LinkInferencePersistenceError, withPersistenceRetries } from "./persistence-errors.js"

const retryPolicy = { times: 3, schedule: Schedule.exponential("200 millis") }

import { WikiArticleLinkInferenceWorkflow } from "./wiki-article-link-inference-definition.js"
export {
  WikiArticleLinkInferenceWorkflow,
  requestWikiArticleLinkInference,
} from "./wiki-article-link-inference-definition.js"

/** Whether the run's frontier is still the article's approved state. */
const isCurrentFrontier = (payload: typeof WikiArticleLinkInferenceWorkflow.payloadSchema.Type) =>
  WikiArticlesRepository.make.pipe(
    Effect.flatMap((repository) => repository.findDatabaseRowById(payload.wikiArticleId)),
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
      const crdt = yield* WikiArticlesRepository.make.pipe(
        Effect.flatMap((repository) => repository.findSourceRowById(payload.wikiArticleId)),
      )
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
      const aliases = yield* WikiArticlesRepository.make.pipe(
        Effect.flatMap((repository) => repository.listWikiArticleAliases()),
        withPersistenceRetries,
      )

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
              WikiArticlesRepository.make.pipe(
                Effect.flatMap((repository) =>
                  repository.replaceRelations({
                    wikiArticleId: payload.wikiArticleId,
                    source: "MENTION",
                    rows: mentions,
                  }),
                ),
              ),
              WikiArticlesRepository.make.pipe(
                Effect.flatMap((repository) =>
                  repository.replaceRelations({
                    wikiArticleId: payload.wikiArticleId,
                    source: "INFERENCE",
                    rows: inferences,
                  }),
                ),
              ),
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
