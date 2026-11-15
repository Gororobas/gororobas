/**
 * What readers see of a situated property: a **summary** tallied from every claim, never a winner.
 * Days to harvest, strata, edible parts and names have as many right answers as there are people
 * growing, eating and naming. Agreeing is making the same claim; disagreeing is making another.
 *
 * A claim's value is what its author gave: one growth rate, the set of strata they saw, the range
 * of days they waited. Each property says how its values are tallied (`summary` in
 * `defineSituatedProperty`): whole, member by member, or combined into one range.
 *
 * Counting people, not claims: Joana writing in five posts that carrots took 110 days, and saying
 * so on the article, is one person behind "110 days". Sources a property lists are shown by name
 * ("Baixo · 3 pessoas e Syntropedia") and never added to the count.
 *
 * The server leaves out, before summarizing, the inferred claims of people who've lost community
 * access: inference only runs on people writing in good faith.
 */
import { Array as EffectArray, DateTime, HashSet, Option, Order, Schema } from "effect"
import type { NonEmptyReadonlyArray } from "effect/Array"
import type { Equivalence } from "effect/Equivalence"

import { groupByEquivalentKey } from "../common/arrays.js"
import type { RangeWithOptionalEnds } from "../common/primitives.js"
import { mean, tukeyFences } from "../common/statistics.js"
import {
  type LanguageOf,
  type PeopleSummary,
  type PropertyScope,
  type SituatedClaim,
  isSituatedPersonClaim,
  isVisibleModerationStatus,
  oldestClaimFirst,
  situatedSourceKeyOf,
  summarizeAuthors,
} from "./claims.js"
import type { ClaimId, ProvenanceSourceKey } from "./provenance.js"
import type { Provider } from "./providers/index.js"

/** Who's behind any part of a summary: the count the page always shows. */
interface Backing {
  /** Distinct people. */
  readonly people: PeopleSummary
  /** Providers, by name: never added to the count of people. */
  readonly sources: ReadonlyArray<Provider>
}

/** One value, as readers see it in a summary: "Baixo · 3 pessoas e Syntropedia". */
export interface SituatedValue<Value> extends Backing {
  /** As the newest claim stating it spells it, when equivalent values differ ("Guamo", "guamo"). */
  readonly value: Value
  readonly claimIds: NonEmptyReadonlyArray<ClaimId>
  readonly latestAt: DateTime.Utc
}

/** Values tallied one by one: chips, most people first. */
export interface ValuesSummary<Value> extends Backing {
  /** Most people first, then most sources, then most recently claimed. */
  readonly values: ReadonlyArray<SituatedValue<Value>>
}

/** Ranges combined into one: "60 a 80 dias · 5 pessoas". */
export interface RangeSummary<Bound> extends Backing {
  /**
   * From the lowest end to the highest end of every claim counted. It has a minimum when some
   * claim gives one, and a maximum likewise, so "até 3 m" stays open below. None when no claim
   * counts.
   */
  readonly range: Option.Option<RangeWithOptionalEnds<Bound>>
  /** People's claims too far from the rest to count, listed so the page can say so. */
  readonly leftOutClaimIds: ReadonlyArray<ClaimId>
}

/** Claims in the summary: visible, in the reader's language, from listed sources, newest first. */
type CountedClaims<Value> = ReadonlyArray<SituatedClaim<Value, PropertyScope>>

/** How a situated property tallies its claims into what readers see. */
export interface SummaryStrategy<Value, Summary> {
  readonly tally: (claims: CountedClaims<Value>) => Summary
}

const backingOf = <Value>(claims: CountedClaims<Value>): Backing => ({
  people: summarizeAuthors(claims.filter(isSituatedPersonClaim)),
  sources: EffectArray.dedupe(
    claims.flatMap((claim) => (isSituatedPersonClaim(claim) ? [] : [claim.provenance.provider])),
  ),
})

const valuesOrder = <Value>() =>
  Order.combineAll([
    Order.flip(
      Order.mapInput(Order.Number, (value: SituatedValue<Value>) => value.people.totalCount),
    ),
    Order.flip(Order.mapInput(Order.Number, (value: SituatedValue<Value>) => value.sources.length)),
    Order.flip(
      Order.mapInput(Order.Number, (value: SituatedValue<Value>) =>
        DateTime.toEpochMillis(value.latestAt),
      ),
    ),
    Order.mapInput(Order.String, (value: SituatedValue<Value>) => value.claimIds[0]),
  ])

/** Each claim's units (its value, or its members), grouped by equivalent unit. */
const tallyUnits = <Value, Unit>({
  claims,
  unitsOf,
  isSameUnit,
}: {
  readonly claims: CountedClaims<Value>
  readonly unitsOf: (value: Value) => ReadonlyArray<Unit>
  readonly isSameUnit: Equivalence<Unit>
}): ValuesSummary<Unit> => {
  const units = claims.flatMap((claim) => unitsOf(claim.value).map((unit) => ({ unit, claim })))

  // Claims come newest first, so each group's first claim is its newest, and its spelling the one shown.
  const values = groupByEquivalentKey({
    items: units,
    keyOf: ({ unit }) => unit,
    isEquivalent: isSameUnit,
  }).map(({ key, items }): SituatedValue<Unit> => {
    const groupClaims = EffectArray.map(items, ({ claim }) => claim)

    return {
      value: key,
      ...backingOf(groupClaims),
      claimIds: EffectArray.map(groupClaims, (claim) => claim.id),
      latestAt: groupClaims[0].createdAt,
    }
  })

  return { values: EffectArray.sort(values, valuesOrder<Unit>()), ...backingOf(claims) }
}

