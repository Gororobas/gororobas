/**
 * Durable translation workflow backed by Effect Cluster.
 *
 * Translates TiptapDocument content between languages using TranslationService.
 * Each activity is memoized, so a crash mid-workflow won't re-invoke the translation API.
 */
import {
  ContentLanguage,
  LoroDocFrontier,
  CommentConcurrentUpdateError,
  CommentId,
  CommentNotFoundError,
  IdGen,
  InvalidCrdtUpdateError,
  SupportedLanguage,
  SystemCommit,
  TimestampColumn,
  TiptapDocument,
  tiptapFromHtml,
} from "@gororobas/domain"
import { Duration, Effect, Option, Schema } from "effect"
import { SchemaError } from "effect/Schema"
import { SqlClient, SqlError } from "effect/sql"
import { Activity, Workflow } from "effect/workflow"

import { SystemUpsertTranslation } from "../comments/comment-repository-inputs.js"
import { CommentsRepository } from "../comments/repository.js"
import { translateTiptapContent, TranslationResult } from "./translate-tiptap-content.js"
import { TranslationError } from "./translation-service.js"

/**
 * Bump this when internals change.
 * Format: ISO date + revision number within that day.
 */
const WORKFLOW_VERSION = "2026-10-08.1" as const

export const CommentTranslationWorkflow = Workflow.make("CommentTranslationWorkflow", {
  payload: {
    commentId: CommentId,
    updatedAt: TimestampColumn,
    sourceLanguage: ContentLanguage,
    sourceCrdtFrontier: LoroDocFrontier,
    targetLanguage: SupportedLanguage,
    sourceContent: TiptapDocument,
  },
  success: Schema.Null,
  error: Schema.Unknown,
  idempotencyKey: ({ commentId, targetLanguage, sourceCrdtFrontier }) =>
    `${commentId}:${targetLanguage}:${Schema.encodeSync(Schema.fromJsonString(LoroDocFrontier))(sourceCrdtFrontier)}`,
})

export const CommentTranslationWorkflowLayer = CommentTranslationWorkflow.toLayer(
  Effect.fn("CommentTranslationWorkflow")(function* (payload, _executionId) {
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
      workflowName: "CommentTranslationWorkflow",
      workflowVersion: WORKFLOW_VERSION,
      model: `translation/${translationResult.serviceId}`,
    })

    const repository = yield* CommentsRepository

    yield* Activity.make({
      name: "persist",
      success: Schema.Void,
      error: Schema.Unknown,
      execute: Effect.gen(function* () {
        const translatedContent = tiptapFromHtml(translationResult.html)

        const persistWithRetry = (
          remainingAttempts: number,
        ): Effect.Effect<
          undefined,
          | CommentConcurrentUpdateError
          | CommentNotFoundError
          | InvalidCrdtUpdateError
          | SchemaError
          | SqlError.SqlError,
          IdGen | SqlClient.SqlClient
        > =>
          Effect.gen(function* () {
            const currentComment = yield* repository.findCommentRowById(payload.commentId).pipe(
              Effect.flatMap(
                Option.match({
                  onNone: () => Effect.fail(new CommentNotFoundError({ id: payload.commentId })),
                  onSome: Effect.succeed,
                }),
              ),
            )

            return yield* repository
              .updateComment(
                SystemUpsertTranslation.make({
                  commentId: payload.commentId,
                  commit,
                  expectedCurrentCrdtFrontier: currentComment.currentCrdtFrontier,
                  sourceLanguage: payload.sourceLanguage,
                  sourceCrdtFrontier: payload.sourceCrdtFrontier,
                  targetLanguage: payload.targetLanguage,
                  translatedContent,
                }),
              )
              .pipe(
                Effect.catchTag("CommentConcurrentUpdateError", (error) =>
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
