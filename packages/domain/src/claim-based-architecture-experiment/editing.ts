/**
 * What the edit form sends: per property and language, the people's claims it showed (by ID) and
 * the draft the person left. The form never builds claims; the server diffs the draft against the
 * claims it showed, never against claims approved since, into a person's changes.
 *
 * Values from other sources are read-only in the form, with "confirm" (an endorsement) and
 * "dispute" buttons. A draft that includes a value only a machine asserts is the person asserting
 * it too: their claim then attests the value and stays if the machine's claim is censored.
 *
 * Wiki data isn't edited offline, but a form can still go stale (another tab, a long session).
 * When a claim it showed no longer shows, the diff reports it instead of guessing.
 */
import { Array as EffectArray, Option, Schema } from "effect"

import type { Claim, LanguageOf, PersonClaim, PropertyScope } from "./claims.js"
import { type ResolutionSpec, liveAssertions } from "./resolution.js"
import type { ClaimId } from "./sources.js"
import { type FractionalIndex, keyBetween } from "./values/fractional-index.js"

export type PersonChange<Value> =
  | {
      readonly _tag: "ASSERT"
      readonly value: Value
      readonly supersedes: ClaimId | null
      /** For `LIST` properties: where the person put the value. */
      readonly position: FractionalIndex | null
    }
  | { readonly _tag: "RETRACT"; readonly retracts: ClaimId }

export type DraftDiff<Value> =
  | { readonly _tag: "CHANGES"; readonly changes: ReadonlyArray<PersonChange<Value>> }
  /** Claims the form showed that no longer show: the form reloads before saving. */
  | { readonly _tag: "STALE"; readonly claimIds: ReadonlyArray<ClaimId> }

interface ShownAssertion<Value, Scope extends PropertyScope> {
  readonly claim: PersonClaim<Value, Scope>
  readonly value: Value
}

/** The people's claims the form showed, if they all still show. */
const shownAssertions = <Value, Scope extends PropertyScope>({
  property,
  claims,
  language,
  shown,
}: {
  readonly property: ResolutionSpec<Value>
  readonly claims: ReadonlyArray<Claim<Value, Scope>>
  readonly language: LanguageOf<Scope>
  readonly shown: ReadonlyArray<ClaimId>
}): Option.Option<ReadonlyArray<ShownAssertion<Value, Scope>>> => {
  const visible = liveAssertions({ property, claims }).flatMap(({ claim, value }) =>
    "change" in claim && claim.language === language && shown.includes(claim.id)
      ? [{ claim, value }]
      : [],
  )

  return visible.length === shown.length ? Option.some(visible) : Option.none()
}

const staleClaims = <Value, Scope extends PropertyScope>({
  property,
  claims,
  shown,
}: {
  readonly property: ResolutionSpec<Value>
  readonly claims: ReadonlyArray<Claim<Value, Scope>>
  readonly shown: ReadonlyArray<ClaimId>
}): DraftDiff<Value> => {
  const visible = liveAssertions({ property, claims }).map(({ claim }) => claim.id)
  return { _tag: "STALE", claimIds: shown.filter((claimId) => !visible.includes(claimId)) }
}

/** For `ONE` properties: `None` clears the person's value the form showed. */
export const diffOneDraft = <Value, Scope extends PropertyScope>({
  property,
  claims,
  language,
  shown,
  draft,
}: {
  readonly property: ResolutionSpec<Value>
  readonly claims: ReadonlyArray<Claim<Value, Scope>>
  readonly language: LanguageOf<Scope>
  readonly shown: Option.Option<ClaimId>
  readonly draft: Option.Option<Value>
}): DraftDiff<Value> => {
  const shownIds = Option.toArray(shown)
  const equivalent = Schema.toEquivalence(property.value)

  return Option.match(shownAssertions({ property, claims, language, shown: shownIds }), {
    onNone: () => staleClaims({ property, claims, shown: shownIds }),
    onSome: ([current]) =>
      Option.match(draft, {
        onNone: () => ({
          _tag: "CHANGES",
          changes: current === undefined ? [] : [{ _tag: "RETRACT", retracts: current.claim.id }],
        }),
        onSome: (value) => ({
          _tag: "CHANGES",
          changes:
            current !== undefined && equivalent(current.value, value)
              ? []
              : [
                  {
                    _tag: "ASSERT",
                    value,
                    supersedes: current === undefined ? null : current.claim.id,
                    position: null,
                  },
                ],
        }),
      }),
  })
}

