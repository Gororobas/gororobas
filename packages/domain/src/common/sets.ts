import { Array as EffectArray, HashSet, Option, Schema } from "effect"

/**
 * Several values given together, in no order: the strata one person saw a plant take. An empty
 * set says nothing, so it's never a claim's value.
 */
export const NonEmptySet = <Member extends Schema.Constraint>(member: Member) =>
  Schema.HashSet(member).check(
    Schema.makeFilter((set) => HashSet.size(set) > 0 || "a set needs a value", {
      identifier: "NonEmptySet",
      title: "Non-empty set",
      description: "At least one value.",
      arbitraryConstraint: { minSize: 1 },
    }),
  )

/** The set of what a provider listed, if it listed anything. */
export const nonEmptySetOf = <Member>(
  members: ReadonlyArray<Member>,
): Option.Option<HashSet.HashSet<Member>> =>
  EffectArray.isReadonlyArrayNonEmpty(members)
    ? Option.some(HashSet.fromIterable(members))
    : Option.none()
