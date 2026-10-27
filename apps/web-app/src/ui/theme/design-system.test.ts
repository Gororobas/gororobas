// oxlint-disable effect/no-unknown-parameters -- Theme values are walked reflectively: roles alias other tokens by path, which only exists at runtime.
import { describe, expect, it } from "@effect/vitest"
import { Style, Token } from "@pleat/core"
import { Array as EffectArray, Option, Predicate, Record } from "effect"

import { appButtonStyle } from "../app-button/styles"
import { appCardStyle } from "../app-card"
import { appDrawerPanelStyle } from "../app-drawer/view"
import { appTextStyle } from "../app-text"
import { emptyStateStyle } from "../styles/surfaces"
import { type Tone } from "./color-theme"
import { hortaColorTheme } from "./color-themes/horta"

// CONTRAST

const lookup = (node: unknown, key: string): Option.Option<unknown> =>
  Predicate.hasProperty(node, key) ? Option.some(node[key]) : Option.none()

const lookupPath = (root: unknown, path: ReadonlyArray<string>): Option.Option<unknown> =>
  EffectArray.reduce(path, Option.some(root), (node, key) =>
    Option.flatMap(node, (value) => lookup(value, key)),
  )

// Role values may alias another token of the theme, such as `tones.neutral.ramp[950]`, so a
// value resolves by following the token's path through the same mode's values.
const resolveColor = (mode: unknown, value: unknown): Option.Option<string> =>
  Predicate.isString(value)
    ? Option.some(value)
    : Token.isToken(value)
      ? Option.flatMap(lookupPath(mode, value.path), (target) => resolveColor(mode, target))
      : Option.none()

const srgbToLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

const oklchToLinearSrgb = ({
  lightness,
  chroma,
  hue,
}: Readonly<{ lightness: number; chroma: number; hue: number }>): ReadonlyArray<number> => {
  const a = chroma * Math.cos((hue * Math.PI) / 180)
  const b = chroma * Math.sin((hue * Math.PI) / 180)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3

  return EffectArray.map(
    [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ],
    (channel) => Math.min(1, Math.max(0, channel)),
  )
}

const linearChannels = (color: string): Option.Option<ReadonlyArray<number>> =>
  Option.fromNullishOr(/^#([0-9a-f]{6})$/i.exec(color)).pipe(
    Option.flatMap(([, hex]) => Option.fromNullishOr(hex)),
    Option.map((hex) =>
      EffectArray.map([0, 2, 4], (offset) =>
        srgbToLinear(parseInt(hex.slice(offset, offset + 2), 16) / 255),
      ),
    ),
    Option.orElse(() =>
      Option.map(
        Option.fromNullishOr(/^oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)$/.exec(color)),
        ([, lightness, chroma, hue]) =>
          oklchToLinearSrgb({
            lightness: Number(lightness) / 100,
            chroma: Number(chroma),
            hue: Number(hue),
          }),
      ),
    ),
  )

const relativeLuminance = (color: string): number =>
  Option.match(linearChannels(color), {
    onNone: () => Number.NaN,
    onSome: ([red = Number.NaN, green = Number.NaN, blue = Number.NaN]) =>
      0.2126 * red + 0.7152 * green + 0.0722 * blue,
  })

const contrast = (first: string, second: string): number => {
  const [one, two] = [relativeLuminance(first), relativeLuminance(second)]
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05)
}

const tones: ReadonlyArray<Tone> = ["primary", "secondary", "accent", "neutral", "destructive"]
const cases = EffectArray.flatMap(Record.toEntries(hortaColorTheme), ([modeName, mode]) =>
  EffectArray.map(tones, (tone) => ({ name: `${modeName} ${tone}`, mode, tone })),
)

const roleColor = ({
  mode,
  tone,
  role,
}: Readonly<{ mode: unknown; tone: Tone; role: string }>): string =>
  Option.getOrElse(
    Option.flatMap(lookupPath(mode, [tone, ...role.split(".")]), (value) =>
      resolveColor(mode, value),
    ),
    () => `unresolved ${tone}.${role}`,
  )

describe("color theme contrast", () => {
  it.each(cases)(
    "$name: focus rings reach 3:1 on every surface (WCAG 1.4.11)",
    ({ mode, tone }) => {
      EffectArray.forEach(["background", "backgroundCard", "backgroundMuted"], (surface) =>
        expect(
          contrast(
            roleColor({ mode, tone, role: "focus" }),
            roleColor({ mode, tone, role: surface }),
          ),
        ).toBeGreaterThanOrEqual(3),
      )
    },
  )

  it.each(cases)("$name: text and action labels reach 4.5:1 (WCAG 1.4.3)", ({ mode, tone }) => {
    const pairs: ReadonlyArray<readonly [string, string]> = [
      ["foreground", "background"],
      ["foreground", "backgroundCard"],
      ["foregroundMuted", "backgroundCard"],
      ["action.foreground", "action.background"],
    ]

    EffectArray.forEach(pairs, ([text, surface]) =>
      expect(
        contrast(roleColor({ mode, tone, role: text }), roleColor({ mode, tone, role: surface })),
      ).toBeGreaterThanOrEqual(4.5),
    )
  })
})

// RECIPES

const themeReference = /var\(--gororobas-/

const neutralValues: ReadonlyArray<string> = [
  "0",
  "0px",
  "auto",
  "none",
  "inherit",
  "transparent",
  "currentColor",
]

// `Style.declarations` names properties in camelCase.
const governedProperty =
  /^(color|backgroundColor|borderColor|outlineColor|padding|margin|gap|rowGap|columnGap|borderRadius|fontSize|fontWeight|lineHeight)/

/** Every color, spacing, radius and type declaration either reads a theme token or is neutral. */
const usesOnlyTokens = (style: Style.Style): boolean =>
  EffectArray.every(
    Style.declarations(style),
    ({ property, value }) =>
      !governedProperty.test(property) ||
      EffectArray.contains(neutralValues, value) ||
      themeReference.test(value),
  )

describe("recipes stay inside the design system", () => {
  it.prop("AppButton", [appButtonStyle.schema], ([props]) => usesOnlyTokens(appButtonStyle(props)))
  it.prop("AppCard", [appCardStyle.schema], ([props]) => usesOnlyTokens(appCardStyle(props)))
  it.prop("AppText", [appTextStyle.schema], ([props]) => usesOnlyTokens(appTextStyle(props)))
  it.prop("AppDrawer panel", [appDrawerPanelStyle.schema], ([props]) =>
    usesOnlyTokens(appDrawerPanelStyle(props)),
  )
  it.prop("empty state", [emptyStateStyle.schema], ([props]) =>
    usesOnlyTokens(emptyStateStyle(props)),
  )
})