/**
 * For `SET` and `LIST` properties: the draft lists the values the person wants, in order for a
 * list. Moving a value in a list supersedes its claim with one at a new fractional position.
 */
export const diffManyDraft = <Value, Scope extends PropertyScope>({
  property,
  claims,
  language,
  shown,
  draft,
}: {
  readonly property: ResolutionSpec<Value>
  readonly claims: ReadonlyArray<Claim<Value, Scope>>
  readonly language: LanguageOf<Scope>
  readonly shown: ReadonlyArray<ClaimId>
  readonly draft: ReadonlyArray<Value>
}): DraftDiff<Value> => {
  const equivalent = Schema.toEquivalence(property.value)
  const isList = property.cardinality === "LIST"
  const distinctDraft = draft.filter(
    (value, index) => draft.findIndex((other) => equivalent(other, value)) === index,
  )

  return Option.match(shownAssertions({ property, claims, language, shown }), {
    onNone: () => staleClaims({ property, claims, shown }),
    onSome: (assertions) => {
      const matched = distinctDraft.map((value) => ({
        value,
        match: assertions.find((assertion) => equivalent(assertion.value, value)),
      }))

      const positionOf = (assertion: ShownAssertion<Value, Scope>) =>
        "position" in assertion.claim.change
          ? Option.fromNullishOr(assertion.claim.change.position)
          : Option.none()

      /**
       * The longest run of shown claims whose positions are already in the draft's order keep
       * them, so a reorder supersedes only the claims that moved. Every other value gets a key
       * between its neighbors'.
       */
      const candidates = matched.flatMap(({ match }, index) =>
        match === undefined
          ? []
          : Option.toArray(positionOf(match)).map((position) => ({ index, position })),
      )

      type Chain = ReadonlyArray<{ readonly index: number; readonly position: FractionalIndex }>

      const longer = (self: Chain, that: Chain) => (that.length > self.length ? that : self)

      const longestInOrder = EffectArray.reduce(
        candidates,
        EffectArray.empty<Chain>(),
        (chains, candidate) => {
          const before = chains
            .filter((chain) =>
              Option.exists(
                EffectArray.last(chain),
                ({ position }) => position < candidate.position,
              ),
            )
            .reduce(longer, [])

          return [...chains, [...before, candidate]]
        },
      ).reduce(longer, [])

      const keptPositions = matched.map((_, index) =>
        EffectArray.findFirst(longestInOrder, (kept) => kept.index === index).pipe(
          Option.map(({ position }) => position),
        ),
      )

      const nextKept = (index: number) =>
        EffectArray.findFirst(keptPositions.slice(index + 1), Option.isSome).pipe(Option.flatten)

      const positions = EffectArray.reduce(
        matched.map((_, index) => index),
        {
          previous: Option.none<FractionalIndex>(),
          assigned: EffectArray.empty<FractionalIndex>(),
        },
        (state, index) => {
          const position = EffectArray.get(keptPositions, index).pipe(
            Option.flatten,
            Option.getOrElse(() => keyBetween(state.previous, nextKept(index))),
          )

          return { previous: Option.some(position), assigned: [...state.assigned, position] }
        },
      ).assigned

      const asserted = matched.flatMap(
        ({ value, match }, index): ReadonlyArray<PersonChange<Value>> => {
          const position = isList ? Option.getOrNull(EffectArray.get(positions, index)) : null

          if (match === undefined) return [{ _tag: "ASSERT", value, supersedes: null, position }]

          return Option.getOrNull(positionOf(match)) === position
            ? []
            : [{ _tag: "ASSERT", value, supersedes: match.claim.id, position }]
        },
      )

      const retracted = assertions
        .filter((assertion) => !distinctDraft.some((value) => equivalent(assertion.value, value)))
        .map(({ claim }): PersonChange<Value> => ({ _tag: "RETRACT", retracts: claim.id }))

      return { _tag: "CHANGES", changes: [...asserted, ...retracted] }
    },
  })
}
