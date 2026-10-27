import { Recipe, Style, When } from "@pleat/core"
import type { Attribute, ChildAttribute, Html, HtmlBuilder } from "foldkit/html"

import { dialogBackdropStyle, dialogSurfaceStyle, drawerHandleStyle } from "../app-dialog/styles"
import { AppText } from "../app-text"
import type { RenderInfo } from "../drawer"
import { styledAttributes } from "../pleat-attributes"
import {
  borderWidth,
  breakpoint,
  duration,
  easing,
  measure,
  radius,
  space,
  toneColors,
  toneStyle,
  type Tone,
  viewport,
} from "../theme"

const viewportStyle = Style.make({ position: "fixed", inset: 0 })

// A bottom sheet on phones; a centered dialog from `breakpoint.md` up. Both slide in with
// Foldkit's transition states.
export const appDrawerPanelStyle = Recipe.make({
  name: "AppDrawerPanel",
  base: Style.make({
    position: "fixed",
    insetInline: 0,
    insetBlockEnd: viewport.keyboardOffset,
    display: "flex",
    flexDirection: "column",
    inlineSize: "100%",
    maxBlockSize: `min(85dvh, ${viewport.visibleHeight})`,
    marginInline: "auto",
    borderStartStartRadius: radius.lg,
    borderStartEndRadius: radius.lg,
    backgroundColor: toneColors.backgroundCard,
    color: toneColors.foreground,
    transitionProperty: "transform, opacity",
    transitionDuration: duration.moderate,
    transitionTimingFunction: easing.standard,
  }).pipe(
    Style.when(When.closed, { transform: "translateY(100%)" }),
    Style.when(breakpoint.md, {
      insetBlockEnd: "auto",
      insetBlockStart: "50%",
      inlineSize: `calc(100% - 2 * ${space[6]})`,
      borderRadius: radius.lg,
      transform: "translateY(-50%)",
    }),
    Style.when(When.all(When.closed, breakpoint.md), {
      transform: `translateY(calc(-50% + ${space[2]})) scale(0.95)`,
      opacity: 0,
    }),
  ),
  variants: {
    size: {
      narrow: { maxInlineSize: measure.narrow },
      form: { maxInlineSize: measure.form },
      prose: { maxInlineSize: measure.prose },
    },
  },
  defaults: { size: "form" },
})

const swipeAreaStyle = Style.make({
  display: "flex",
  flexShrink: 0,
  blockSize: space[8],
  alignItems: "center",
  justifyContent: "center",
  cursor: "grab",
}).pipe(
  Style.when(When.active, { cursor: "grabbing" }),
  Style.when(breakpoint.md, { display: "none" }),
)

const contentStyle = Style.make({
  display: "flex",
  flex: 1,
  flexDirection: "column",
  gap: space[5],
  minBlockSize: 0,
  paddingInline: space[5],
  paddingBlockEnd: `calc(${space[6]} + ${viewport.safeAreaBottom})`,
}).pipe(Style.when(breakpoint.md, { padding: space[6] }))

const sectionedHeaderStyle = Style.make({
  borderBlockEnd: `${borderWidth.hairline} solid ${toneColors.border}`,
  paddingBlockEnd: space[5],
})
const descriptionStyle = Style.make({ marginBlockStart: space[2] })

// The negative margin keeps children's focus rings inside the scroll container's clip.
const bodyStyle = Style.make({
  flex: 1,
  minBlockSize: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  margin: `calc(-1 * ${space[1]})`,
  padding: space[1],
})

const footerStyle = Style.make({
  display: "flex",
  flexDirection: "column-reverse",
  gap: space[3],
}).pipe(Style.when(breakpoint.sm, { flexDirection: "row", justifyContent: "flex-end" }))

const sectionedFooterStyle = Style.make({
  borderBlockStart: `${borderWidth.hairline} solid ${toneColors.border}`,
  paddingBlockStart: space[4],
})

export type AppDrawerSize = "narrow" | "form" | "prose"

export interface AppDrawerConfig {
  /** What `Drawer.view` hands its `toView`. */
  readonly render: RenderInfo
  readonly title: string
  readonly description?: string
  readonly size?: AppDrawerSize
  readonly tone?: Tone
  /** Draws rules between header, body and footer, for drawers whose body scrolls. */
  readonly isSectioned?: boolean
  readonly children: ReadonlyArray<Html>
  /** Actions, stacked on phones (first child at the bottom) and in a row on wider screens. */
  readonly footer?: ReadonlyArray<Html>
}

/** The chrome around every drawer: backdrop, panel, swipe handle, title and actions. */
type DrawerMountRequirements =
  RenderInfo["dialog" | "viewport" | "swipeArea"][number] extends ChildAttribute<infer Requirements>
    ? Requirements
    : never

type DrawerViewBuilder<Message> = HtmlBuilder<Message> & {
  readonly [Element in "dialog" | "div" | "footer" | "header" | "section"]: (
    attributes: ReadonlyArray<Attribute<Message> | ChildAttribute<DrawerMountRequirements>>,
    children?: ReadonlyArray<Html>,
  ) => Html
}

export const view = <Message>(config: AppDrawerConfig, h: DrawerViewBuilder<Message>): Html => {
  const { render } = config
  const isSectioned = config.isSectioned ?? false

  return h.dialog(
    styledAttributes(
      render.dialog,
      dialogSurfaceStyle,
      ...(config.tone === undefined ? [] : [toneStyle(config.tone)]),
    ),
    render.isVisible
      ? [
          h.div(styledAttributes(render.backdrop, dialogBackdropStyle)),
          h.div(styledAttributes(render.viewport, viewportStyle), [
            h.section(
              styledAttributes(render.panel, appDrawerPanelStyle({ size: config.size ?? "form" })),
              [
                h.div(styledAttributes(render.swipeArea, swipeAreaStyle), [
                  h.div(styledAttributes([], drawerHandleStyle)),
                ]),
                h.div(styledAttributes(render.content, contentStyle), [
                  h.header(styledAttributes([], ...(isSectioned ? [sectionedHeaderStyle] : [])), [
                    AppText.view(
                      {
                        element: "h2",
                        appearance: "xl",
                        weight: "semibold",
                        lineHeight: "tight",
                        attributes: render.title,
                        children: [config.title],
                      },
                      h,
                    ),
                    ...(config.description === undefined
                      ? []
                      : [
                          AppText.view(
                            {
                              element: "p",
                              appearance: "footnote",
                              isMuted: true,
                              lineHeight: "relaxed",
                              attributes: render.description,
                              styles: [descriptionStyle],
                              children: [config.description],
                            },
                            h,
                          ),
                        ]),
                  ]),
                  h.div(styledAttributes([], bodyStyle), config.children),
                  ...(config.footer === undefined
                    ? []
                    : [
                        h.footer(
                          styledAttributes(
                            [],
                            footerStyle,
                            ...(isSectioned ? [sectionedFooterStyle] : []),
                          ),
                          config.footer,
                        ),
                      ]),
                ]),
              ],
            ),
          ]),
        ]
      : [],
  )
}
