import { Global, Recipe, Style, When } from "@pleat/core"
import { Array as EffectArray, Match } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import { styledAttributes } from "../pleat-attributes"
import { pageColumnStyle } from "../styles/page-column"
import { borderWidth, breakpoint, radius, space, toneColors, tones } from "../theme"
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
    backgroundImage: `linear-gradient(90deg, ${tones.primary.shade[300]} 0%, ${tones.primary.shade[200]} 50%, ${tones.primary.shade[300]} 100%)`,
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
      /** A heading's icon, beside its title. */
      icon: { blockSize: "1.75rem", inlineSize: "1.75rem", flexShrink: 0, borderRadius: radius.md },
      heading: { blockSize: "1.5rem", inlineSize: "min(12rem, 60%)" },
      /** A page's identifying photo, the size of `Thumbnail`'s and `ProfileAvatar`'s large ones. */
      media: { blockSize: "5rem", inlineSize: "5rem", flexShrink: 0, borderRadius: "28%" },
      pill: { blockSize: "1.5rem", inlineSize: "5rem", borderRadius: radius.full },
      /** Fills its container, which sets its shape, such as a card's photo. */
      fill: { blockSize: "100%", inlineSize: "100%", borderRadius: 0 },
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

export type LoadingShape = "lines" | "rows" | "tiles"

export type BoneShape = NonNullable<Parameters<typeof boneStyle>[0]["shape"]>

export type LoadingStateConfig = Readonly<{
  /** Announced to assistive technology, such as "Loading posts". */
  label: string
}> &
  (
    | Readonly<{ shape: LoadingShape; count?: number }>
    /** A component's own skeleton, such as publication cards', laid out as the real ones are. */
    | Readonly<{ skeleton: Html }>
  )

/** One placeholder, for components to draw skeletons shaped like themselves. */
export const bone = <Message>(
  { shape, styles = [] }: Readonly<{ shape: BoneShape; styles?: ReadonlyArray<Style.Style> }>,
  h: HtmlBuilder<Message>,
) => h.div(styledAttributes([], boneStyle({ shape }), ...styles))

/** Generic placeholders of a shape, unannounced, for skeletons that compose them. */
export const bones = <Message>(
  { shape, count }: Readonly<{ shape: LoadingShape; count: number }>,
  h: HtmlBuilder<Message>,
): Html => {
  const repeated = (render: () => Html) => EffectArray.makeBy(count, render)

  return Match.value(shape).pipe(
    Match.withReturnType<Html>(),
    Match.when("lines", () =>
      h.div(styledAttributes([], stackStyle), [
        ...repeated(() => bone({ shape: "line" }, h)),
        bone({ shape: "shortLine" }, h),
      ]),
    ),
    Match.when("rows", () =>
      h.div(
        styledAttributes([], stackStyle),
        repeated(() =>
          h.div(styledAttributes([], rowStyle), [
            bone({ shape: "avatar" }, h),
            h.div(styledAttributes([], rowTextStyle), [
              bone({ shape: "line" }, h),
              bone({ shape: "shortLine" }, h),
            ]),
          ]),
        ),
      ),
    ),
    Match.when("tiles", () =>
      h.div(
        styledAttributes([], gridStyle),
        repeated(() => bone({ shape: "tile" }, h)),
      ),
    ),
    Match.exhaustive,
  )
}

/** Placeholders shaped like the content on its way, announced once as loading. */
export const view = <Message>(config: LoadingStateConfig, h: HtmlBuilder<Message>): Html =>
  announced(
    {
      label: config.label,
      children: [
        "skeleton" in config
          ? config.skeleton
          : bones({ shape: config.shape, count: config.count ?? 3 }, h),
      ],
    },
    h,
  )

const announced = <Message>(
  { label, children }: Readonly<{ label: string; children: ReadonlyArray<Html> }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Role("status"), h.AriaBusy(true)],
    [
      h.span(styledAttributes([], visuallyHiddenStyle), [label]),
      h.div([h.AriaHidden(true)], children),
    ],
  )

// PAGE: the anatomy article and profile pages share, so their content lands where it's drawn.

const headerBandStyle = Style.make({
  backgroundColor: toneColors.backgroundCard,
  borderBlockEnd: `${borderWidth.hairline} solid ${toneColors.border}`,
})

