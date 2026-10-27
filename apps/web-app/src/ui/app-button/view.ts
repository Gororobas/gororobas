import { Button } from "@foldkit/ui"
import { Style } from "@pleat/core"
import { className as pleatClassName } from "@pleat/foldkit"
import { Predicate } from "effect"
import type { Attribute, ChildAttribute, Html, HtmlBuilder } from "foldkit/html"

import { AppText } from "../app-text"
import { styledAttributes } from "../pleat-attributes"
import { toneStyle } from "../theme"
import { appButtonStyle } from "./styles"

export type AppButtonTone =
  | "inherit"
  | "primary"
  | "secondary"
  | "accent"
  | "neutral"
  | "destructive"

export type AppButtonMode = "bleed" | "default" | "outline" | "faded"
export type AppButtonSize = "sm" | "md" | "lg"

export interface AppButtonConfig<Message> {
  readonly children: ReadonlyArray<Html | string>
  readonly className?: string
  readonly styles?: ReadonlyArray<Style.Style>
  readonly tone?: AppButtonTone
  readonly mode?: AppButtonMode
  readonly size?: AppButtonSize
  readonly href?: string
  readonly onClick?: Message
  readonly isDisabled?: boolean
  readonly isFullWidth?: boolean
  readonly type?: "button" | "submit" | "reset"
  readonly isAutofocus?: boolean
  readonly ariaLabel?: string
  readonly ariaCurrent?: string
  readonly title?: string
  readonly attributes?: ReadonlyArray<Attribute<Message> | ChildAttribute>
}

export const view = <Message>(config: AppButtonConfig<Message>, h: HtmlBuilder<Message>): Html => {
  const tone = config.tone ?? "inherit"
  const mode = config.mode ?? "default"
  const size = config.size ?? "md"
  const child = config.children[0]

  const isIconOnly =
    config.children.length === 1 &&
    child !== undefined &&
    child !== null &&
    !Predicate.isString(child) &&
    child.sel === "svg"

  const children = config.children.map((value) =>
    Predicate.isString(value)
      ? AppText.view({ appearance: "inherit", element: "span", children: [value] }, h)
      : value,
  )

  const commonAttributes = [
    ...styledAttributes(
      [
        ...(config.attributes ?? []),
        ...(config.ariaLabel === undefined ? [] : [h.AriaLabel(config.ariaLabel)]),
        ...(config.ariaCurrent === undefined ? [] : [h.AriaCurrent(config.ariaCurrent)]),
        ...(config.title === undefined ? [] : [h.Title(config.title)]),
      ],
      appButtonStyle({
        mode,
        size,
        isFullWidth: config.isFullWidth ?? false,
        isIconOnly,
      }),
      ...(tone === "inherit" ? [] : [toneStyle(tone)]),
      ...(config.styles ?? []),
      pleatClassName(config.className ?? ""),
    ),
  ]

  if (config.href !== undefined) {
    return h.a(
      [
        h.Href(config.href),
        ...(config.isDisabled ? [h.AriaDisabled(true), h.DataAttribute("disabled", "")] : []),
        ...commonAttributes,
      ],
      children,
    )
  }

  return Button.view(
    {
      ...(config.onClick === undefined ? {} : { onClick: config.onClick }),
      isDisabled: config.isDisabled ?? false,
      type: config.type ?? "button",
      isAutofocus: config.isAutofocus ?? false,
      toView: ({ button }) => h.button([...button, ...commonAttributes], children),
    },
    h,
  )
}
