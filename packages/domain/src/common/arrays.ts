import { Array as EffectArray, Option } from "effect"
import type { NonEmptyReadonlyArray } from "effect/Array"
import type { Equivalence } from "effect/Equivalence"

export interface EquivalentGroup<A, Key> {
  /** The key of the group's first item. */
  readonly key: Key
  readonly items: NonEmptyReadonlyArray<A>
}

/**
 * Items grouped by keys an equivalence says are the same, unlike `EffectArray.groupBy`'s string keys:
 * "Guamo" and "guamo" under a case-folding equivalence. Groups come in the order of their first
 * item, and items keep their order within a group, so sorting the input first decides which item
 * leads each group.
 */
export const groupByEquivalentKey = <A, Key>({
  items,
  keyOf,
  isEquivalent,
}: {
  readonly items: ReadonlyArray<A>
  readonly keyOf: (item: A) => Key
  readonly isEquivalent: Equivalence<Key>
}): ReadonlyArray<EquivalentGroup<A, Key>> =>
  EffectArray.reduce(items, EffectArray.empty<EquivalentGroup<A, Key>>(), (groups, item) => {
    const key = keyOf(item)

    return EffectArray.findFirstIndex(groups, (group) => isEquivalent(group.key, key)).pipe(
      Option.flatMap((index) =>
        EffectArray.modify(groups, index, (group) => ({
          ...group,
          items: EffectArray.append(group.items, item),
        })),
      ),
      Option.getOrElse(() => EffectArray.append(groups, { key, items: EffectArray.of(item) })),
    )
  })
