/**
 * The one rule turning a canonical property's claims into what readers see: the best-ranked
 * source's values win (situated properties are tallied instead, in `situated-summary.ts`).
 * Readers only ever see resolved values and their attestations: claims, statuses and evidence
 * stay behind this module.
 *
 * It's a pure function of the claims, so it doesn't depend on their order, and stored projections
 * can always be rebuilt from it.
 *
 * A **claimed value** is a value with the visible claim stating it: what's left of a claim once
 * approval, moderation, supersession and retraction have been applied.
 */
import { Array as EffectArray, Option, Order, Schema } from "effect"
import type { NonEmptyReadonlyArray } from "effect/Array"

import { groupByEquivalentKey } from "../common/arrays.js"
import {
  type CanonicalClaim,
  Evaluation,
  type LanguageOf,
  type CanonicalPersonClaim,
  type PeopleSummary,
  type PropertyScope,
  getClaimSourceKey,
  isVisibleModerationStatus,
  oldestClaimFirst,
  summarizeAuthors,
} from "./claims.js"
import { type ClaimId, MachineProvenance, type ProvenanceSourceKey } from "./provenance.js"
import type { FractionalIndex } from "./values/fractional-index.js"

/** Who stands behind a value, as readers see it: enough for a badge, a link and a report button. */
export interface Attestation {
  readonly claimId: ClaimId
  /** The source of the claim attesting it. */
  readonly sourceKey: ProvenanceSourceKey
}

export interface ResolvedValue<Value> {
  /** As the best-ranked claim spells it, when equivalent values differ ("Milho" and "milho"). */
  readonly value: Value
  /** Best-ranked first. */
  readonly attestations: NonEmptyReadonlyArray<Attestation>
  /**
   * The people who proposed the value, in approved claims, each counted once. Agreeing with a
   * value is proposing it too: "GBIF e 4 pessoas".
   */
  readonly claimedBy: PeopleSummary
}

/** The part of a property resolution reads. */
export interface ResolutionSpec<Value> {
  readonly valueSchema: Schema.Schema<Value>
  readonly sourceKeys: ReadonlyArray<ProvenanceSourceKey>
  readonly cardinality: "ONE" | "SET" | "LIST"
}

/** A value with the visible claim stating it. */
export interface ClaimedValue<Value, Scope extends PropertyScope> {
  readonly claim: CanonicalClaim<Value, Scope>
  readonly value: Value
}

const isPersonClaim = <Value, Scope extends PropertyScope>(
  claim: CanonicalClaim<Value, Scope>,
): claim is CanonicalPersonClaim<Value, Scope> => "change" in claim

/**
 * Approved, or visible by default: in effect before supersessions and retractions are applied.
 * Pending, rejected and censored claims never take part.
 */
const isApprovedOrVisible = <Value, Scope extends PropertyScope>(
  claim: CanonicalClaim<Value, Scope>,
) =>
  isPersonClaim(claim)
    ? Evaluation.guards.APPROVED(claim.evaluation)
    : isVisibleModerationStatus(claim.moderationStatus)

const isCreatedBefore = <Value, Scope extends PropertyScope>(
  claim: CanonicalClaim<Value, Scope>,
  other: CanonicalClaim<Value, Scope>,
) => oldestClaimFirst(claim, other) === -1

/**
 * Whether a person's claim may supersede or retract `target`: an older person's claim about the
 * same article, property and language. Machine claims are reported, never retracted.
 */
const canSupersedeOrRetract = <Value, Scope extends PropertyScope>(
  personClaim: CanonicalPersonClaim<Value, Scope>,
  target: CanonicalClaim<Value, Scope>,
) =>
  isPersonClaim(target) &&
  target.articleId === personClaim.articleId &&
  target.property === personClaim.property &&
  target.language === personClaim.language &&
  isCreatedBefore(target, personClaim)

/**
 * The claims whose values readers may see. Claims are walked newest first, so a retraction is
 * settled before the claims it points at: retracting a claim that superseded another brings the
 * other back, which is what reverting a person's proposals (retracting them) relies on.
 */
