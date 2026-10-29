import { LinkInferenceModelError, LoroDocFrontier, WikiArticleId } from "@gororobas/domain"
import { Effect, Schema } from "effect"
import { Workflow } from "effect/workflow"

import { LINK_INFERENCE_VERSION } from "./link-inference-version.js"
import { LinkInferencePersistenceError } from "./persistence-errors.js"

const encodeFrontier = Schema.encodeSync(Schema.fromJsonString(LoroDocFrontier))

export const WikiArticleLinkInferenceWorkflow = Workflow.make("WikiArticleLinkInference", {
  payload: {
    wikiArticleId: WikiArticleId,
    crdtFrontier: LoroDocFrontier,
  },
  success: Schema.Null,
  error: Schema.Union([LinkInferenceModelError, LinkInferencePersistenceError]),
  idempotencyKey: ({ wikiArticleId, crdtFrontier }) =>
    `${wikiArticleId}:${encodeFrontier(crdtFrontier)}:${LINK_INFERENCE_VERSION}`,
})

/** Best-effort submission after the article transaction commits. */
export const requestWikiArticleLinkInference = Effect.fn(function* (
  article: { id: WikiArticleId; currentCrdtFrontier: LoroDocFrontier },
  previous?: { currentCrdtFrontier: LoroDocFrontier },
) {
  const payload = { wikiArticleId: article.id, crdtFrontier: article.currentCrdtFrontier }

  // Interrupt the run for the replaced content, so it doesn't spend model calls on stale text.
  if (
    previous &&
    !Schema.toEquivalence(LoroDocFrontier)(previous.currentCrdtFrontier, payload.crdtFrontier)
  ) {
    yield* WikiArticleLinkInferenceWorkflow.interrupt(
      yield* WikiArticleLinkInferenceWorkflow.executionId({
        wikiArticleId: article.id,
        crdtFrontier: previous.currentCrdtFrontier,
      }),
    )
  }

  yield* WikiArticleLinkInferenceWorkflow.execute(payload, { discard: true })
})
