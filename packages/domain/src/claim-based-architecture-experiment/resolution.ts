/**
 * The one rule turning an article's claims into what readers see. Readers only ever see resolved
 * values and their attestations: claims, statuses and evidence stay behind this module.
 *
 * It's a pure function of the claims, so it doesn't depend on their order, and stored projections
 * can always be rebuilt from it. Cultivars inherit at read time (`resolveCultivarTrait`), so a
 * plant's change never has to be copied into its cultivars.
 *
 * A **claimed value** is a value with the visible claim stating it: what's left of a claim once
 * approval, moderation, supersession and retraction have been applied.
 */
import { Array as EffectArray, DateTime, Option, Order, Schema } from "effect"
import type { NonEmptyReadonlyArray } from "effect/Array"

import { PersonId, type WikiArticleId } from "../common/ids.js"
import { IntNonNegative } from "../common/primitives.js"
import {
  type Claim,
  Evaluation,
  type LanguageOf,
  type PersonClaim,
  type PropertyScope,
  getClaimSourceKey,
  isVisibleModerationStatus,
} from "./claims.js"
import type { Dispute } from "./disputes.js"
import type { Endorsement } from "./endorsements.js"
import { type ClaimId, MachineProvenance, type SourceKey } from "./sources.js"
import type { FractionalIndex } from "./values/fractional-index.js"

/** Who stands behind a value, as readers see it: enough for a badge, a link and a dispute button. */
export interface Attestation {
  readonly claimId: ClaimId
  readonly source: SourceKey
}

/** How many people did something, with a few of them to show as avatars. */
export const PeopleSummary = Schema.Struct({
  totalCount: IntNonNegative,
  /** The most recent ones, at most three. */
  samplePeopleIds: Schema.Array(PersonId).check(Schema.isMaxLength(3)),
})

export type PeopleSummary = typeof PeopleSummary.Type

export interface ResolvedValue<Value> {
  /** As the best-ranked claim spells it, when equivalent values differ ("Milho" and "milho"). */
  readonly value: Value
  /** Best-ranked first. */
  readonly attestations: NonEmptyReadonlyArray<Attestation>
  /**
   * The people standing behind the value: authors of its approved claims and people endorsing any
   * of its claims, each counted once. "Cenoura, estrato alto: 7 pessoas endossam."
   */
  readonly endorsedBy: PeopleSummary
  /** The people disputing any of its claims, while their disputes are open. */
  readonly disputedBy: PeopleSummary
}

/** The part of a property resolution reads. */
export interface ResolutionSpec<Value> {
  readonly valueSchema: Schema.Schema<Value>
  readonly sources: ReadonlyArray<SourceKey>
  readonly cardinality: "ONE" | "SET" | "LIST"
  /** For `SET` and `LIST`; `ALL_SOURCES` when absent. */
  readonly mergeStrategy?: "ALL_SOURCES" | "FIRST_SOURCE_WITH_VALUES"
}

/** A value with the visible claim stating it. */
export interface ClaimedValue<Value, Scope extends PropertyScope> {
  readonly claim: Claim<Value, Scope>
  readonly value: Value
}

const isPersonClaim = <Value, Scope extends PropertyScope>(
  claim: Claim<Value, Scope>,
): claim is PersonClaim<Value, Scope> => "change" in claim

/**
 * Approved, or visible by default: in effect before supersessions and retractions are applied.
 * Pending, rejected and censored claims never take part.
 */
const isApprovedOrVisible = <Value, Scope extends PropertyScope>(claim: Claim<Value, Scope>) =>
  isPersonClaim(claim)
    ? Evaluation.guards.APPROVED(claim.evaluation)
    : isVisibleModerationStatus(claim.moderationStatus)

/**
 * Oldest first, and claims created in the same millisecond by ID, so any two claims compare the
 * same way wherever they're sorted.
 */
const chronologicalOrder = <Value, Scope extends PropertyScope>(): Order.Order<
  Claim<Value, Scope>
> =>
  Order.combine(
    Order.mapInput(Order.Number, (claim: Claim<Value, Scope>) =>
      DateTime.toEpochMillis(claim.createdAt),
    ),
    Order.mapInput(Order.String, (claim: Claim<Value, Scope>) => claim.id),
  )

const isCreatedBefore = <Value, Scope extends PropertyScope>(
  claim: Claim<Value, Scope>,
  other: Claim<Value, Scope>,
) => chronologicalOrder<Value, Scope>()(claim, other) === -1

/**
 * Whether a person's claim may supersede or retract `target`: an older person's claim about the
 * same article, property and language. Machine claims are disputed, never retracted.
 */
const canSupersedeOrRetract = <Value, Scope extends PropertyScope>(
  personClaim: PersonClaim<Value, Scope>,
  target: Claim<Value, Scope>,
) =>
  isPersonClaim(target) &&
  target.articleId === personClaim.articleId &&
  target.property === personClaim.property &&
  target.language === personClaim.language &&
  isCreatedBefore(target, personClaim)

