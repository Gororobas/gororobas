/**
 * What the edit form sends: a draft per property, in one language. The form never builds claims;
 * the server diffs drafts against the live claims into a person's changes. People edit values
 * people asserted; values from other sources are read-only in the form, with a flag button.
 */
import { Array as EffectArray, Option } from "effect"

import type { Claim, LanguageOf, PropertyScope } from "./claims.js"
import { liveAssertions, sameValueOf, type ResolutionSpec } from "./resolution.js"
import type { ClaimId } from "./sources.js"

export type PersonChange<Value> =
  | { readonly _tag: "ASSERT"; readonly value: Value; readonly supersedes: ClaimId | null }
  | { readonly _tag: "RETRACT"; readonly retracts: ClaimId }

const assertionsIn = <Value, Scope extends PropertyScope>(
  claims: ReadonlyArray<Claim<Value, Scope>>,
  language: LanguageOf<Scope>,
) => liveAssertions(claims).filter(({ claim }) => claim.language === language)

const byPeople = <Value, Scope extends PropertyScope>(
  assertions: ReturnType<typeof assertionsIn<Value, Scope>>,
) => assertions.filter(({ claim }) => "change" in claim)

/** For `ONE` properties: `None` clears the value people gave. */
export const proposeChangesToOne = <Value, Scope extends PropertyScope>({
  property,
  claims,
  language,
  draft,
}: {
  readonly property: ResolutionSpec<Value>
  readonly claims: ReadonlyArray<Claim<Value, Scope>>
  readonly language: LanguageOf<Scope>
  readonly draft: Option.Option<Value>
}): ReadonlyArray<PersonChange<Value>> => {
  const sameValue = sameValueOf(property)
  const asserted = assertionsIn(claims, language)
  const current = EffectArray.head(byPeople(asserted))

  return Option.match(draft, {
    onNone: () =>
      Option.toArray(
        Option.map(current, ({ claim }) => ({ _tag: "RETRACT" as const, retracts: claim.id })),
      ),
    onSome: (value) =>
      asserted.some((assertion) => sameValue(assertion.value, value))
        ? []
        : [
            {
              _tag: "ASSERT" as const,
              value,
              supersedes: Option.getOrNull(Option.map(current, ({ claim }) => claim.id)),
            },
          ],
  })
}

/** For `SET` properties: the draft lists every value the person wants people to assert. */
export const proposeChangesToSet = <Value, Scope extends PropertyScope>({
  property,
  claims,
  language,
  draft,
}: {
  readonly property: ResolutionSpec<Value>
  readonly claims: ReadonlyArray<Claim<Value, Scope>>
  readonly language: LanguageOf<Scope>
  readonly draft: ReadonlyArray<Value>
}): ReadonlyArray<PersonChange<Value>> => {
  const sameValue = sameValueOf(property)
  const asserted = assertionsIn(claims, language)

  const added = draft
    .filter((value) => !asserted.some((assertion) => sameValue(assertion.value, value)))
    .map((value) => ({ _tag: "ASSERT" as const, value, supersedes: null }))

  const removed = byPeople(asserted)
    .filter((assertion) => !draft.some((value) => sameValue(assertion.value, value)))
    .map(({ claim }) => ({ _tag: "RETRACT" as const, retracts: claim.id }))

  return [...added, ...removed]
}