const visibleClaims = <Value, Scope extends PropertyScope>(
  claims: ReadonlyArray<CanonicalClaim<Value, Scope>>,
): ReadonlyArray<CanonicalClaim<Value, Scope>> => {
  const newestFirst = EffectArray.sort(claims, Order.flip(oldestClaimFirst))

  const referencedClaimId = (
    personClaim: CanonicalPersonClaim<Value, Scope>,
    targetId: ClaimId | null,
  ) =>
    EffectArray.findFirst(
      claims,
      (target) => target.id === targetId && canSupersedeOrRetract(personClaim, target),
    ).pipe(Option.map((target) => target.id))

  const { retractedIds, supersededIds } = EffectArray.reduce(
    newestFirst,
    {
      retractedIds: EffectArray.empty<ClaimId>(),
      supersededIds: EffectArray.empty<ClaimId>(),
    },
    (state, claim) => {
      if (
        !isPersonClaim(claim) ||
        !isApprovedOrVisible(claim) ||
        state.retractedIds.includes(claim.id)
      ) {
        return state
      }

      return "retracts" in claim.change
        ? {
            ...state,
            retractedIds: [
              ...state.retractedIds,
              ...Option.toArray(referencedClaimId(claim, claim.change.retracts)),
            ],
          }
        : {
            ...state,
            supersededIds: [
              ...state.supersededIds,
              ...Option.toArray(referencedClaimId(claim, claim.change.supersedes)),
            ],
          }
    },
  )

  const claimsStatingValues = claims.filter(
    (claim) =>
      isApprovedOrVisible(claim) &&
      !retractedIds.includes(claim.id) &&
      !supersededIds.includes(claim.id) &&
      !(isPersonClaim(claim) && "retracts" in claim.change),
  )

  // A machine translation lives only as long as the claim it translates.
  return claimsStatingValues.filter(
    (claim) =>
      isPersonClaim(claim) ||
      !MachineProvenance.guards.MACHINE_TRANSLATION(claim.provenance) ||
      claimsStatingValues.some(
        (other) =>
          MachineProvenance.guards.MACHINE_TRANSLATION(claim.provenance) &&
          other.id === claim.provenance.translatedFrom,
      ),
  )
}

/** The value a claim states, if it states one: retractions don't. */
export const valueOfClaim = <Value, Scope extends PropertyScope>(
  claim: CanonicalClaim<Value, Scope>,
): Option.Option<Value> =>
  isPersonClaim(claim)
    ? "value" in claim.change
      ? Option.some(claim.change.value)
      : Option.none()
    : Option.some(claim.value)

/**
 * The values readers may see, with the claims stating them. Claims from a source the property no
 * longer lists are left out: they'd otherwise rank above every listed source, and they wait for a
 * migration to decide what they become (see the implementation plan on versioning).
 */
export const claimedValues = <Value, Scope extends PropertyScope>({
  property,
  claims,
}: {
  readonly property: Pick<ResolutionSpec<Value>, "sourceKeys">
  readonly claims: ReadonlyArray<CanonicalClaim<Value, Scope>>
}): ReadonlyArray<ClaimedValue<Value, Scope>> =>
  visibleClaims(claims).flatMap((claim) =>
    property.sourceKeys.includes(getClaimSourceKey(claim))
      ? Option.toArray(Option.map(valueOfClaim(claim), (value) => ({ claim, value })))
      : [],
  )

/** A claim's position in a `LIST` property: people's among people's, a source's among its own. */
const positionOfClaim = <Value, Scope extends PropertyScope>(
  claim: CanonicalClaim<Value, Scope>,
): Option.Option<FractionalIndex> =>
  isPersonClaim(claim)
    ? "position" in claim.change
      ? Option.fromNullishOr(claim.change.position)
      : Option.none()
    : Option.fromNullishOr(claim.position)

/** Equivalent values, with every claim stating them, best-ranked first. */
interface ValueGroup<Value, Scope extends PropertyScope> {
  readonly value: Value
  readonly claims: NonEmptyReadonlyArray<CanonicalClaim<Value, Scope>>
}

