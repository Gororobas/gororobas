/**
 * Durable translation workflow backed by Effect Cluster.
 *
 * Translates TiptapDocument content between locales using TranslationService.
 * Each activity is memoized, so a crash mid-workflow won't re-invoke the translation API.
 */
import {
  Locale,
  PostId,
  PostNotFoundError,
  SystemCommit,
  TimestampColumn,
  TiptapDocument,
  tiptapFromHtml,
} from "@gororobas/domain"
import { Effect, Option, Schema } from "effect"
import { Activity, Workflow } from "effect/unstable/workflow"

import { SystemUpsertTranslation } from "../posts/post-repository-inputs.js"
import { PostsRepository } from "../posts/repository.js"
import { translateTiptapContent, TranslationResult } from "./translate-tiptap-content.js"
import { TranslationError } from "./translation-service.js"

/**
 * Bump this when internals change.
 * Format: ISO date + revision number within that day.
 */
const WORKFLOW_VERSION = "2026-02-25.1" as const

export const PostTranslationWorkflow = Workflow.make({
  name: "PostTranslationWorkflow",
  payload: {
    postId: PostId,
    updatedAt: TimestampColumn,
    sourceLocale: Locale,
    targetLocale: Locale,
    sourceContent: TiptapDocument,
  },
  success: Schema.Null,
  error: Schema.Unknown, // @TODO: How to type TranslationError | SqlError | ParseError as schemas?
  idempotencyKey: ({ postId, targetLocale, updatedAt }) =>
    `${postId}:${targetLocale}:${updatedAt.epochMillis}`,
})

export const PostTranslationWorkflowLayer = PostTranslationWorkflow.toLayer(
  Effect.fn("PostTranslationWorkflow")(function* (payload, _executionId) {
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
      workflowName: "PostTranslationWorkflow",
      workflowVersion: WORKFLOW_VERSION,
      model: `translation/${translationResult.serviceId}`,
    })

    const repository = yield* PostsRepository

    const post = yield* repository.findPostRowById(payload.postId).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(new PostNotFoundError({ id: payload.postId })),
          onSome: Effect.succeed,
        }),
      ),
    )

    yield* Activity.make({
      name: "persist",
      success: Schema.Void,
      error: Schema.Unknown,
      execute: repository.updatePost(
        SystemUpsertTranslation.makeUnsafe({
          commit,
          expectedCurrentCrdtFrontier: post.currentCrdtFrontier,
          postId: payload.postId,
          sourceLocale: payload.sourceLocale,
          targetLocale: payload.targetLocale,
          translatedContent: tiptapFromHtml(translationResult.html),
        }),
      ),
    })

    return null
  }),
)
