import type { MediaAssetRow } from "@gororobas/domain/media-assets/domain"
import { tiptapToText } from "@gororobas/domain/rich-text/tiptap-to-text"
import { Option, String as EffectString } from "effect"

import { readerLanguage } from "./reader-language"

/** The description of media in the reader's language, as plain text. */
export const mediaCaption = (media: Pick<MediaAssetRow, "descriptions">): Option.Option<string> =>
  Option.fromNullishOr(media.descriptions[readerLanguage]).pipe(
    Option.map((document) => EffectString.trim(tiptapToText(document))),
    Option.filter(EffectString.isNonEmpty),
  )
