/**
 * The one rule turning an article's claims into what readers see. It runs on the server after any
 * claim about the article changes, and its output is materialized for search and pages, as
 * projections are today. Readers only ever see resolved values and their attestations: claims,
 * statuses and evidence stay behind this module.
 */
import { Array as EffectArray, DateTime, Equivalence, Option, Order, Schema } from "effect"
import type { NonEmptyReadonlyArray } from "effect/Array"

import type { WikiArticleId } from "../common/ids.js"
import {
  type Claim,
  Evaluation,
  type PropertyScope,
  type LanguageOf,
  claimSourceKey,
  isVisibleModerationStatus,
} from "./claims.js"
import type { ClaimId, SourceKey } from "./sources.js"

/** Who stands behind a value, as readers see it: enough for a badge, a link and a flag button. */
export interface Attestation {
  readonly claimId: ClaimId
  readonly source: SourceKey
  /** Set when a cultivar shows its plant's value (see `inheritFromParent`). */
  readonly inheritedFrom: WikiArticleId | null
}

export interface ResolvedValue<Value> {
  readonly value: Value
  readonly attestations: NonEmptyReadonlyArray<Attestation>
}

/** The part of a property resolution reads. */
export type ResolutionSpec<Value> = {
  readonly value: Schema.Schema<Value>
  readonly sources: ReadonlyArray<SourceKey>
  readonly sameValue?: Equivalence.Equivalence<Value>
} & (
  | { readonly cardinality: "ONE" }
  | {
      readonly cardinality: "SET"
      readonly mergeStrategy: "ALL_SOURCES" | "FIRST_SOURCE_WITH_VALUES"
    }
)

export const sameValueOf = <Value>(property: {
  readonly value: Schema.Schema<Value>
  readonly sameValue?: Equivalence.Equivalence<Value>
}) => property.sameValue ?? Schema.toEquivalence(property.value)

const isLive = <Value, Scope extends PropertyScope>(claim: Claim<Value, Scope>) =>
  "moderationStatus" in claim
    ? isVisibleModerationStatus(claim.moderationStatus)
    : Evaluation.guards.APPROVED(claim.evaluation)

/** The value a claim asserts, if it asserts one. */
export const assertedValue = <Value, Scope extends PropertyScope>(
  claim: Claim<Value, Scope>,
): Option.Option<Value> =>
  "change" in claim
    ? "value" in claim.change
      ? Option.some(claim.change.value)
      : Option.none()
    : Option.some(claim.value)

/** Claims hidden by approved people's claims superseding or retracting them. */
const replacedClaims = <Value, Scope extends PropertyScope>(
  claims: ReadonlyArray<Claim<Value, Scope>>,
): ReadonlyArray<ClaimId> =>
  claims.flatMap((claim) => {
    if (!("change" in claim) || !isLive(claim)) return []
    if ("retracts" in claim.change) return [claim.change.retracts]
    return claim.change.supersedes === null ? [] : [claim.change.supersedes]
  })

/** The claims still asserting a value, with it: approved or visible, and not replaced. */
export const liveAssertions = <Value, Scope extends PropertyScope>(
  claims: ReadonlyArray<Claim<Value, Scope>>,
) => {
  const replaced = replacedClaims(claims)

  return claims.flatMap((claim) =>
    isLive(claim) && !replaced.includes(claim.id)
      ? Option.toArray(Option.map(assertedValue(claim), (value) => ({ claim, value })))
      : [],
  )
}

interface Group<Value, Scope extends PropertyScope> {
  readonly value: Value
  readonly claims: NonEmptyReadonlyArray<Claim<Value, Scope>>
}

export const resolve = <Value, Scope extends PropertyScope>({
  property,
  claims,
  language,
}: {
  readonly property: ResolutionSpec<Value>
  readonly claims: ReadonlyArray<Claim<Value, Scope>>
  readonly language: LanguageOf<Scope>
}): ReadonlyArray<ResolvedValue<Value>> => {
  const sameValue = sameValueOf(property)
  const sourceRank = (claim: Claim<Value, Scope>) => property.sources.indexOf(claimSourceKey(claim))

  const inLanguage = liveAssertions(claims).filter(({ claim }) => claim.language === language)

  const groups = EffectArray.reduce(
    inLanguage,
    EffectArray.empty<Group<Value, Scope>>(),
    (accumulated, { claim, value }) =>
      EffectArray.findFirstIndex(accumulated, (group) => sameValue(group.value, value)).pipe(
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

  const best = (rank: (claim: Claim<Value, Scope>) => number) => (group: Group<Value, Scope>) =>
    Math.min(...group.claims.map(rank))
  const newest = (group: Group<Value, Scope>) =>
    Math.max(...group.claims.map((claim) => DateTime.toEpochMillis(claim.createdAt)))

  const ordered = EffectArray.sort(
    groups,
    Order.combineAll([
      Order.mapInput(Order.Number, best(sourceRank)),
      Order.flip(Order.mapInput(Order.Number, newest)),
    ]),
  )

  const kept =
    property.cardinality === "ONE"
      ? ordered.slice(0, 1)
      : property.mergeStrategy === "ALL_SOURCES"
        ? ordered
        : EffectArray.head(ordered).pipe(
            Option.map(best(sourceRank)),
            Option.match({
              onNone: () => [],
              onSome: (rank) => ordered.filter((group) => best(sourceRank)(group) === rank),
            }),
          )

  return kept.map((group) => ({
    value: group.value,
    attestations: EffectArray.map(group.claims, (claim) => ({
      claimId: claim.id,
      source: claimSourceKey(claim),
      inheritedFrom: null,
    })),
  }))
}

/**
 * A cultivar inheriting a trait shows its plant's values, attested by the plant's claims. It's
 * exclusive, as `CultivarProperty`'s `Inherit` is today: inheriting and having values of its own
 * are different statements, and the edit form offers one or the other.
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

/**
 * Whether an automatic source should (re)assert a value on its next run. A value people censored
 * from that source stays censored, which today's delete-and-reinsert persistence can't express.
 */
export const shouldAssert = <Value, Scope extends PropertyScope>({
  property,
  existing,
  candidate,
}: {
  readonly property: ResolutionSpec<Value>
  readonly existing: ReadonlyArray<Claim<Value, Scope>>
  readonly candidate: { readonly source: SourceKey; readonly value: Value }
}) => {
  const sameValue = sameValueOf(property)

  return !existing.some(
    (claim) =>
      "moderationStatus" in claim &&
      claim.moderationStatus === "CENSORED" &&
      claimSourceKey(claim) === candidate.source &&
      sameValue(claim.value, candidate.value),
  )
}
