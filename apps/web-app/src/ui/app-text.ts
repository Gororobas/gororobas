import { Recipe, Style } from "@pleat/core"
import { className as pleatClassName } from "@pleat/foldkit"
import type { Attribute, ChildAttribute, Html, HtmlBuilder } from "foldkit/html"

import { styledAttributes } from "./pleat-attributes"
import { fontSize, fontWeight, lineHeight, toneColors, toneStyle, type Tone } from "./theme"

export type AppTextAppearance =
  | "inherit"
  | "caption"
  | "footnote"
  | "regular"
  | "large"
  | "xl"
  | "xxl"
  | "display"

export type AppTextElement =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "p"
  | "span"
  | "a"
  | "time"
  | "label"
  | "small"
  | "strong"
  | "em"
  | "blockquote"

export interface AppTextConfig<Message = never> {
  readonly children: ReadonlyArray<Html | string>
  readonly appearance?: AppTextAppearance
  readonly tone?: Tone | "inherit"
  readonly element?: AppTextElement
  readonly isMuted?: boolean
  readonly weight?: "inherit" | "regular" | "medium" | "semibold" | "bold"
  readonly lineHeight?: "inherit" | "tight" | "normal" | "relaxed"
  readonly className?: string
  readonly attributes?: ReadonlyArray<Attribute<Message> | ChildAttribute>
  readonly styles?: ReadonlyArray<Style.Style>
}

export const appTextStyle = Recipe.make({
  base: {
    margin: 0,
    fontSize: fontSize.regular,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.normal,
    // `break-word` rather than `anywhere`: words still wrap when they must, but flex items
    // such as button labels don't shrink below their longest word.
    overflowWrap: "break-word",
  },
  variants: {
    appearance: {
      inherit: { fontSize: "inherit", fontWeight: "inherit", lineHeight: "inherit" },
      caption: { fontSize: fontSize.caption },
      footnote: { fontSize: fontSize.footnote },
      regular: { fontSize: fontSize.regular },
      large: { fontSize: fontSize.large },
      xl: { fontSize: fontSize.xl },
      xxl: { fontSize: fontSize.xxl },
      display: { fontSize: fontSize.display },
    },
    muted: { true: { color: toneColors.foregroundMuted } },
    weight: {
      inherit: { fontWeight: "inherit" },
      regular: { fontWeight: fontWeight.regular },
      medium: { fontWeight: fontWeight.medium },
      semibold: { fontWeight: fontWeight.semibold },
      bold: { fontWeight: fontWeight.bold },
    },
    lineHeight: {
      inherit: { lineHeight: "inherit" },
      tight: { lineHeight: lineHeight.tight },
      normal: { lineHeight: lineHeight.normal },
      relaxed: { lineHeight: lineHeight.relaxed },
    },
  },
  defaults: { appearance: "inherit", muted: false, weight: "inherit", lineHeight: "inherit" },
})

const tonedTextStyle = Style.make({ color: toneColors.emphasis })

const defaultElements: Readonly<Record<Exclude<AppTextAppearance, "inherit">, AppTextElement>> = {
  caption: "span",
  footnote: "span",
  regular: "p",
  large: "p",
  xl: "h3",
  xxl: "h2",
  display: "h1",
}

export const AppText = {
  view: <Message>(config: AppTextConfig<Message>, h: HtmlBuilder<Message>): Html => {
    const element: AppTextElement =
      config.element ??
      (config.appearance === undefined
        ? "p"
        : config.appearance === "inherit"
          ? "span"
          : defaultElements[config.appearance])

    return h[element](
      styledAttributes(
        config.attributes ?? [],
        appTextStyle({
          appearance: config.appearance ?? "inherit",
          muted: config.isMuted ?? false,
          weight: config.weight ?? "inherit",
          lineHeight: config.lineHeight ?? "inherit",
        }),
        ...(config.tone === undefined || config.tone === "inherit"
          ? []
          : [toneStyle(config.tone), ...(config.isMuted === true ? [] : [tonedTextStyle])]),
        ...(config.styles ?? []),
        pleatClassName(config.className ?? ""),
      ),
      config.children,
    )
  },
}
