import { PostId, PostNotFoundError } from "@gororobas/domain"
import { Effect, Option, Schema } from "effect"
import { Workflow } from "effect/unstable/workflow"

import { PostsRepository } from "../posts/repository.js"
import { postClassificationIdempotencyKey } from "./extract-post-taxonomies.js"

export const PostClassificationWorkflow = Workflow.make({
  name: "PostClassification",
  payload: {
    post_id: PostId,
    content_hash: Schema.String,
  },
  success: Schema.Null,
  error: Schema.Unknown, // @TODO how to type errors as schemas for stuff like SqlError?
  idempotencyKey: ({ post_id, content_hash }) =>
    postClassificationIdempotencyKey(post_id, content_hash),
})

export const PostClassificationWorkflowLayer = PostClassificationWorkflow.toLayer(
  Effect.fn("PostClassificationWorkflow")(function* (payload, _executionId) {
    const posts = yield* PostsRepository
    yield* posts.findPostRowById(payload.post_id).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(new PostNotFoundError({ id: payload.post_id })),
          onSome: Effect.succeed,
        }),
      ),
    )

    // @TODO: get the tiptap document from the CRDT, hash it, skip if not equal payload.hash, then extract, then materialize, then create suggested tags and vegetables
    // const currentHash = post.value.

    return null
  }),
)
