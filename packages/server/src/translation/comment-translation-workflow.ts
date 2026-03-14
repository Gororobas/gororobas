/**
 * Durable translation workflow backed by Effect Cluster.
 *
 * Translates TiptapDocument content between locales using TranslationService.
 * Each activity is memoized, so a crash mid-workflow won't re-invoke the translation API.
 */
import {
  CommentId,
  CommentNotFoundError,
  Locale,
  SystemCommit,
  TimestampColumn,
  TiptapDocument,
  tiptapFromHtml,
} from "@gororobas/domain"
import { Duration, Effect, Option, Schema } from "effect"
import { Activity, Workflow } from "effect/unstable/workflow"

import { SystemUpsertTranslation } from "../comments/comment-repository-inputs.js"
import { CommentsRepository } from "../comments/repository.js"
import { translateTiptapContent, TranslationResult } from "./translate-tiptap-content.js"
import { TranslationError } from "./translation-service.js"

/**
 * Bump this when internals change.
 * Format: ISO date + revision number within that day.
 */
const WORKFLOW_VERSION = "2026-03-14.1" as const

export const CommentTranslationWorkflow = Workflow.make({
  name: "CommentTranslationWorkflow",
  payload: {
    commentId: CommentId,
    updatedAt: TimestampColumn,
    sourceLocale: Locale,
    targetLocale: Locale,
    sourceContent: TiptapDocument,
  },
  success: Schema.Null,
  error: Schema.Unknown,
  idempotencyKey: ({ commentId, targetLocale, updatedAt }) =>
    `${commentId}:${targetLocale}:${updatedAt.epochMillis}`,
})

export const CommentTranslationWorkflowLayer = CommentTranslationWorkflow.toLayer(
  Effect.fn("CommentTranslationWorkflow")(function* (payload, _executionId) {
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

    const commit = SystemCommit.makeUnsafe({
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
        ): Effect.Effect<void, unknown, unknown> =>
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
                SystemUpsertTranslation.makeUnsafe({
                  commentId: payload.commentId,
                  commit,
                  expectedCurrentCrdtFrontier: currentComment.currentCrdtFrontier,
                  sourceLocale: payload.sourceLocale,
                  targetLocale: payload.targetLocale,
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