/**
 * The claims whose values readers may see. Claims are walked newest first, so a retraction is
 * settled before the claims it points at: retracting a claim that superseded another brings the
 * other back, which is what reverting a changeset (retracting its claims) relies on.
 */
const visibleClaims = <Value, Scope extends PropertyScope>(
  claims: ReadonlyArray<Claim<Value, Scope>>,
): ReadonlyArray<Claim<Value, Scope>> => {
  const newestFirst = EffectArray.sort(claims, Order.flip(chronologicalOrder<Value, Scope>()))

  const referencedClaimId = (personClaim: PersonClaim<Value, Scope>, targetId: ClaimId | null) =>
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
  claim: Claim<Value, Scope>,
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
  readonly property: Pick<ResolutionSpec<Value>, "sources">
  readonly claims: ReadonlyArray<Claim<Value, Scope>>
}): ReadonlyArray<ClaimedValue<Value, Scope>> =>
  visibleClaims(claims).flatMap((claim) =>
    property.sources.includes(getClaimSourceKey(claim))
      ? Option.toArray(Option.map(valueOfClaim(claim), (value) => ({ claim, value })))
      : [],
  )

/** A claim's position in a `LIST` property: people's among people's, a source's among its own. */
const positionOfClaim = <Value, Scope extends PropertyScope>(
  claim: Claim<Value, Scope>,
): Option.Option<FractionalIndex> =>
  isPersonClaim(claim)
    ? "position" in claim.change
      ? Option.fromNullishOr(claim.change.position)
      : Option.none()
    : Option.fromNullishOr(claim.position)

/** Equivalent values, with every claim stating them, best-ranked first. */
interface ValueGroup<Value, Scope extends PropertyScope> {
  readonly value: Value
  readonly claims: NonEmptyReadonlyArray<Claim<Value, Scope>>
}

interface PersonAct {
  readonly personId: PersonId | null
  readonly at: DateTime.Utc
}

/** Distinct people, with the three most recent to show. Acts by deleted accounts still count. */
const summarizePeople = (acts: ReadonlyArray<PersonAct>): PeopleSummary => {
  const mostRecentFirst = EffectArray.sort(
    acts,
    Order.flip(Order.mapInput(Order.Number, (act: PersonAct) => DateTime.toEpochMillis(act.at))),
  )
  const knownPeople = EffectArray.dedupe(
    mostRecentFirst.flatMap(({ personId }) => (personId === null ? [] : [personId])),
  )
  const actsByDeletedAccounts = acts.filter(({ personId }) => personId === null)

  return {
    totalCount: knownPeople.length + actsByDeletedAccounts.length,
    samplePeopleIds: knownPeople.slice(0, 3),
  }
}

