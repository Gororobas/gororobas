import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import { languageFallbackOrder } from "@gororobas/domain/common/language-fallback"
import type { MediaAssetRow } from "@gororobas/domain/media-assets/domain"
import { tiptapToText } from "@gororobas/domain/rich-text/tiptap-to-text"
import { Array as EffectArray, Option, String as EffectString } from "effect"

/** The description of media as plain text, in `language` or else the next one that has it. */
export const mediaCaption = ({
  media,
  language,
}: Readonly<{
  media: Pick<MediaAssetRow, "descriptions">
  language: SupportedLanguage
}>): Option.Option<string> =>
  EffectArray.findFirst(languageFallbackOrder(language), (candidate) =>
    Option.filter(
      Option.map(Option.fromNullishOr(media.descriptions[candidate]), (document) =>
        EffectString.trim(tiptapToText(document)),
      ),
      EffectString.isNonEmpty,
    ),
  )
