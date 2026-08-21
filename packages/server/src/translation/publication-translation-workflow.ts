/**
 * Durable translation workflow backed by Effect Cluster.
 *
 * Translates TiptapDocument content between locales using TranslationService.
 * Each activity is memoized, so a crash mid-workflow won't re-invoke the translation API.
 */
import {
  IdGen,
  InvalidCrdtUpdateError,
  Locale,
  PublicationConcurrentUpdateError,
  PublicationId,
  PublicationNotFoundError,
  SystemCommit,
  TimestampColumn,
  TiptapDocument,
  tiptapFromHtml,
} from "@gororobas/domain"
import { DateTime, Duration, Effect, Option, Schema } from "effect"
import { SchemaError } from "effect/Schema"
import { SqlClient, SqlError } from "effect/unstable/sql"
import { Activity, Workflow } from "effect/unstable/workflow"

import { SystemUpsertTranslation } from "../publications/publication-repository-inputs.js"
import { PublicationsRepository } from "../publications/repository.js"
import { translateTiptapContent, TranslationResult } from "./translate-tiptap-content.js"
import { TranslationError } from "./translation-service.js"

/**
 * Bump this when internals change.
 * Format: ISO date + revision number within that day.
 */
const WORKFLOW_VERSION = "2026-02-25.1" as const

export const PublicationTranslationWorkflow = Workflow.make("PublicationTranslationWorkflow", {
  payload: {
    publicationId: PublicationId,
    updatedAt: TimestampColumn,
    sourceLocale: Locale,
    targetLocale: Locale,
    sourceContent: TiptapDocument,
  },
  success: Schema.Null,
  error: Schema.Unknown, // @TODO: How to type TranslationError | SqlError | ParseError as schemas?
  idempotencyKey: ({ publicationId, targetLocale, updatedAt }) =>
    `${publicationId}:${targetLocale}:${DateTime.toEpochMillis(updatedAt)}`,
})

export const PublicationTranslationWorkflowLayer = PublicationTranslationWorkflow.toLayer(
  Effect.fn("PublicationTranslationWorkflow")(function* (payload, _executionId) {
    const translationResult = yield* Activity.make({
      name: "translate",
      success: TranslationResult,
      error: TranslationError,
      execute: translateTiptapContent({
        content: payload.sourceContent,
        source: payload.sourceLocale,
        target: payload.targetLocale,
      }),
    })

    const commit = SystemCommit.make({
      workflowName: "PublicationTranslationWorkflow",
      workflowVersion: WORKFLOW_VERSION,
      model: `translation/${translationResult.serviceId}`,
    })

    const repository = yield* PublicationsRepository

    yield* Activity.make({
      name: "persist",
      success: Schema.Void,
      error: Schema.Unknown,
      execute: Effect.gen(function* () {
        const translatedContent = tiptapFromHtml(translationResult.html)

        const persistWithRetry = (
          remainingAttempts: number,
        ): Effect.Effect<
          void,
          | InvalidCrdtUpdateError
          | PublicationConcurrentUpdateError
          | PublicationNotFoundError
          | SchemaError
          | SqlError.SqlError,
          IdGen | SqlClient.SqlClient
        > =>
          Effect.gen(function* () {
            const currentPublication = yield* repository
              .findPublicationRowById(payload.publicationId)
              .pipe(
                Effect.flatMap(
                  Option.match({
                    onNone: () =>
                      Effect.fail(new PublicationNotFoundError({ id: payload.publicationId })),
                    onSome: Effect.succeed,
                  }),
                ),
              )

            return yield* repository
              .updatePublication(
                SystemUpsertTranslation.make({
                  commit,
                  expectedCurrentCrdtFrontier: currentPublication.currentCrdtFrontier,
                  publicationId: payload.publicationId,
                  sourceLocale: payload.sourceLocale,
                  targetLocale: payload.targetLocale,
                  translatedContent,
                }),
              )
              .pipe(
                Effect.catchTag("PublicationConcurrentUpdateError", (error) =>
                  remainingAttempts > 0
                    ? Effect.sleep(Duration.millis(100)).pipe(
                        Effect.flatMap(() => persistWithRetry(remainingAttempts - 1)),
                      )
                    : Effect.fail(error),
                ),
              )
          })

        yield* persistWithRetry(3)
      }),
    })

    return null
  }),
)