/**
 * Below this many people's claims, none is far enough from the rest to tell: quartiles of three
 * numbers are mostly the numbers themselves.
 */
export const MIN_CLAIMS_FOR_OUTLIERS = 4

const endsOf = <Bound>(range: RangeWithOptionalEnds<Bound>): ReadonlyArray<Bound> => [
  ...(range.min === undefined ? [] : [range.min]),
  ...(range.max === undefined ? [] : [range.max]),
]

const tallyRanges = <Bound>(
  claims: CountedClaims<RangeWithOptionalEnds<Bound>>,
  magnitude: (bound: Bound) => number,
): RangeSummary<Bound> => {
  const midpointOf = (range: RangeWithOptionalEnds<Bound>) =>
    EffectArray.match(endsOf(range).map(magnitude), { onEmpty: () => 0, onNonEmpty: mean })

  const personClaims = claims.filter(isSituatedPersonClaim)

  /**
   * People's claims whose midpoint is outside Tukey's fences around everyone's midpoints
   * (`tukeyFences`). Providers' values are never left out: a source is one voice the property
   * chose to list, not a reading among many.
   */
  const isFarOff = EffectArray.match(
    personClaims.map((claim) => midpointOf(claim.value)),
    {
      onEmpty: () => () => false,
      onNonEmpty: (midpoints) => {
        if (midpoints.length < MIN_CLAIMS_FOR_OUTLIERS) return () => false
        const { lower, upper } = tukeyFences(midpoints)
        return (midpoint: number) => midpoint < lower || midpoint > upper
      },
    },
  )

  const leftOutClaimIds = personClaims
    .filter((claim) => isFarOff(midpointOf(claim.value)))
    .map((claim) => claim.id)
  const kept = claims.filter((claim) => !leftOutClaimIds.includes(claim.id))

  const byMagnitude = Order.mapInput(Order.Number, magnitude)
  const ends = kept.flatMap((claim) => endsOf(claim.value))
  const hasMin = kept.some((claim) => claim.value.min !== undefined)
  const hasMax = kept.some((claim) => claim.value.max !== undefined)

  return {
    range: EffectArray.match(ends, {
      onEmpty: () => Option.none(),
      onNonEmpty: (all) =>
        Option.some({
          ...(hasMin ? { min: EffectArray.min(all, byMagnitude) } : {}),
          ...(hasMax ? { max: EffectArray.max(all, byMagnitude) } : {}),
        }),
    }),
    leftOutClaimIds,
    ...backingOf(claims),
  }
}

export interface SummaryBuilder<Value> {
  /** Each claim's value tallied as given: a growth rate, a name, a cultivation experience. */
  readonly wholeValues: () => SummaryStrategy<Value, ValuesSummary<Value>>
  /**
   * Each member of a set tallied on its own: "Baixo · 3 pessoas", whatever else each of them
   * listed. The member schema must be the set's, or the strategy won't fit the property.
   */
  readonly eachMember: <Member>(
    member: Schema.Schema<Member>,
  ) => SummaryStrategy<HashSet.HashSet<Member>, ValuesSummary<Member>>
  /**
   * Ranges combined into one, leaving out people's far-off claims. `magnitude` places a bound on
   * a line (a length in centimeters), to compare bounds and find the far-off.
   */
  readonly range: <Bound>(
    magnitude: (bound: Bound) => number,
  ) => SummaryStrategy<RangeWithOptionalEnds<Bound>, RangeSummary<Bound>>
}

export const makeSummaryBuilder = <Value>(
  valueSchema: Schema.Schema<Value>,
): SummaryBuilder<Value> => ({
  wholeValues: () => ({
    tally: (claims) =>
      tallyUnits({
        claims,
        unitsOf: EffectArray.of,
        isSameUnit: Schema.toEquivalence(valueSchema),
      }),
  }),
  eachMember: (member) => ({
    tally: (claims) =>
      tallyUnits({
        claims,
        unitsOf: EffectArray.fromIterable,
        isSameUnit: Schema.toEquivalence(member),
      }),
  }),
  range: (magnitude) => ({ tally: (claims) => tallyRanges(claims, magnitude) }),
})

/**
 * Every visible claim of a situated property, in the reader's language, tallied. A pure function
 * of the claims, so it doesn't depend on their order.
 */
export const summarize = <Value, Scope extends PropertyScope, Summary>({
  property,
  claims,
  language,
}: {
  readonly property: {
    readonly sourceKeys: ReadonlyArray<ProvenanceSourceKey>
    readonly summary: SummaryStrategy<Value, Summary>
  }
  readonly claims: ReadonlyArray<SituatedClaim<Value, Scope>>
  readonly language: LanguageOf<Scope>
}): Summary =>
  property.summary.tally(
    EffectArray.sort(
      claims.filter(
        (claim) =>
          claim.language === language &&
          isVisibleModerationStatus(claim.moderationStatus) &&
          property.sourceKeys.includes(situatedSourceKeyOf(claim)),
      ),
      Order.flip(oldestClaimFirst),
    ),
  )
