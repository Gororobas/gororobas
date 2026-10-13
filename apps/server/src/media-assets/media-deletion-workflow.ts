import { MediaAssetId, MediaAssetStorageError } from "@gororobas/domain"
import { Array as EffectArray, Effect, Order, Result, Schema } from "effect"
import { Activity, DurableClock, Workflow, WorkflowEngine } from "effect/workflow"

import { MediaAssetsStorage } from "./storage.js"

export const MediaDeletionWorkflow = Workflow.make("MediaDeletionWorkflow/v1", {
  payload: { mediaAssetIds: Schema.Array(MediaAssetId) },
  success: Schema.Void,
  error: MediaAssetStorageError,
  idempotencyKey: ({ mediaAssetIds }) => EffectArray.sort(mediaAssetIds, Order.String).join(":"),
})

export const MediaDeletionWorkflowLayer = MediaDeletionWorkflow.toLayer(
  Effect.fn(function* ({ mediaAssetIds }) {
    const storage = yield* MediaAssetsStorage

    const remove = (
      mediaAssetId: MediaAssetId,
      attempt: number,
    ): Effect.Effect<
      void,
      never,
      WorkflowEngine.WorkflowEngine | WorkflowEngine.WorkflowInstance
    > =>
      Effect.gen(function* () {
        const result = yield* Activity.make({
          name: `delete-${mediaAssetId}-${attempt}`,
          success: Schema.Void,
          error: MediaAssetStorageError,
          execute: storage.remove(mediaAssetId),
        }).pipe(Effect.result)

        if (Result.isSuccess(result)) return

        yield* DurableClock.sleep({
          name: `retry-delete-${mediaAssetId}-${attempt}`,
          duration: "1 minute",
          inMemoryThreshold: 0,
        })

        return yield* remove(mediaAssetId, attempt + 1)
      })

    yield* Effect.forEach(mediaAssetIds, (id) => remove(id, 0), { concurrency: 1, discard: true })
  }),
)
