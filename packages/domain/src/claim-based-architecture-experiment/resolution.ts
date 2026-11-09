/**
 * The one rule turning an article's claims into what readers see. Readers only ever see resolved
 * values and their attestations: claims, statuses and evidence stay behind this module.
 *
 * It's a pure function of the claims, so it doesn't depend on their order, and stored projections
 * can always be rebuilt from it. Cultivars inherit at read time (`inheritFromParent`), so a plant's
 * change never has to be copied into its cultivars.
 */
import { Array as EffectArray, DateTime, Option, Order, Schema } from "effect"
import type { NonEmptyReadonlyArray } from "effect/Array"

import type { PersonId, WikiArticleId } from "../common/ids.js"
import {
  type Claim,
  Evaluation,
  type LanguageOf,
  type PersonClaim,
  type PropertyScope,
  claimSourceKey,
  isVisibleModerationStatus,
} from "./claims.js"
import type { Endorsement } from "./endorsements.js"
import { AutomaticSource, type ClaimId, type SourceKey } from "./sources.js"

/** Who stands behind a value, as readers see it: enough for a badge, a link and a dispute button. */
export interface Attestation {
  readonly claimId: ClaimId
  readonly source: SourceKey
  /** Set when a cultivar shows its plant's value (see `inheritFromParent`). */
  readonly inheritedFrom: WikiArticleId | null
}

export interface ResolvedValue<Value> {
  /** As the best-ranked claim spells it, when equivalent values differ ("Milho" and "milho"). */
  readonly value: Value
  /** Best-ranked first. */
  readonly attestations: NonEmptyReadonlyArray<Attestation>
  /**
   * How many people stand behind the value: the authors of its approved person claims and the
   * people endorsing any of its claims, each counted once. "Cenoura, estrato alto: 7 pessoas
   * confirmam."
   */
  readonly confirmedBy: number
}

/** The part of a property resolution reads. */
export interface ResolutionSpec<Value> {
  readonly value: Schema.Schema<Value>
  readonly sources: ReadonlyArray<SourceKey>
  readonly cardinality: "ONE" | "SET" | "LIST"
  /** For `SET` and `LIST`; `ALL_SOURCES` when absent. */
  readonly mergeStrategy?: "ALL_SOURCES" | "FIRST_SOURCE_WITH_VALUES"
}

const isPersonClaim = <Value, Scope extends PropertyScope>(
  claim: Claim<Value, Scope>,
): claim is PersonClaim<Value, Scope> => "change" in claim

/** Approved, or visible by default: before supersessions and retractions are applied. */
const isLive = <Value, Scope extends PropertyScope>(claim: Claim<Value, Scope>) =>
  isPersonClaim(claim)
    ? Evaluation.guards.APPROVED(claim.evaluation)
    : isVisibleModerationStatus(claim.moderationStatus)

const isOlder = <Value, Scope extends PropertyScope>(
  target: Claim<Value, Scope>,
  reference: Claim<Value, Scope>,
) => {
  const targetTime = DateTime.toEpochMillis(target.createdAt)
  const referenceTime = DateTime.toEpochMillis(reference.createdAt)

  return (
    targetTime < referenceTime ||
    // id-based tie breaker
    (targetTime === referenceTime && target.id < reference.id)
  )
}

/**
 * Whether a person's claim may supersede or retract `target`: a person's claim about the
 * same article, property and language that is older. Machine claims are disputed, never retracted.
 */
const mayReference = <Value, Scope extends PropertyScope>(
  reference: PersonClaim<Value, Scope>,
  target: Claim<Value, Scope>,
) =>
  isPersonClaim(target) &&
  target.subjectId === reference.subjectId &&
  target.property === reference.property &&
  target.language === reference.language &&
  isOlder(target, reference)

/**
 * The claims whose values readers may see. Claims are walked newest first, so a retraction is
 * settled before the claims it points at: retracting a claim that superseded another brings the
 * other back, which is what reverting a changeset (retracting its claims) relies on.
 */
