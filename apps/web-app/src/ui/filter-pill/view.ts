import { Recipe, Style, When } from "@pleat/core"
import type { Attribute, ChildAttribute, Html, HtmlBuilder } from "foldkit/html"

import { styledAttributes } from "../pleat-attributes"
import { focusRingDeclarations } from "../styles/focus-ring"
import { controlSize, duration, fontSize, fontWeight, radius, space, tones } from "../theme"

/** Soft pills for narrowing results, quieter than buttons so results stay in front. */
export const filterPillStyle = Recipe.make({
  name: "FilterPill",
  base: Style.make({
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    gap: space[1],
    blockSize: controlSize.sm,
    paddingInline: space[4],
    border: 0,
    borderRadius: radius.full,
    cornerShape: "squircle",
    fontSize: fontSize.footnote,
    fontWeight: fontWeight.semibold,
    whiteSpace: "nowrap",
    cursor: "pointer",
    outline: "none",
    transitionProperty: "background-color, color",
    transitionDuration: duration.control,
  }).pipe(Style.when(When.focusVisible, focusRingDeclarations)),
  variants: {
    appearance: {
      /** A choice not taken yet. */
      idle: Style.make({
        backgroundColor: tones.neutral.ramp[100],
        color: tones.neutral.ramp[800],
      }).pipe(Style.when(When.hover, { backgroundColor: tones.neutral.ramp[200] })),
      /** A filter with values chosen inside it. */
      active: Style.make({
        backgroundColor: tones.accent.ramp[200],
        color: tones.accent.ramp[900],
      }).pipe(Style.when(When.hover, { backgroundColor: tones.accent.ramp[300] })),
      /** The choice that is narrowing the results; pressing it again undoes it. */
      selected: Style.make({
        backgroundColor: tones.accent.ramp[700],
        color: tones.accent.ramp[50],
      }).pipe(Style.when(When.hover, { backgroundColor: tones.accent.ramp[800] })),
    },
  },
  defaults: { appearance: "idle" },
})

export type FilterPillAppearance = "idle" | "active" | "selected"

export type FilterPillConfig<Message> = Readonly<{
  children: ReadonlyArray<Html | string>
  appearance?: FilterPillAppearance
  onClick?: Message
  /** Attributes from a component that owns the button, such as a popover trigger. */
  attributes?: ReadonlyArray<Attribute<Message> | ChildAttribute>
}>

export const view = <Message>(config: FilterPillConfig<Message>, h: HtmlBuilder<Message>): Html =>
  h.button(
    styledAttributes(
      [
        h.Type("button"),
        ...(config.onClick === undefined ? [] : [h.OnClick(config.onClick)]),
        ...(config.attributes ?? []),
      ],
      filterPillStyle({ appearance: config.appearance ?? "idle" }),
    ),
    config.children,
  )
