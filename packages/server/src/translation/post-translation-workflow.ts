/**
 * Durable translation workflow backed by Effect Cluster.
 *
 * Translates TiptapDocument content between locales using TranslationService.
 * Each activity is memoized, so a crash mid-workflow won't re-invoke the translation API.
 */
import {
  Locale,
  LoroDocFrontier,
  loroDocToUpdate,
  modifyLoroDocWithCommit,
  PostId,
  PostLocalizedData,
  snapshotToLoroDoc,
  SourcePostData,
  SystemCommit,
  TimestampColumn,
  TiptapDocument,
  tiptapFromHtml,
} from "@gororobas/domain"
import { Effect, Schema } from "effect"
import { Activity, Workflow } from "effect/unstable/workflow"

import { PostSourceDataLoro } from "../posts/post-loro.lib.js"
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

    const repo = yield* PostsRepository
    const crdt = yield* repo.getCrdt(payload.postId)
    const currentLoroDoc = snapshotToLoroDoc(crdt.loroCrdt)
    const currentSourceData = yield* Schema.decodeEffect(SourcePostData)(currentLoroDoc.toJSON())

    const updatedSourceData: SourcePostData = {
      ...currentSourceData,
      locales: {
        ...currentSourceData.locales,
        [payload.targetLocale]: PostLocalizedData.makeUnsafe({
          content: tiptapFromHtml(translationResult.html),
          originalLocale: payload.sourceLocale,
          translationSource: "AUTOMATIC",
        }),
      },
    }

    const commit = SystemCommit.makeUnsafe({
      workflowName: "PostTranslationWorkflow",
      workflowVersion: WORKFLOW_VERSION,
      model: `translation/${translationResult.serviceId}`,
    })

    const updatedDoc = yield* modifyLoroDocWithCommit({
      commit,
      initialDoc: currentLoroDoc,
      schema: PostSourceDataLoro,
      // @TODO better type loro-mirror schemas
      newData: updatedSourceData as any,
    })

    // @TODO: how much of the above should be moved into here? Or perhaps a separate activity for creating the updated doc?
    yield* Activity.make({
      name: "persist",
      success: Schema.Void,
      error: Schema.Unknown, // @TODO: How to type SqlError | ParseError as schemas?
      execute: repo.insertCommit({
        commit,
        postId: payload.postId,
        fromCrdtFrontier: LoroDocFrontier.makeUnsafe(currentLoroDoc.frontiers()),
        crdtUpdate: loroDocToUpdate(updatedDoc),
      }),
    })

    return null
  }),
)
