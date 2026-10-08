/**
 * Durable publication comment language detection and translation.
 * Each activity is memoized, so completed work is reused after a workflow restart.
 */
import {
  ContentLanguage,
  PublicationCommentConcurrentUpdateError,
  PublicationCommentNotFoundError,
  PublicationCommentContentRevisionId,
  PublicationCommentId,
  PublicationCommentTranslationRow,
  SupportedLanguage,
  TiptapDocument,
} from "@gororobas/domain"
import { Effect, Layer, Result, Schedule, Schema } from "effect"
import { SqlClient, type SqlError } from "effect/sql"
import { Activity, Workflow } from "effect/workflow"

import { PublicationCommentsRepository } from "../publication-comments/repository.js"
import { LanguageDetectionError, LanguageDetectionService } from "./language-detection-service.js"
import { translateTiptapContent, TranslationResult } from "./translate-tiptap-content.js"
import { TranslationError } from "./translation-service.js"

const retryPolicy = { times: 3, schedule: Schedule.exponential("200 millis") }

class PublicationCommentTranslationPersistenceError extends Schema.TaggedError<PublicationCommentTranslationPersistenceError>()(
  "PublicationCommentTranslationPersistenceError",
  { message: Schema.String, retryable: Schema.Boolean, cause: Schema.Defect() },
) {}

const PersistenceError = Schema.Union([
  PublicationCommentConcurrentUpdateError,
  PublicationCommentNotFoundError,
  PublicationCommentTranslationPersistenceError,
])

const withPersistenceRetries = <A, R>(
  effect: Effect.Effect<
    A,
    | PublicationCommentConcurrentUpdateError
    | PublicationCommentNotFoundError
    | Schema.SchemaError
    | SqlError.SqlError,
    R
  >,
) =>
  effect.pipe(
    Effect.catchTags({
      SqlError: (cause) =>
        Effect.fail(
          new PublicationCommentTranslationPersistenceError({
            message: "Publication comment persistence failed",
            retryable: true,
            cause,
          }),
        ),
      SchemaError: (cause) =>
        Effect.fail(
          new PublicationCommentTranslationPersistenceError({
            message: "Invalid publication comment persistence data",
            retryable: false,
            cause,
          }),
        ),
    }),
    Effect.retry({
      ...retryPolicy,
      while: (error) =>
        Schema.is(PublicationCommentTranslationPersistenceError)(error) && error.retryable,
    }),
  )

export const PublicationCommentTranslationWorkflow = Workflow.make(
  "PublicationCommentTranslationWorkflow",
  {
    payload: {
      publicationCommentId: PublicationCommentId,
      sourceRevisionId: PublicationCommentContentRevisionId,
      sourceContent: TiptapDocument,
    },
    success: Schema.Null,
    error: Schema.Union([LanguageDetectionError, PersistenceError]),
    idempotencyKey: ({ publicationCommentId, sourceRevisionId }) =>
      `${publicationCommentId}:${sourceRevisionId}`,
  },
)

const translatePublicationComment = Effect.fn("PublicationCommentTranslationWorkflow")(function* (
  payload: typeof PublicationCommentTranslationWorkflow.payloadSchema.Type,
) {
  const repository = yield* PublicationCommentsRepository
  const detector = yield* LanguageDetectionService

  const sourceLanguage = yield* Activity.make({
    name: "detect-language",
    success: ContentLanguage,
    error: LanguageDetectionError,
    execute: detector
      .detectLanguage(payload.sourceContent)
      .pipe(Effect.retry({ ...retryPolicy, while: (error) => error.retryable })),
  })

  const existing = yield* Activity.make({
    name: "set-source-language",
    success: Schema.Array(PublicationCommentTranslationRow),
    error: PersistenceError,
    execute: repository
      .setPublicationCommentSourceLanguage({ ...payload, sourceLanguage })
      .pipe(withPersistenceRetries),
  })

  const sourceBaseLanguage = new Intl.Locale(sourceLanguage).language
  const missingLanguages = SupportedLanguage.literals.filter(
    (language) =>
      language !== sourceBaseLanguage && !existing.some((row) => row.language === language),
  )

  const translations = yield* Effect.forEach(
    missingLanguages,
    (language) =>
      Activity.make({
        name: `translate-${language}`,
        success: TranslationResult,
        error: TranslationError,
        execute: translateTiptapContent({
          content: payload.sourceContent,
          source: sourceLanguage,
          target: language,
        }).pipe(Effect.retry(retryPolicy)),
      }).pipe(
        Effect.result,
        Effect.map((result) =>
          Result.isSuccess(result) ? [{ language, content: result.success.content }] : [],
        ),
      ),
    { concurrency: "unbounded" },
  )

  yield* Activity.make({
    name: "persist-translations",
    error: PersistenceError,
    execute: repository
      .upsertPublicationCommentTranslations({
        publicationCommentId: payload.publicationCommentId,
        sourceRevisionId: payload.sourceRevisionId,
        translations: translations.flat(),
      })
      .pipe(withPersistenceRetries),
  })

  return null
})

export const PublicationCommentTranslationWorkflowLayer = Layer.unwrap(
  Effect.gen(function* () {
    const applicationSql = yield* SqlClient.SqlClient

    // Cluster activities use workflow storage SQL; publication comment writes must use application SQL.
    return PublicationCommentTranslationWorkflow.toLayer((payload) =>
      translatePublicationComment(payload).pipe(
        Effect.provideService(SqlClient.SqlClient, applicationSql),
      ),
    )
  }),
)
