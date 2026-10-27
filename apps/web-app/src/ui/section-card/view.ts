import { Style, When } from "@pleat/core"
import type { Html, HtmlBuilder } from "foldkit/html"

import { AppText } from "../app-text"
import * as Icons from "../icons"
import type { IconConfig } from "../icons"
import { styledAttributes } from "../pleat-attributes"
import { focusRingDeclarations } from "../styles/focus-ring"
import {
  borderWidth,
  fontSize,
  fontWeight,
  radius,
  space,
  tones,
  toneColors,
  toneStyle,
} from "../theme"

const cardStyle = Style.make({
  display: "grid",
  rowGap: space[4],
  padding: space[4],
  borderRadius: radius.lg,
  backgroundColor: toneColors.backgroundCard,
  color: toneColors.foreground,
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

const footerLinkStyle = Style.make({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: space[2],
  paddingBlockStart: space[3],
  borderBlockStart: `${borderWidth.strong} solid ${tones.primary.ramp[300]}`,
  color: tones.secondary.emphasis,
  fontSize: fontSize.footnote,
  fontWeight: fontWeight.semibold,
  outline: "none",
}).pipe(Style.when(When.focusVisible, focusRingDeclarations))

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
            h.a(styledAttributes([h.Href(config.footerLink.href)], footerLinkStyle), [
              Icons.plus({ size: "md" }),
              config.footerLink.label,
            ]),
          ]),
    ],
  )
