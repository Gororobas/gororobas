import { Array as EffectArray, Order } from "effect"
import type { NonEmptyReadonlyArray } from "effect/Array"

export const mean = (values: NonEmptyReadonlyArray<number>) =>
  values.reduce((sum, value) => sum + value, 0) / values.length

/**
 * The value below which a fraction `q` (0 to 1) of `sorted` falls, interpolating linearly between
 * the two nearest values: definition 7 in Hyndman and Fan's "Sample Quantiles in Statistical
 * Packages" (1996), the default in R, NumPy and spreadsheets, so the numbers match what people
 * get from their own tools.
 */
export const quantile = (sorted: NonEmptyReadonlyArray<number>, q: number) => {
  const position = (sorted.length - 1) * Math.min(Math.max(q, 0), 1)
  const lower = Math.floor(position)
  const below = sorted[lower] ?? sorted[0]
  const above = sorted[Math.min(lower + 1, sorted.length - 1)] ?? below
  return below + (above - below) * (position - lower)
}

/** The conventional multiplier for outliers; Tukey called values beyond 3 "far out". */
export const TUKEY_OUTLIER_MULTIPLIER = 1.5

/**
 * Tukey's fences (John Tukey, "Exploratory Data Analysis", 1977): values more than `multiplier`
 * interquartile ranges below the first quartile or above the third are outliers. It rests on
 * quartiles rather than the mean, so the outliers it finds don't drag the fences towards them.
 */
export const tukeyFences = (
  values: NonEmptyReadonlyArray<number>,
  multiplier = TUKEY_OUTLIER_MULTIPLIER,
) => {
  const sorted = EffectArray.sort(values, Order.Number)
  const firstQuartile = quantile(sorted, 0.25)
  const thirdQuartile = quantile(sorted, 0.75)
  const reach = multiplier * (thirdQuartile - firstQuartile)

  return { lower: firstQuartile - reach, upper: thirdQuartile + reach }
}
