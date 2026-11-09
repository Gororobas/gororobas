/**
 * Rules for claims machines write: what evidence they rest on, which ones a dispute's outcome
 * keeps out, and how a provider's refresh updates them.
 */
import { Schema } from "effect"

import type { AutomaticClaim, LanguageOf, PropertyScope } from "./claims.js"
import { AutomaticSource, type ClaimId, TextLocation } from "./sources.js"

const locationKey = (location: TextLocation) =>
  TextLocation.guards.ARTICLE_TEXT(location)
    ? `article-text:${location.wikiArticleId}:${location.language}:${location.nodeId}`
    : `publication:${location.publicationId}:${location.nodeId}`

/**
 * What an automatic claim rests on: a provider's record for the article, a node in some text, the
 * claim a translation translates. Two claims share evidence when a re-run read the same thing.
 */
export const evidenceKey = (source: AutomaticSource): string =>
  AutomaticSource.match(source, {
    EXTERNAL_PROVIDER: ({ provider }) => `provider:${provider}`,
    ARTICLE_TEXT_INFERENCE: ({ location }) => locationKey(location),
    ARTICLE_TEXT_REFERENCE: ({ location }) => locationKey(location),
    MACHINE_TRANSLATION: ({ translatedFrom }) => `translation:${translatedFrom}`,
  })

/**
 * Whether a machine may (re)assert a value. A value censored from the same evidence stays out on
 * every re-run, but the same value from other evidence (another publication saying papaya grows in
 * the Cerrado) still counts: censoring is about what a source read, not about the fact.
 */
export const isAllowedToAssert = <Value, Scope extends PropertyScope>({
  value,
  existing,
  candidate,
}: {
  readonly value: Schema.Schema<Value>
  readonly existing: ReadonlyArray<AutomaticClaim<Value, Scope>>
  readonly candidate: {
    readonly source: AutomaticSource
    readonly language: LanguageOf<Scope>
    readonly value: Value
  }
}) => {
  const equivalent = Schema.toEquivalence(value)

  return !existing.some(
    (claim) =>
      claim.moderationStatus === "CENSORED" &&
      claim.language === candidate.language &&
      evidenceKey(claim.source) === evidenceKey(candidate.source) &&
      equivalent(claim.value, candidate.value),
  )
}

export interface ProviderRefreshPlan<Value, Scope extends PropertyScope> {
  /** Claims whose value the provider still asserts: kept with their ID, status and endorsements. */
  readonly keep: ReadonlyArray<ClaimId>
  /** Claims the provider no longer asserts. */
  readonly remove: ReadonlyArray<ClaimId>
  /** Values the provider asserts for the first time. */
  readonly add: ReadonlyArray<{ readonly language: LanguageOf<Scope>; readonly value: Value }>
}

/**
 * A provider's refresh, in place. Claims are never deleted and re-inserted, so disputes,
 * endorsements and translations keep pointing at them. Censored claims are always kept: they're
 * how the censored value stays out of later refreshes.
 */
export const planProviderRefresh = <Value, Scope extends PropertyScope>({
  value,
  existing,
  extracted,
}: {
  readonly value: Schema.Schema<Value>
  /** This provider's claims of the property about the article. */
  readonly existing: ReadonlyArray<AutomaticClaim<Value, Scope>>
  readonly extracted: ReadonlyArray<{ readonly language: LanguageOf<Scope>; readonly value: Value }>
}): ProviderRefreshPlan<Value, Scope> => {
  const equivalent = Schema.toEquivalence(value)
  const matches = (
    claim: AutomaticClaim<Value, Scope>,
    candidate: { readonly language: LanguageOf<Scope>; readonly value: Value },
  ) => claim.language === candidate.language && equivalent(claim.value, candidate.value)

  const [kept, gone] = [
    existing.filter(
      (claim) =>
        claim.moderationStatus === "CENSORED" ||
        extracted.some((candidate) => matches(claim, candidate)),
    ),
    existing.filter(
      (claim) =>
        claim.moderationStatus !== "CENSORED" &&
        !extracted.some((candidate) => matches(claim, candidate)),
    ),
  ]

  return {
    keep: kept.map((claim) => claim.id),
    remove: gone.map((claim) => claim.id),
    add: extracted.filter(
      (candidate, index) =>
        !existing.some((claim) => matches(claim, candidate)) &&
        extracted.findIndex(
          (other) =>
            other.language === candidate.language && equivalent(other.value, candidate.value),
        ) === index,
    ),
  }
}
