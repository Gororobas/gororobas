/**
 * Rules for claims machines write: what evidence they rest on, which ones a report's outcome
 * keeps out, and how a provider's refresh updates them, on canonical and situated properties
 * alike. What inference reads from publications is people's claims (`isAllowedToInfer` in
 * `inference.ts`).
 */
import { Array as EffectArray, Option, Schema } from "effect"

import type { ModerationStatus } from "../common/enums.js"
import type { CanonicalMachineClaim, LanguageOf, PropertyScope } from "./claims.js"
import { MachineProvenance, type ClaimId, TextLocation } from "./provenance.js"
import type { ResolutionSpec } from "./resolution.js"
import { type FractionalIndex, keyBetween } from "./values/fractional-index.js"

const locationKey = (location: TextLocation) =>
  TextLocation.guards.ARTICLE_TEXT(location)
    ? `article-text:${location.wikiArticleId}:${location.language}:${location.nodeId}`
    : `publication:${location.publicationId}:${location.nodeId}`

/**
 * What a machine claim rests on: a provider's record for the article, the node of article text
 * holding an entity reference, the claim a translation translates. Two claims share evidence when
 * a re-run read the same thing.
 */
export const evidenceKey = (provenance: MachineProvenance): string =>
  MachineProvenance.match(provenance, {
    EXTERNAL_PROVIDER: ({ provider }) => `provider:${provider}`,
    ARTICLE_TEXT_ENTITY_REFERENCE: ({ location }) => locationKey(location),
    MACHINE_TRANSLATION: ({ translatedFrom }) => `translation:${translatedFrom}`,
  })

/** A value a machine source asserts, with the language it's in. */
export interface ExtractedValue<Value, Scope extends PropertyScope> {
  readonly language: LanguageOf<Scope>
  readonly value: Value
}

/**
 * Whether a machine may (re)assert a value of a canonical property. A value censored from the
 * same evidence stays out on every re-run, but the same value from other evidence (an entity
 * reference in another paragraph) still counts: censoring is about what a source read, not about
 * the value.
 */
export const isAllowedToAssert = <Value, Scope extends PropertyScope>({
  valueSchema,
  existingClaims,
  candidate,
}: {
  readonly valueSchema: Schema.Schema<Value>
  /** The source's claims of the property about the article. */
  readonly existingClaims: ReadonlyArray<CanonicalMachineClaim<Value, Scope>>
  readonly candidate: ExtractedValue<Value, Scope> & { readonly provenance: MachineProvenance }
}) => {
  const isSameValue = Schema.toEquivalence(valueSchema)

  return !existingClaims.some(
    (claim) =>
      claim.moderationStatus === "CENSORED" &&
      claim.language === candidate.language &&
      evidenceKey(claim.provenance) === evidenceKey(candidate.provenance) &&
      isSameValue(claim.value, candidate.value),
  )
}

/** A value to write as a new claim, at the position the provider gave it in a list. */
export interface PlannedValue<Value, Scope extends PropertyScope> extends ExtractedValue<
  Value,
  Scope
> {
  readonly position: FractionalIndex | null
}

/**
 * A provider's claim as a refresh sees it: a canonical one, with a position in a list, or a
 * situated one, which has none.
 */
export interface RefreshableClaim<Value, Scope extends PropertyScope> {
  readonly id: ClaimId
  readonly language: LanguageOf<Scope>
  readonly value: Value
  readonly moderationStatus: ModerationStatus
  readonly position?: FractionalIndex | null
}

export interface ProviderRefreshPlan<Value, Scope extends PropertyScope> {
  /** Claims whose value the provider still asserts: kept with their ID, status and reports. */
  readonly keepClaimIds: ReadonlyArray<ClaimId>
  /** Kept claims the provider now lists elsewhere, in a list. */
  readonly repositionClaims: ReadonlyArray<{
    readonly claimId: ClaimId
    readonly position: FractionalIndex
  }>
  /** Claims the provider no longer asserts. */
  readonly removeClaimIds: ReadonlyArray<ClaimId>
  /** Values the provider asserts for the first time, to write as new claims. */
  readonly addValues: ReadonlyArray<PlannedValue<Value, Scope>>
}

/**
 * A provider's refresh, in place. Claims are never deleted and re-inserted, so reports
 * and translations keep pointing at them. Censored claims are always kept: they're
 * how the censored value stays out of later refreshes. In a list, the provider's order is kept
 * too: each value's position follows the order it was extracted in.
 */
export const planProviderRefresh = <Value, Scope extends PropertyScope>({
  property,
  existingClaims,
  extractedValues,
}: {
  /** Situated properties have no cardinality: their claims have no position. */
  readonly property: Pick<ResolutionSpec<Value>, "valueSchema"> &
    Partial<Pick<ResolutionSpec<Value>, "cardinality">>
  /** The provider's current claims of the property about the article. */
  readonly existingClaims: ReadonlyArray<RefreshableClaim<Value, Scope>>
  /** What the provider asserts now, in its order, from its latest result. */
  readonly extractedValues: ReadonlyArray<ExtractedValue<Value, Scope>>
}): ProviderRefreshPlan<Value, Scope> => {
  const isSameValue = Schema.toEquivalence(property.valueSchema)
  const isSameExtraction = (
    self: ExtractedValue<Value, Scope>,
    that: ExtractedValue<Value, Scope>,
  ) => self.language === that.language && isSameValue(self.value, that.value)

  const distinctValues = extractedValues.filter(
    (extracted, index) =>
      extractedValues.findIndex((other) => isSameExtraction(other, extracted)) === index,
  )

  // Positions in the provider's order, per language.
  const positioned = EffectArray.reduce(
    distinctValues,
    EffectArray.empty<PlannedValue<Value, Scope>>(),
    (planned, extracted) => {
      const previousInLanguage = EffectArray.findLast(
        planned,
        (other) => other.language === extracted.language,
      ).pipe(Option.flatMap((other) => Option.fromNullishOr(other.position)))

      return [
        ...planned,
        {
          ...extracted,
          position:
            property.cardinality === "LIST" ? keyBetween(previousInLanguage, Option.none()) : null,
        },
      ]
    },
  )

  const extractionOf = (claim: RefreshableClaim<Value, Scope>) =>
    EffectArray.findFirst(positioned, (planned) =>
      isSameExtraction(planned, { language: claim.language, value: claim.value }),
    )

  const kept = existingClaims.filter(
    (claim) => claim.moderationStatus === "CENSORED" || Option.isSome(extractionOf(claim)),
  )

  return {
    keepClaimIds: kept.map((claim) => claim.id),
    repositionClaims: kept.flatMap((claim) =>
      Option.toArray(extractionOf(claim)).flatMap(({ position }) =>
        position !== null && position !== (claim.position ?? null)
          ? [{ claimId: claim.id, position }]
          : [],
      ),
    ),
    removeClaimIds: existingClaims
      .filter((claim) => !kept.includes(claim))
      .map((claim) => claim.id),
    addValues: positioned.filter(
      (planned) =>
        !existingClaims.some((claim) =>
          isSameExtraction(planned, { language: claim.language, value: claim.value }),
        ),
    ),
  }
}
