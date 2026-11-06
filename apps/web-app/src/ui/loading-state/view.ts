import { Global, Recipe, Style, When } from "@pleat/core"
import { Array as EffectArray, Match } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import { styledAttributes } from "../pleat-attributes"
import { radius, space, toneColors, tones } from "../theme"
import { visuallyHiddenStyle } from "../visually-hidden"

const shimmer = Global.keyframes("loading-state-shimmer", {
  from: { backgroundPosition: "100% 0" },
  to: { backgroundPosition: "-100% 0" },
})

/** A placeholder shaped like what's loading, so the page doesn't jump once it arrives. */
const boneStyle = Recipe.make({
  name: "LoadingStateBone",
  base: Style.make({
    borderRadius: radius.md,
    backgroundImage: `linear-gradient(90deg, ${tones.primary.ramp[300]} 0%, ${tones.primary.ramp[200]} 50%, ${tones.primary.ramp[300]} 100%)`,
    backgroundSize: "200% 100%",
    animationName: shimmer,
    animationDuration: "1.4s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
  }).pipe(Style.when(When.reducedMotion, { animationName: "none" })),
  variants: {
    shape: {
      title: { blockSize: "2rem", inlineSize: "min(20rem, 70%)" },
      line: { blockSize: "0.875rem", inlineSize: "100%" },
      shortLine: { blockSize: "0.875rem", inlineSize: "60%" },
      avatar: {
        blockSize: "2.5rem",
        inlineSize: "2.5rem",
        flexShrink: 0,
        borderRadius: radius.full,
      },
      card: { blockSize: "7rem", inlineSize: "100%", borderRadius: radius.lg },
      tile: { aspectRatio: "4 / 3", inlineSize: "100%", borderRadius: radius.md },
    },
  },
  defaults: { shape: "line" },
})

const stackStyle = Style.make({ display: "grid", rowGap: space[3] })
const rowStyle = Style.make({ display: "flex", alignItems: "center", gap: space[3] })
const rowTextStyle = Style.make({ display: "grid", flex: 1, rowGap: space[2] })

const gridStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(10rem, 45%), 1fr))",
  gap: space[3],
})

const panelStyle = Style.make({
  display: "grid",
  rowGap: space[4],
  padding: space[4],
  borderRadius: radius.lg,
  backgroundColor: toneColors.backgroundCard,
})

export type LoadingShape = "lines" | "rows" | "cards" | "tiles" | "page"

export type LoadingStateConfig = Readonly<{
  /** Announced to assistive technology, such as "Carregando posts". */
  label: string
  shape: LoadingShape
  count?: number
}>

const bone = <Message>(shape: Parameters<typeof boneStyle>[0]["shape"], h: HtmlBuilder<Message>) =>
  h.div(styledAttributes([], boneStyle({ shape })))

const bones = <Message>(
  { shape, count }: Readonly<{ shape: LoadingShape; count: number }>,
  h: HtmlBuilder<Message>,
): Html => {
  const repeated = (render: () => Html) => EffectArray.makeBy(count, render)

  return Match.value(shape).pipe(
    Match.withReturnType<Html>(),
    Match.when("lines", () =>
      h.div(styledAttributes([], stackStyle), [
        ...repeated(() => bone("line", h)),
        bone("shortLine", h),
      ]),
    ),
    Match.when("rows", () =>
      h.div(
        styledAttributes([], stackStyle),
        repeated(() =>
          h.div(styledAttributes([], rowStyle), [
            bone("avatar", h),
            h.div(styledAttributes([], rowTextStyle), [bone("line", h), bone("shortLine", h)]),
          ]),
        ),
      ),
    ),
    Match.when("cards", () =>
      h.div(
        styledAttributes([], stackStyle),
        repeated(() => bone("card", h)),
      ),
    ),
    Match.when("tiles", () =>
      h.div(
        styledAttributes([], gridStyle),
        repeated(() => bone("tile", h)),
      ),
    ),
    Match.when("page", () =>
      h.div(styledAttributes([], stackStyle), [
        bone("title", h),
        ...repeated(() =>
          h.div(styledAttributes([], panelStyle), [
            bone("shortLine", h),
            bone("line", h),
            bone("line", h),
          ]),
        ),
      ]),
    ),
    Match.exhaustive,
  )
}

/** Placeholders shaped like the content on its way, announced once as loading. */
export const view = <Message>(config: LoadingStateConfig, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Role("status"), h.AriaBusy(true)],
    [
      h.span(styledAttributes([], visuallyHiddenStyle), [config.label]),
      h.div([h.AriaHidden(true)], [bones({ shape: config.shape, count: config.count ?? 3 }, h)]),
    ],
  )