const visibleClaims = <Value, Scope extends PropertyScope>(
  claims: ReadonlyArray<Claim<Value, Scope>>,
): ReadonlyArray<Claim<Value, Scope>> => {
  const newestFirst = EffectArray.sort(
    claims,
    Order.flip(
      Order.combine(
        Order.mapInput(Order.Number, (claim: Claim<Value, Scope>) =>
          DateTime.toEpochMillis(claim.createdAt),
        ),
        // id-based tie breaker
        Order.mapInput(Order.String, (claim: Claim<Value, Scope>) => claim.id),
      ),
    ),
  )

  const targetOf = (reference: PersonClaim<Value, Scope>, targetId: ClaimId | null) =>
    EffectArray.findFirst(
      claims,
      (target) => target.id === targetId && mayReference(reference, target),
    ).pipe(Option.map((target) => target.id))

  const { retracted, superseded } = EffectArray.reduce(
    newestFirst,
    {
      retracted: EffectArray.empty<ClaimId>(),
      superseded: EffectArray.empty<ClaimId>(),
    },
    (state, claim) => {
      if (!isPersonClaim(claim) || !isLive(claim) || state.retracted.includes(claim.id)) {
        return state
      }

      return "retracts" in claim.change
        ? {
            ...state,
            retracted: [
              ...state.retracted,
              ...Option.toArray(targetOf(claim, claim.change.retracts)),
            ],
          }
        : {
            ...state,
            superseded: [
              ...state.superseded,
              ...Option.toArray(targetOf(claim, claim.change.supersedes)),
            ],
          }
    },
  )

  const asserting = claims.filter(
    (claim) =>
      isLive(claim) &&
      !retracted.includes(claim.id) &&
      !superseded.includes(claim.id) &&
      !(isPersonClaim(claim) && "retracts" in claim.change),
  )

  // A machine translation lives only as long as the claim it translates.
  return asserting.filter(
    (claim) =>
      isPersonClaim(claim) ||
      !AutomaticSource.guards.MACHINE_TRANSLATION(claim.source) ||
      asserting.some(
        (other) =>
          AutomaticSource.guards.MACHINE_TRANSLATION(claim.source) &&
          other.id === claim.source.translatedFrom,
      ),
  )
}

/** The value a claim asserts, if it asserts one. */
export const assertedValue = <Value, Scope extends PropertyScope>(
  claim: Claim<Value, Scope>,
): Option.Option<Value> =>
  isPersonClaim(claim)
    ? "value" in claim.change
      ? Option.some(claim.change.value)
      : Option.none()
    : Option.some(claim.value)

/**
 * The claims asserting a value readers may see, with it. Claims from a source the property no
 * longer lists are left out: they'd otherwise rank above every listed source, and they wait for a
 * migration to decide what they become (see the implementation plan on versioning).
 */
export const liveAssertions = <Value, Scope extends PropertyScope>({
  property,
  claims,
}: {
  readonly property: Pick<ResolutionSpec<Value>, "sources">
  readonly claims: ReadonlyArray<Claim<Value, Scope>>
}) =>
  visibleClaims(claims).flatMap((claim) =>
    property.sources.includes(claimSourceKey(claim))
      ? Option.toArray(Option.map(assertedValue(claim), (value) => ({ claim, value })))
      : [],
  )

interface Group<Value, Scope extends PropertyScope> {
  readonly value: Value
  /** Best-ranked first. */
  readonly claims: NonEmptyReadonlyArray<Claim<Value, Scope>>
}

