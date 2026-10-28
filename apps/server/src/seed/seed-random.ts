/**
 * Helpers over Effect's `Random` service. Seeding runs under `Random.withSeed`, so every
 * draw here is reproducible from the seed alone, as long as draws happen in a fixed order:
 * seeding iterates with `{ concurrency: 1 }` throughout.
 */
import { Array as EffectArray, Effect, Random } from "effect"

const NANO_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-"

export const chance = (probability: number) =>
  Effect.map(Random.next, (value) => value < probability)

export const pick = <A>(items: EffectArray.NonEmptyReadonlyArray<A>) =>
  Effect.map(Random.nextIntBetween(0, items.length - 1), (index) => items[index] ?? items[0])

/** Picks from a list that may be empty, such as a pool of already-created rows. */
export const pickOption = <A>(items: ReadonlyArray<A>) =>
  EffectArray.isReadonlyArrayNonEmpty(items)
    ? Effect.map(pick(items), (item): A | undefined => item)
    : Effect.undefined

/** Distinct items, in random order, up to `count`. */
export const sample = <A>(items: ReadonlyArray<A>, count: number) =>
  Effect.map(Random.shuffle(items), (shuffled) => shuffled.slice(0, Math.max(0, count)))

/**
 * Picks a literal by weight. Literals missing from `weights` default to 1, so values
 * added to a domain enum are seeded without touching this module.
 */
export const pickWeighted = <A extends string>(
  literals: EffectArray.NonEmptyReadonlyArray<A>,
  weights: Partial<Record<A, number>>,
) =>
  Effect.map(Random.next, (value) => {
    const cumulative = EffectArray.scan(
      literals,
      0,
      (sum, literal) => sum + (weights[literal] ?? 1),
    )

    const threshold = value * (cumulative.at(-1) ?? 0)
    const index = cumulative.slice(1).findIndex((bound) => threshold < bound)
    return literals[index] ?? literals[0]
  })

const randomCharacters = (input: { length: number; alphabet: string }) =>
  Effect.map(
    Effect.replicateEffect(Random.nextIntBetween(0, input.alphabet.length - 1), input.length, {
      concurrency: 1,
    }),
    (indexes) => indexes.map((index) => input.alphabet[index]).join(""),
  )

/** 12-character identifier in the format Loro uses for movable list items. */
export const nanoId = randomCharacters({ length: 12, alphabet: NANO_ID_ALPHABET })

export const digits = (length: number) => randomCharacters({ length, alphabet: "0123456789" })
