/**
 * Durable translation workflow backed by Effect Cluster.
 *
 * Translates TiptapDocument content between languages using TranslationService.
 * Each activity is memoized, so a crash mid-workflow won't re-invoke the translation API.
 */
import {
  ContentLanguage,
  LoroDocFrontier,
  IdGen,
  InvalidCrdtUpdateError,
  SupportedLanguage,
  PublicationConcurrentUpdateError,
  PublicationId,
  PublicationNotFoundError,
  StalePublicationTranslationError,
  SystemCommit,
  TimestampColumn,
  TiptapDocument,
  tiptapFromHtml,
} from "@gororobas/domain"
import { Duration, Effect, Option, Schema } from "effect"
import { SchemaError } from "effect/Schema"
import { SqlClient, SqlError } from "effect/sql"
import { Activity, Workflow } from "effect/workflow"

import { SystemUpsertTranslation } from "../publications/publication-repository-inputs.js"
import { PublicationsRepository } from "../publications/repository.js"
import { translateTiptapContent, TranslationResult } from "./translate-tiptap-content.js"
import { TranslationError } from "./translation-service.js"

/**
 * Bump this when internals change.
 * Format: ISO date + revision number within that day.
 */
const WORKFLOW_VERSION = "2026-10-19.1" as const

class PublicationTranslationPersistenceError extends Schema.TaggedError<PublicationTranslationPersistenceError>()(
  "PublicationTranslationPersistenceError",
  { message: Schema.String, retryable: Schema.Boolean, cause: Schema.Defect() },
) {}

/** Activity results are stored as JSON, so persistence failures must be serializable errors. */
const PersistenceError = Schema.Union([
  InvalidCrdtUpdateError,
  StalePublicationTranslationError,
  PublicationConcurrentUpdateError,
  PublicationNotFoundError,
  PublicationTranslationPersistenceError,
])

export const PublicationTranslationWorkflow = Workflow.make("PublicationTranslationWorkflow", {
  payload: {
    publicationId: PublicationId,
    updatedAt: TimestampColumn,
    sourceLanguage: ContentLanguage,
    sourceCrdtFrontier: LoroDocFrontier,
    targetLanguage: SupportedLanguage,
    sourceContent: TiptapDocument,
  },
  success: Schema.Null,
  error: Schema.Union([TranslationError, PersistenceError]),
  idempotencyKey: ({ publicationId, targetLanguage, sourceCrdtFrontier }) =>
    `${publicationId}:${targetLanguage}:${Schema.encodeSync(Schema.fromJsonString(LoroDocFrontier))(sourceCrdtFrontier)}`,
})

export const PublicationTranslationWorkflowLayer = PublicationTranslationWorkflow.toLayer(
  Effect.fn("PublicationTranslationWorkflow")(function* (payload, _executionId) {
    const translationResult = yield* Activity.make({
      name: "translate",
      success: TranslationResult,
      error: TranslationError,
      execute: translateTiptapContent({
        content: payload.sourceContent,
        source: payload.sourceLanguage,
        target: payload.targetLanguage,
      }),
    })

    const commit = SystemCommit.make({
      workflowName: "PublicationTranslationWorkflow",
      workflowVersion: WORKFLOW_VERSION,
      model: `translation/${translationResult.serviceId}`,
    })

    const repository = yield* PublicationsRepository

    // A translation of an outdated revision is discarded: the newer revision gets its own run.
    yield* Activity.make({
      name: "persist",
      success: Schema.Void,
      error: PersistenceError,
      execute: Effect.gen(function* () {
        const translatedContent = tiptapFromHtml(translationResult.html)

        const persistWithRetry = (
          remainingAttempts: number,
        ): Effect.Effect<
          void,
          | InvalidCrdtUpdateError
          | PublicationConcurrentUpdateError
          | PublicationNotFoundError
          | StalePublicationTranslationError
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
                  sourceLanguage: payload.sourceLanguage,
                  sourceCrdtFrontier: payload.sourceCrdtFrontier,
                  targetLanguage: payload.targetLanguage,
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

        yield* persistWithRetry(3).pipe(
          Effect.catchTags({
            SqlError: (cause) =>
              Effect.fail(
                new PublicationTranslationPersistenceError({
                  message: "Publication translation persistence failed",
                  retryable: true,
                  cause,
                }),
              ),
            SchemaError: (cause) =>
              Effect.fail(
                new PublicationTranslationPersistenceError({
                  message: "Invalid publication translation data",
                  retryable: false,
                  cause,
                }),
              ),
          }),
        )
      }),
    }).pipe(
      Effect.catchTag("StalePublicationTranslationError", () =>
        Effect.logInfo("Discarded a translation of an outdated publication revision"),
      ),
    )

    return null
  }),
)
