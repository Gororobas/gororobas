/**
 * Checks every write before it changes what readers see. They're pure, so the server applies
 * the write to the article's claims in memory, checks, and only then commits.
 */
import type { Claim, PropertyScope } from "./claims.js"
import type { ClaimId } from "./provenance.js"
import { type ResolutionSpec, hasAnyValue } from "./resolution.js"

/**
 * A required property never loses its last value: approving a retraction, censoring a claim or
 * rejecting the claim a value rests on is refused while nothing else would show. The moderator
 * then approves (or asserts) a replacement first. It's what keeps an article from i.e. losing its only
 * name, or a cultivar its plant.
 */
export const keepsRequiredValue = <Value, Scope extends PropertyScope>({
  property,
  before,
  after,
}: {
  readonly property: ResolutionSpec<Value> & { readonly presence?: "REQUIRED" | "OPTIONAL" }
  readonly before: ReadonlyArray<Claim<Value, Scope>>
  readonly after: ReadonlyArray<Claim<Value, Scope>>
}) =>
  property.presence !== "REQUIRED" ||
  !hasAnyValue({ property, claims: before }) ||
  hasAnyValue({ property, claims: after })

/** The article's claims as they'd be once a claim is censored. */
export const withCensored = <Value, Scope extends PropertyScope>(
  claims: ReadonlyArray<Claim<Value, Scope>>,
  claimId: ClaimId,
): ReadonlyArray<Claim<Value, Scope>> =>
  claims.map((claim) =>
    claim.id === claimId && "moderationStatus" in claim
      ? { ...claim, moderationStatus: "CENSORED" as const }
      : claim,
  )
