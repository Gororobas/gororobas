import { Recipe, Style, When } from "@pleat/core"
import type { Attribute, ChildAttribute, Html, HtmlBuilder } from "foldkit/html"

import { styledAttributes } from "../pleat-attributes"
import { focusRingDeclarations } from "../styles/focus-ring"
import { borderWidth, radius, space, toneColors } from "../theme"

export const appCardStyle = Recipe.make({
  name: "AppCard",
  base: {
    borderWidth: borderWidth.hairline,
    borderStyle: "solid",
    borderColor: toneColors.border,
    borderRadius: radius.lg,
    backgroundColor: toneColors.backgroundCard,
    color: toneColors.foreground,
  },
  variants: {
    kind: {
      card: { padding: space[4] },
      panel: { padding: space[6] },
    },
    isInteractive: {
      true: Style.make({ outline: "none" }).pipe(
        Style.when(When.all(When.hover, When.not(When.disabled)), {
          backgroundColor: toneColors.hover,
        }),
        Style.when(When.focusVisible, focusRingDeclarations),
      ),
    },
    isSelected: {
      true: {
        backgroundColor: toneColors.selected.background,
        borderColor: toneColors.selected.border,
        color: toneColors.selected.foreground,
      },
    },
  },
  defaults: { kind: "card", isInteractive: false, isSelected: false },
})

export type AppCardProps = Parameters<typeof appCardStyle>[0]

export interface AppCardConfig<Message> extends AppCardProps {
  readonly element?: "div" | "section" | "article" | "aside"
  readonly attributes?: ReadonlyArray<Attribute<Message> | ChildAttribute>
  readonly styles?: ReadonlyArray<Style.Style>
  readonly children: ReadonlyArray<Html>
}

/** A bordered surface for grouped content, painted from the tone context. */
export const view = <Message>(config: AppCardConfig<Message>, h: HtmlBuilder<Message>): Html =>
  h[config.element ?? "div"](
    styledAttributes(
      config.attributes ?? [],
      appCardStyle({
        kind: config.kind,
        isInteractive: config.isInteractive,
        isSelected: config.isSelected,
      }),
      ...(config.styles ?? []),
    ),
    config.children,
  )
