import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import { msg } from "@lingui/core/macro"
import { Style } from "@pleat/core"
import { Option } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import { inlineLanguageName } from "../../lib/language"
import type { Translator } from "../../lib/translations"
import * as Icons from "../icons"
import { styledAttributes } from "../pleat-attributes"
import { borderWidth, fontSize, fontWeight, radius, space, toneColors } from "../theme"

const badgeStyle = Style.make({
  display: "inline-flex",
  alignItems: "center",
  gap: space[1],
  flexShrink: 0,
  paddingBlock: space[1],
  paddingInline: space[2],
  border: `${borderWidth.hairline} dashed ${toneColors.borderStrong}`,
  borderRadius: radius.full,
  cornerShape: "squircle",
  color: toneColors.foregroundMuted,
  fontSize: fontSize.caption,
  fontWeight: fontWeight.medium,
  whiteSpace: "nowrap",
})

/**
 * The language content falls back to when it has no translation in the reader's: `None` when it
 * reads in theirs.
 */
export const maybeFallbackLanguage = ({
  contentLanguage,
  readerLanguage,
}: Readonly<{
  contentLanguage: SupportedLanguage
  readerLanguage: SupportedLanguage
}>): Option.Option<SupportedLanguage> =>
  contentLanguage === readerLanguage ? Option.none() : Option.some(contentLanguage)

/** "Not in Spanish yet: shown in Portuguese", for content read through language fallback. */
export const label = ({
  contentLanguage,
  readerLanguage,
  i18n,
}: Readonly<{
  contentLanguage: SupportedLanguage
  readerLanguage: SupportedLanguage
  i18n: Translator
}>): string => {
  const missing = inlineLanguageName(readerLanguage, readerLanguage)
  const shown = inlineLanguageName(contentLanguage, readerLanguage)
  return i18n._(msg`Not in ${missing} yet: shown in ${shown}`)
}

/** "🌐 In Portuguese", with the full explanation for pointers and assistive technology. */
export const badge = <Message>(
  config: Readonly<{
    contentLanguage: SupportedLanguage
    readerLanguage: SupportedLanguage
    i18n: Translator
  }>,
  h: HtmlBuilder<Message>,
): Html => {
  const shown = inlineLanguageName(config.contentLanguage, config.readerLanguage)
  const explanation = label(config)

  return h.span(styledAttributes([h.Title(explanation), h.AriaLabel(explanation)], badgeStyle), [
    Icons.globe({ size: "sm" }),
    config.i18n._(msg({ message: `In ${shown}`, context: "untranslated content" })),
  ])
}
