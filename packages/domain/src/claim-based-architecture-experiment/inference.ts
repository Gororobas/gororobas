/**
 * Rules for reading situated claims from people's publications (`SituatedInferredClaim`).
 * Inference re-runs whenever a publication changes or the workflow's version is bumped, so each
 * run must leave alone what moderation already settled.
 */
import { Schema } from "effect"

import type { LanguageOf, PropertyScope, SituatedInferredClaim } from "./claims.js"
import type { InferencePassage } from "./claims.js"

/**
 * Whether inference may (re)assert a value from a passage. A value censored from the same passage
 * stays out on every re-run, whatever the model or workflow version, but the same value read from
 * another passage still counts: censoring is about what a passage said, not about the value.
 *
 * Joana writes "a cenoura aqui ficou no estrato alto" in one post, and a moderator censors the
 * inferred claim "strata: high" after a report: the passage was about her neighbour's carrots.
 * Re-running inference on that post must not bring "high" back, which is what this checks. If she
 * later writes in another post that hers grew tall too, that passage stands on its own.
 * @TODO (personal) I need to better understand this
 */
export const isAllowedToInfer = <Value, Scope extends PropertyScope>({
  valueSchema,
  existingClaims,
  candidate,
}: {
  readonly valueSchema: Schema.Schema<Value>
  /** The author's inferred claims of the property about the article. */
  readonly existingClaims: ReadonlyArray<SituatedInferredClaim<Value, Scope>>
  readonly candidate: {
    readonly passage: InferencePassage
    readonly language: LanguageOf<Scope>
    readonly value: Value
  }
}) => {
  const isSameValue = Schema.toEquivalence(valueSchema)

  return !existingClaims.some(
    (claim) =>
      claim.moderationStatus === "CENSORED" &&
      claim.language === candidate.language &&
      claim.passage.publicationId === candidate.passage.publicationId &&
      claim.passage.nodeId === candidate.passage.nodeId &&
      isSameValue(claim.value, candidate.value),
  )
}