const headerStyle = Style.make({
  display: "grid",
  rowGap: space[4],
  paddingBlockStart: space[5],
}).pipe(Style.when(breakpoint.md, { paddingBlockStart: space[8] }))

const identityStyle = Style.make({ display: "flex", alignItems: "center", gap: space[4] })
const identityTextStyle = Style.make({ display: "grid", flex: 1, rowGap: space[3] })

const tabsStyle = Style.make({
  display: "flex",
  gap: space[6],
  paddingBlock: space[3],
  overflow: "hidden",
})

const avatarStyle = Style.make({ borderRadius: radius.full })

const bodyStyle = Style.make({
  display: "flex",
  flexDirection: "column",
  rowGap: space[5],
  paddingBlock: space[5],
}).pipe(
  Style.when(breakpoint.md, { paddingBlock: space[8] }),
  Style.when(breakpoint.lg, {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 22rem",
    alignItems: "start",
    columnGap: space[8],
  }),
)

const columnStyle = Style.make({ display: "grid", rowGap: space[5] }).pipe(
  Style.when(breakpoint.lg, { rowGap: space[6] }),
)

/** Matches `SectionCard`'s surface. */
const cardStyle = Style.make({
  display: "grid",
  rowGap: space[4],
  padding: space[4],
  borderRadius: radius.lg,
  backgroundColor: toneColors.backgroundCard,
})

const cardHeadingStyle = Style.make({ display: "flex", alignItems: "center", gap: space[2] })
const featureStyle = Style.make({ aspectRatio: "4 / 3", maxBlockSize: "24rem", inlineSize: "100%" })

/** Hidden on small screens, where the sidebar would only push the main content down. */
const sidebarStyle = Style.make({ display: "none" }).pipe(
  Style.when(breakpoint.lg, { display: "grid", rowGap: space[6] }),
)

/** A `SectionCard` on its way: its heading, then `children`. */
export const sectionCard = <Message>(
  children: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(styledAttributes([], cardStyle), [
    h.div(styledAttributes([], cardHeadingStyle), [
      bone({ shape: "icon" }, h),
      bone({ shape: "heading" }, h),
    ]),
    ...children,
  ])

/**
 * A whole page on its way, drawn as article and profile pages are: a header band with the page's
 * photo, names and tabs, a main column with a featured card, and a sidebar of smaller ones.
 */
export const page = <Message>(
  {
    label,
    media,
  }: Readonly<{
    label: string
    /** Articles have square photos; profiles round ones. */
    media: "square" | "round"
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  announced(
    {
      label,
      children: [
        h.div(styledAttributes([], headerBandStyle), [
          h.div(styledAttributes([], pageColumnStyle, headerStyle), [
            h.div(styledAttributes([], identityStyle), [
              bone({ shape: "media", styles: media === "round" ? [avatarStyle] : [] }, h),
              h.div(styledAttributes([], identityTextStyle), [
                bone({ shape: "title" }, h),
                bone({ shape: "shortLine" }, h),
              ]),
            ]),
            h.div(
              styledAttributes([], tabsStyle),
              EffectArray.makeBy(4, () => bone({ shape: "pill" }, h)),
            ),
          ]),
        ]),
        h.div(styledAttributes([], pageColumnStyle, bodyStyle), [
          h.div(styledAttributes([], columnStyle), [
            sectionCard([bone({ shape: "tile", styles: [featureStyle] }, h)], h),
            sectionCard(
              [
                bone({ shape: "line" }, h),
                bone({ shape: "line" }, h),
                bone({ shape: "shortLine" }, h),
              ],
              h,
            ),
          ]),
          h.div(styledAttributes([], sidebarStyle), [
            bone(
              { shape: "pill", styles: [Style.make({ inlineSize: "100%", blockSize: "3rem" })] },
              h,
            ),
            sectionCard(
              EffectArray.makeBy(2, () =>
                h.div(styledAttributes([], rowStyle), [
                  bone({ shape: "avatar" }, h),
                  h.div(styledAttributes([], rowTextStyle), [
                    bone({ shape: "line" }, h),
                    bone({ shape: "shortLine" }, h),
                  ]),
                ]),
              ),
              h,
            ),
          ]),
        ]),
      ],
    },
    h,
  )