export const resolve = <Value, Scope extends PropertyScope>({
  property,
  claims,
  language,
  endorsements = [],
}: {
  readonly property: ResolutionSpec<Value>
  /** Every claim of the property about the article, in every language. */
  readonly claims: ReadonlyArray<Claim<Value, Scope>>
  readonly language: LanguageOf<Scope>
  readonly endorsements?: ReadonlyArray<Endorsement>
}): ReadonlyArray<ResolvedValue<Value>> => {
  const equivalent = Schema.toEquivalence(property.value)
  const sourceRank = (claim: Claim<Value, Scope>) => property.sources.indexOf(claimSourceKey(claim))

  // Rank, then newest, then ID: never the claims' order.
  const claimOrder = Order.combineAll([
    Order.mapInput(Order.Number, sourceRank),
    Order.flip(
      Order.mapInput(Order.Number, (claim: Claim<Value, Scope>) =>
        DateTime.toEpochMillis(claim.createdAt),
      ),
    ),
    Order.mapInput(Order.String, (claim: Claim<Value, Scope>) => claim.id),
  ])

  const assertions = EffectArray.sort(
    liveAssertions({ property, claims }).filter(({ claim }) => claim.language === language),
    Order.mapInput(claimOrder, ({ claim }: { readonly claim: Claim<Value, Scope> }) => claim),
  )

  // Assertions are sorted, so each group's first claim is its best-ranked, and its value the one shown.
  const groups = EffectArray.reduce(
    assertions,
    EffectArray.empty<Group<Value, Scope>>(),
    (accumulated, { claim, value }) =>
      EffectArray.findFirstIndex(accumulated, (group) => equivalent(group.value, value)).pipe(
        Option.flatMap((index) =>
          EffectArray.modify(accumulated, index, (group) => ({
            ...group,
            claims: EffectArray.append(group.claims, claim),
          })),
        ),
        Option.getOrElse(() =>
          EffectArray.append(accumulated, { value, claims: EffectArray.of(claim) }),
        ),
      ),
  )

  // People order a list; values only other sources assert follow, in source order.
  const listPosition = (group: Group<Value, Scope>) =>
    EffectArray.head(
      EffectArray.sort(
        group.claims.flatMap((claim) =>
          isPersonClaim(claim) && "position" in claim.change && claim.change.position !== null
            ? [claim.change.position]
            : [],
        ),
        Order.String,
      ),
    )

  const ordered = EffectArray.sort(
    groups,
    Order.combineAll([
      // Values people placed first, by position; then the rest.
      Order.mapInput(Order.Boolean, (group: Group<Value, Scope>) =>
        property.cardinality === "LIST" ? Option.isNone(listPosition(group)) : false,
      ),
      Order.mapInput(Order.String, (group: Group<Value, Scope>) =>
        property.cardinality === "LIST" ? Option.getOrElse(listPosition(group), () => "") : "",
      ),
      Order.mapInput(claimOrder, (group: Group<Value, Scope>) => group.claims[0]),
    ]),
  )

  const bestRank = (group: Group<Value, Scope>) => sourceRank(group.claims[0])

  const kept =
    property.cardinality === "ONE"
      ? ordered.slice(0, 1)
      : (property.mergeStrategy ?? "ALL_SOURCES") === "ALL_SOURCES"
        ? ordered
        : EffectArray.head(ordered).pipe(
            Option.map(bestRank),
            Option.match({
              onNone: () => [],
              onSome: (rank) => ordered.filter((group) => bestRank(group) === rank),
            }),
          )

  const confirmedBy = (group: Group<Value, Scope>) => {
    const claimIds = group.claims.map((claim) => claim.id)
    const authors = group.claims.flatMap((claim): ReadonlyArray<PersonId> =>
      isPersonClaim(claim) && claim.source.authorId !== null ? [claim.source.authorId] : [],
    )
    const endorsers = endorsements
      .filter((endorsement) => claimIds.includes(endorsement.claimId))
      .map((endorsement) => endorsement.personId)

    return EffectArray.dedupe([...authors, ...endorsers]).length
  }

  return kept.map((group) => ({
    value: group.value,
    attestations: EffectArray.map(group.claims, (claim) => ({
      claimId: claim.id,
      source: claimSourceKey(claim),
      inheritedFrom: null,
    })),
    confirmedBy: confirmedBy(group),
  }))
}

/** Whether the property shows any value about the article, in any language. */
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
 * A cultivar inheriting a trait shows its plant's values, attested by the plant's claims. It runs
 * when the cultivar is read, so the plant's changes show without copying anything. It's exclusive,
 * as `CultivarProperty`'s `Inherit` is today: inheriting and having values of its own are
 * different statements, and the edit form offers one or the other.
 */
export const inheritFromParent = <Value>({
  own,
  parent,
  parentId,
  inherits,
}: {
  readonly own: ReadonlyArray<ResolvedValue<Value>>
  readonly parent: ReadonlyArray<ResolvedValue<Value>>
  readonly parentId: WikiArticleId
  readonly inherits: boolean
}): ReadonlyArray<ResolvedValue<Value>> =>
  inherits
    ? parent.map((resolved) => ({
        ...resolved,
        attestations: EffectArray.map(resolved.attestations, (attestation) => ({
          ...attestation,
          inheritedFrom: parentId,
        })),
      }))
    : own
