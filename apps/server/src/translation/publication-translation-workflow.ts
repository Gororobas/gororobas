/**
 * Durable translation workflow backed by Effect Cluster.
 *
 * Translates TiptapDocument content between languages using TranslationService.
 * Each activity is memoized, so a crash mid-workflow won't re-invoke the translation API.
 */
import {
  ContentLanguage,
  LoroDocFrontier,
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
import { Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { Activity, Workflow } from "effect/workflow"

import { SystemUpsertTranslation } from "../publications/publication-repository-inputs.js"
import { PublicationsRepository } from "../publications/repository.js"
import { translateTiptapContent, TranslationResult } from "./translate-tiptap-content.js"
import { TranslationError } from "./translation-service.js"

/**
 * Bump this when internals change.
 * Format: ISO date + revision number within that day.
 */
const WORKFLOW_VERSION = "2026-10-28.1" as const

class PublicationTranslationPersistenceError extends Schema.TaggedError<PublicationTranslationPersistenceError>()(
  "PublicationTranslationPersistenceError",
  {
    message: Schema.String,
    retryable: Schema.Boolean,
    cause: Schema.Defect(),
  },
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

const translatePublication = Effect.fn("PublicationTranslationWorkflow")(function* (
  payload: typeof PublicationTranslationWorkflow.payloadSchema.Type,
) {
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
      const translatedContent = tiptapFromHtml(translationResult.html, {
        referenceContent: payload.sourceContent,
      })

      yield* repository
        .updatePublication(
          SystemUpsertTranslation.make({
            commit,
            publicationId: payload.publicationId,
            sourceLanguage: payload.sourceLanguage,
            sourceCrdtFrontier: payload.sourceCrdtFrontier,
            targetLanguage: payload.targetLanguage,
            translatedContent,
          }),
        )
        .pipe(
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
})

export const PublicationTranslationWorkflowLayer = Layer.unwrap(
  Effect.gen(function* () {
    const applicationSql = yield* SqlClient.SqlClient

    // Cluster activities use workflow storage SQL; publication writes must use application SQL.
    return PublicationTranslationWorkflow.toLayer((payload) =>
      translatePublication(payload).pipe(
        Effect.provideService(SqlClient.SqlClient, applicationSql),
      ),
    )
  }),
)
