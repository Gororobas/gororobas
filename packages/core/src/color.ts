import type { Value } from './var.ts'

/** A color space `color-mix()` can interpolate in. */
export type MixSpace =
  | 'oklab'
  | 'oklch'
  | 'srgb'
  | 'srgb-linear'
  | 'display-p3'
  | 'lab'
  | 'lch'

/** `color-mix(in <space>, base, other <amount>%)`: `amount` percent of `other` mixed into `base`.
 *
 *  Like every helper here, it compiles to a CSS color function rather than computing a color
 *  in JavaScript, so it works on tokens and still holds after a theme swaps their values. */
export const mix = (
  base: Value,
  other: Value,
  amount: number,
  space: MixSpace = 'oklab',
): string => `color-mix(in ${space}, ${String(base)}, ${String(other)} ${amount}%)`

/** The color with its alpha set to `alpha` (0 to 1), using relative color syntax. */
export const alpha = (color: Value, alpha: number): string =>
  `oklch(from ${String(color)} l c h / ${alpha})`

/** The color with OKLCH lightness raised by `amount` (0 to 1). */
export const lighten = (color: Value, amount: number): string =>
  `oklch(from ${String(color)} calc(l + ${amount}) c h)`

/** The color with OKLCH lightness lowered by `amount` (0 to 1). */
export const darken = (color: Value, amount: number): string =>
  `oklch(from ${String(color)} calc(l - ${amount}) c h)`

/** The color with OKLCH chroma multiplied by `factor`. */
export const saturate = (color: Value, factor: number): string =>
  `oklch(from ${String(color)} l calc(c * ${factor}) h)`

/** The color with its OKLCH hue rotated by `degrees`. */
export const rotate = (color: Value, degrees: number): string =>
  `oklch(from ${String(color)} l c calc(h + ${degrees}))`