export const resolve = <Value, Scope extends PropertyScope>({
  property,
  claims,
  language,
}: {
  readonly property: ResolutionSpec<Value>
  /** Every claim of the property about the article, in every language. */
  readonly claims: ReadonlyArray<CanonicalClaim<Value, Scope>>
  readonly language: LanguageOf<Scope>
}): ReadonlyArray<ResolvedValue<Value>> => {
  const isSameValue = Schema.toEquivalence(property.valueSchema)
  const sourceRankOf = (claim: CanonicalClaim<Value, Scope>) =>
    property.sourceKeys.indexOf(getClaimSourceKey(claim))

  // Best-ranked source first, then the source's own order in a list, then newest: never the
  // order claims came in.
  const rankThenNewestOrder = Order.combineAll([
    Order.mapInput(Order.Number, sourceRankOf),
    Order.mapInput(Order.Boolean, (claim: CanonicalClaim<Value, Scope>) =>
      Option.isNone(positionOfClaim(claim)),
    ),
    Order.mapInput(Order.String, (claim: CanonicalClaim<Value, Scope>) =>
      Option.getOrElse(positionOfClaim(claim), () => ""),
    ),
    Order.flip(oldestClaimFirst),
  ])

  const claimedValuesInLanguage = EffectArray.sort(
    claimedValues({ property, claims }).filter(({ claim }) => claim.language === language),
    Order.mapInput(rankThenNewestOrder, (claimed: ClaimedValue<Value, Scope>) => claimed.claim),
  )

  // Sorted, so each group's first claim is its best-ranked, and its spelling the one shown.
  const valueGroups = groupByEquivalentKey({
    items: claimedValuesInLanguage,
    keyOf: ({ value }) => value,
    isEquivalent: isSameValue,
  }).map(({ key, items }): ValueGroup<Value, Scope> => ({
    value: key,
    claims: EffectArray.map(items, ({ claim }) => claim),
  }))

  // People order a list; values only other sources state follow, in source order.
  const peoplePositionOf = (group: ValueGroup<Value, Scope>) =>
    EffectArray.head(
      EffectArray.sort(
        group.claims.flatMap((claim) =>
          isPersonClaim(claim) ? Option.toArray(positionOfClaim(claim)) : [],
        ),
        Order.String,
      ),
    )

  const isList = property.cardinality === "LIST"

  const orderedGroups = EffectArray.sort(
    valueGroups,
    Order.combineAll([
      Order.mapInput(Order.Boolean, (group: ValueGroup<Value, Scope>) =>
        isList ? Option.isNone(peoplePositionOf(group)) : false,
      ),
      Order.mapInput(Order.String, (group: ValueGroup<Value, Scope>) =>
        isList ? Option.getOrElse(peoplePositionOf(group), () => "") : "",
      ),
      Order.mapInput(rankThenNewestOrder, (group: ValueGroup<Value, Scope>) => group.claims[0]),
    ]),
  )

  const shownGroups = property.cardinality === "ONE" ? orderedGroups.slice(0, 1) : orderedGroups

  return shownGroups.map((group) => ({
    value: group.value,
    attestations: EffectArray.map(group.claims, (claim) => ({
      claimId: claim.id,
      sourceKey: getClaimSourceKey(claim),
    })),
    claimedBy: summarizeAuthors(
      group.claims.filter(isPersonClaim).filter((claim) => claim.provenance.authorId !== null),
    ),
  }))
}

/**
 * Whether the property shows any value about the article, in any language. For a required
 * language-specific property, that's what "required" means: some language has a value.
 */
export const hasAnyValue = <Value, Scope extends PropertyScope>({
  property,
  claims,
}: {
  readonly property: ResolutionSpec<Value>
  readonly claims: ReadonlyArray<CanonicalClaim<Value, Scope>>
}) =>
  EffectArray.dedupe(claims.map((claim) => claim.language)).some((language) =>
    EffectArray.isReadonlyArrayNonEmpty(resolve({ property, claims, language })),
  )