export const resolve = <Value, Scope extends PropertyScope>({
  property,
  claims,
  language,
  endorsements = [],
  disputes = [],
}: {
  readonly property: ResolutionSpec<Value>
  /** Every claim of the property about the article, in every language. */
  readonly claims: ReadonlyArray<Claim<Value, Scope>>
  readonly language: LanguageOf<Scope>
  readonly endorsements?: ReadonlyArray<Endorsement>
  readonly disputes?: ReadonlyArray<Dispute>
}): ReadonlyArray<ResolvedValue<Value>> => {
  const isSameValue = Schema.toEquivalence(property.valueSchema)
  const sourceRankOf = (claim: Claim<Value, Scope>) =>
    property.sources.indexOf(getClaimSourceKey(claim))

  // Best-ranked source first, then the source's own order in a list, then newest: never the
  // order claims came in.
  const rankThenNewestOrder = Order.combineAll([
    Order.mapInput(Order.Number, sourceRankOf),
    Order.mapInput(Order.Boolean, (claim: Claim<Value, Scope>) =>
      Option.isNone(positionOfClaim(claim)),
    ),
    Order.mapInput(Order.String, (claim: Claim<Value, Scope>) =>
      Option.getOrElse(positionOfClaim(claim), () => ""),
    ),
    Order.flip(chronologicalOrder<Value, Scope>()),
  ])

  const claimedValuesInLanguage = EffectArray.sort(
    claimedValues({ property, claims }).filter(({ claim }) => claim.language === language),
    Order.mapInput(rankThenNewestOrder, (claimed: ClaimedValue<Value, Scope>) => claimed.claim),
  )

  // Sorted, so each group's first claim is its best-ranked, and its spelling the one shown.
  const valueGroups = EffectArray.reduce(
    claimedValuesInLanguage,
    EffectArray.empty<ValueGroup<Value, Scope>>(),
    (groups, { claim, value }) =>
      EffectArray.findFirstIndex(groups, (group) => isSameValue(group.value, value)).pipe(
        Option.flatMap((index) =>
          EffectArray.modify(groups, index, (group) => ({
            ...group,
            claims: EffectArray.append(group.claims, claim),
          })),
        ),
        Option.getOrElse(() =>
          EffectArray.append(groups, { value, claims: EffectArray.of(claim) }),
        ),
      ),
  )

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

  const bestSourceRankOf = (group: ValueGroup<Value, Scope>) => sourceRankOf(group.claims[0])

  const shownGroups =
    property.cardinality === "ONE"
      ? orderedGroups.slice(0, 1)
      : (property.mergeStrategy ?? "ALL_SOURCES") === "ALL_SOURCES"
        ? orderedGroups
        : EffectArray.head(orderedGroups).pipe(
            Option.map(bestSourceRankOf),
            Option.match({
              onNone: () => [],
              onSome: (bestRank) =>
                orderedGroups.filter((group) => bestSourceRankOf(group) === bestRank),
            }),
          )

  const claimIdsOf = (group: ValueGroup<Value, Scope>) => group.claims.map((claim) => claim.id)

  const endorsedBy = (group: ValueGroup<Value, Scope>) =>
    summarizePeople([
      ...group.claims.flatMap((claim): ReadonlyArray<PersonAct> =>
        isPersonClaim(claim) && claim.provenance.authorId !== null
          ? [{ personId: claim.provenance.authorId, at: claim.createdAt }]
          : [],
      ),
      ...endorsements
        .filter((endorsement) => claimIdsOf(group).includes(endorsement.claimId))
        .map((endorsement) => ({ personId: endorsement.personId, at: endorsement.createdAt })),
    ])

  const disputedBy = (group: ValueGroup<Value, Scope>) =>
    summarizePeople(
      disputes
        .filter(
          (dispute) =>
            dispute.settledByEventId === null && claimIdsOf(group).includes(dispute.claimId),
        )
        .map((dispute) => ({ personId: dispute.personId, at: dispute.createdAt })),
    )

  return shownGroups.map((group) => ({
    value: group.value,
    attestations: EffectArray.map(group.claims, (claim) => ({
      claimId: claim.id,
      source: getClaimSourceKey(claim),
    })),
    endorsedBy: endorsedBy(group),
    disputedBy: disputedBy(group),
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
  readonly claims: ReadonlyArray<Claim<Value, Scope>>
}) =>
  EffectArray.dedupe(claims.map((claim) => claim.language)).some((language) =>
    EffectArray.isReadonlyArrayNonEmpty(resolve({ property, claims, language })),
  )

/**
 * A cultivar's trait as its page shows it: today's `CultivarProperty` (`Unknown | Inherit | Value`),
 * derived from claims rather than stored. The plant's values come along in every case, so the page
 * can show them beside the cultivar's, or for context when the cultivar's are unknown.
 *
 * @TODO can this be more generic? I'm assuming we'll eventually have other inheritance relationships between articles beyond cultivars
 */
export type CultivarTrait<Value> =
  /** The cultivar lists the trait in `inheritsFromParent`: the plant's values are its values. */
  | {
      readonly _tag: "INHERITED"
      readonly plantId: WikiArticleId
      readonly values: ReadonlyArray<ResolvedValue<Value>>
    }
  /** The cultivar has values of its own. */
  | {
      readonly _tag: "OWN"
      readonly values: NonEmptyReadonlyArray<ResolvedValue<Value>>
      readonly plantValues: ReadonlyArray<ResolvedValue<Value>>
    }
  /** Neither: unknown for the cultivar, never filled in from the plant. */
  | { readonly _tag: "UNKNOWN"; readonly plantValues: ReadonlyArray<ResolvedValue<Value>> }

/**
 * Runs when the cultivar is read, so the plant's changes show without copying anything. Inheriting
 * and having values of its own are different statements: the edit form offers one or the other,
 * and choosing to inherit retracts the cultivar's own claims. Should both exist anyway, inheriting
 * wins, since it's the explicit choice.
 */
export const resolveCultivarTrait = <Value>({
  cultivarValues,
  plantValues,
  plantId,
  inheritsFromPlant,
}: {
  readonly cultivarValues: ReadonlyArray<ResolvedValue<Value>>
  readonly plantValues: ReadonlyArray<ResolvedValue<Value>>
  readonly plantId: WikiArticleId
  readonly inheritsFromPlant: boolean
}): CultivarTrait<Value> =>
  inheritsFromPlant
    ? { _tag: "INHERITED", plantId, values: plantValues }
    : EffectArray.match(cultivarValues, {
        onEmpty: (): CultivarTrait<Value> => ({ _tag: "UNKNOWN", plantValues }),
        onNonEmpty: (values): CultivarTrait<Value> => ({ _tag: "OWN", values, plantValues }),
      })
