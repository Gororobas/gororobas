import { PublicationId, PublicationNotFoundError } from "@gororobas/domain"
import { Effect, Option, Schema } from "effect"
import { Workflow } from "effect/unstable/workflow"

import { PublicationsRepository } from "../publications/repository.js"
import { publicationClassificationIdempotencyKey } from "./extract-publication-taxonomies.js"

export const PublicationClassificationWorkflow = Workflow.make("PublicationClassification", {
  payload: {
    publication_id: PublicationId,
    content_hash: Schema.String,
  },
  success: Schema.Null,
  error: Schema.Unknown, // @TODO how to type errors as schemas for stuff like SqlError?
  idempotencyKey: ({ publication_id, content_hash }) =>
    publicationClassificationIdempotencyKey(publication_id, content_hash),
})

export const PublicationClassificationWorkflowLayer = PublicationClassificationWorkflow.toLayer(
  Effect.fn("PublicationClassificationWorkflow")(function* (payload, _executionId) {
    const publications = yield* PublicationsRepository
    yield* publications.findPublicationRowById(payload.publication_id).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(new PublicationNotFoundError({ id: payload.publication_id })),
          onSome: Effect.succeed,
        }),
      ),
    )

    // @TODO: get the tiptap document from the CRDT, hash it, skip if not equal payload.hash, then extract and materialize suggested tags and wiki articles
    // const currentHash = publication.value.

    return null
  }),
)
