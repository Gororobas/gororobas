import { Style, When } from "@pleat/core"
import type { Html, HtmlBuilder } from "foldkit/html"

import { AppText } from "../app-text"
import * as Icons from "../icons"
import type { IconConfig } from "../icons"
import { styledAttributes } from "../pleat-attributes"
import { focusRingDeclarations } from "../styles/focus-ring"
import {
  borderWidth,
  duration,
  fontSize,
  fontWeight,
  radius,
  space,
  tones,
  toneColors,
  toneStyle,
} from "../theme"

/** The card's inline padding, which side-scrolling strips bleed through. */
const CARD_PADDING = space[4]

const cardStyle = Style.make({
  display: "grid",
  rowGap: space[4],
  padding: CARD_PADDING,
  borderRadius: radius.lg,
  backgroundColor: toneColors.backgroundCard,
  color: toneColors.foreground,
})

/**
 * For side-scrolling strips inside a card: they run to the card's edges instead of being cut
 * by its padding, while their first item still lines up with the title.
 */
export const cardBleedStyle = Style.make({
  marginInline: `calc(-1 * ${CARD_PADDING})`,
  paddingInline: CARD_PADDING,
  scrollPaddingInline: CARD_PADDING,
  scrollbarWidth: "none",
})

/** The same layout without the card surface, for a page that is only this section. */
const bareStyle = Style.make({ display: "grid", rowGap: space[4], paddingBlock: space[2] })

const headingRowStyle = Style.make({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space[3],
})

const headingStyle = Style.make({ display: "flex", alignItems: "center", gap: space[2] })
const titleStyle = Style.make({ color: tones.secondary.emphasis })

const footerStyle = Style.make({
  display: "flex",
  justifyContent: "flex-end",
  paddingBlockStart: space[3],
  borderBlockStart: `${borderWidth.hairline} solid ${tones.primary.shade[300]}`,
})

const footerLinkStyle = Style.make({
  display: "inline-flex",
  alignItems: "center",
  gap: space[1],
  paddingBlock: space[1],
  paddingInline: space[2],
  borderRadius: radius.full,
  color: tones.accent.shade[800],
  fontSize: fontSize.footnote,
  fontWeight: fontWeight.semibold,
  outline: "none",
  transitionProperty: "background-color",
  transitionDuration: duration.control,
}).pipe(
  Style.when(When.hover, { backgroundColor: tones.accent.shade[100] }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

export type SectionCardConfig = Readonly<{
  title: string
  icon: (config?: IconConfig) => Html
  /** Controls beside the title, such as "Editar página". */
  actions?: ReadonlyArray<Html>
  children: ReadonlyArray<Html>
  footerLink?: Readonly<{ label: string; href: string }>
  /** Drops the card surface when the section is the whole page. */
  isBare?: boolean
  headingElement?: "h1" | "h2"
}>

/** A titled group of content, such as one kind of search result or one part of an article. */
export const view = <Message>(config: SectionCardConfig, h: HtmlBuilder<Message>): Html =>
  h.section(
    styledAttributes(
      [h.AriaLabel(config.title)],
      ...(config.isBare === true ? [bareStyle] : [toneStyle("primary"), cardStyle]),
    ),
    [
      h.div(styledAttributes([], headingRowStyle), [
        h.div(styledAttributes([], headingStyle), [
          config.icon({ size: "lg", tone: "accent", mode: "duotone" }),
          AppText.view(
            {
              element: config.headingElement ?? "h2",
              appearance: "xl",
              weight: "medium",
              lineHeight: "tight",
              styles: [titleStyle],
              children: [config.title],
            },
            h,
          ),
        ]),
        ...(config.actions ?? []),
      ]),
      ...config.children,
      ...(config.footerLink === undefined
        ? []
        : [
            h.div(styledAttributes([], footerStyle), [
              h.a(styledAttributes([h.Href(config.footerLink.href)], footerLinkStyle), [
                config.footerLink.label,
                Icons.arrowRight({ size: "sm" }),
              ]),
            ]),
          ]),
    ],
  )
