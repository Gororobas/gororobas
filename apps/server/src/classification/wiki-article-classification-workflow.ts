/**
 * Durable classification of a wiki article's content into relations with other wiki articles.
 * Runs once per approved CRDT frontier; relations found in rich-text references are projected
 * synchronously with the article instead (see `persistArticleProjection`).
 */
import { LoroDocFrontier, TiptapDocument, WikiArticleId } from "@gororobas/domain"
import { Effect, Layer, Option, Schedule, Schema } from "effect"
import { SqlClient, type SqlError } from "effect/sql"
import { Activity, Workflow } from "effect/workflow"

import { replaceRelations } from "../wiki/mutations.js"
import { findDatabaseRowById, listTranslationContents } from "../wiki/queries.js"
import { CLASSIFICATION_VERSION } from "./classification-version.js"
import {
  ClassifiedWikiArticle,
  WikiArticleClassificationError,
  WikiArticleClassifier,
} from "./wiki-article-classifier.js"

const retryPolicy = { times: 3, schedule: Schedule.exponential("200 millis") }

class WikiArticleClassificationPersistenceError extends Schema.TaggedError<WikiArticleClassificationPersistenceError>()(
  "WikiArticleClassificationPersistenceError",
  { message: Schema.String, retryable: Schema.Boolean, cause: Schema.Defect() },
) {}

const withPersistenceRetries = <A, R>(
  effect: Effect.Effect<A, Schema.SchemaError | SqlError.SqlError, R>,
) =>
  effect.pipe(
    Effect.catchTags({
      SqlError: (cause) =>
        Effect.fail(
          new WikiArticleClassificationPersistenceError({
            message: "Wiki article relation persistence failed",
            retryable: true,
            cause,
          }),
        ),
      SchemaError: (cause) =>
        Effect.fail(
          new WikiArticleClassificationPersistenceError({
            message: "Invalid wiki article relation data",
            retryable: false,
            cause,
          }),
        ),
    }),
    Effect.retry({ ...retryPolicy, while: (error) => error.retryable }),
  )

const encodeFrontier = Schema.encodeSync(Schema.fromJsonString(LoroDocFrontier))

export const WikiArticleClassificationWorkflow = Workflow.make("WikiArticleClassification", {
  payload: {
    wikiArticleId: WikiArticleId,
    crdtFrontier: LoroDocFrontier,
  },
  success: Schema.Null,
  error: Schema.Union([WikiArticleClassificationError, WikiArticleClassificationPersistenceError]),
  idempotencyKey: ({ wikiArticleId, crdtFrontier }) =>
    `${wikiArticleId}:${encodeFrontier(crdtFrontier)}:${CLASSIFICATION_VERSION}`,
})

const classifyWikiArticle = Effect.fn("WikiArticleClassificationWorkflow")(function* (
  payload: typeof WikiArticleClassificationWorkflow.payloadSchema.Type,
) {
  const classifier = yield* WikiArticleClassifier

  // A later approval submits its own run, which owns the article's relations from then on.
  const contents = yield* Activity.make({
    name: "load-current-content",
    success: Schema.NullOr(Schema.Array(TiptapDocument)),
    error: WikiArticleClassificationPersistenceError,
    execute: Effect.gen(function* () {
      const article = yield* findDatabaseRowById(payload.wikiArticleId)
      const isCurrent = Option.exists(article, (row) =>
        Schema.toEquivalence(LoroDocFrontier)(row.currentCrdtFrontier, payload.crdtFrontier),
      )
      if (!isCurrent) return null

      const translations = yield* listTranslationContents(payload.wikiArticleId)
      return translations.map((translation) => translation.content)
    }).pipe(withPersistenceRetries),
  })

  if (contents === null) return null

  const classified = yield* Activity.make({
    name: "classify",
    success: Schema.Array(ClassifiedWikiArticle),
    error: WikiArticleClassificationError,
    execute: classifier
      .classify(contents)
      .pipe(Effect.retry({ ...retryPolicy, while: (error) => error.retryable })),
  })

  yield* Activity.make({
    name: "persist-relations",
    error: WikiArticleClassificationPersistenceError,
    execute: replaceRelations({
      wikiArticleId: payload.wikiArticleId,
      source: "CLASSIFICATION",
      related: classified,
    }).pipe(withPersistenceRetries),
  })

  return null
})

export const WikiArticleClassificationWorkflowLayer = Layer.unwrap(
  Effect.gen(function* () {
    const applicationSql = yield* SqlClient.SqlClient

    // Cluster activities use workflow storage SQL; relation writes must use application SQL.
    return WikiArticleClassificationWorkflow.toLayer((payload) =>
      classifyWikiArticle(payload).pipe(Effect.provideService(SqlClient.SqlClient, applicationSql)),
    )
  }),
)

/** Best-effort submission after the article transaction commits. */
export const requestWikiArticleClassification = Effect.fn(function* (
  article: { id: WikiArticleId; currentCrdtFrontier: LoroDocFrontier },
  previous?: { currentCrdtFrontier: LoroDocFrontier },
) {
  const payload = { wikiArticleId: article.id, crdtFrontier: article.currentCrdtFrontier }

  // Interrupt the run for the replaced content, so it doesn't spend a model call on stale text.
  if (
    previous &&
    !Schema.toEquivalence(LoroDocFrontier)(previous.currentCrdtFrontier, payload.crdtFrontier)
  ) {
    yield* WikiArticleClassificationWorkflow.interrupt(
      yield* WikiArticleClassificationWorkflow.executionId({
        wikiArticleId: article.id,
        crdtFrontier: previous.currentCrdtFrontier,
      }),
    )
  }

  yield* WikiArticleClassificationWorkflow.execute(payload, { discard: true })
})
