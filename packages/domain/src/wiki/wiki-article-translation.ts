import { Schema } from "effect"

import { SupportedLanguage } from "../common/enums.js"
import { WikiArticleId } from "../common/ids.js"
import { OptionalColumn } from "../common/primitives.js"
import { TiptapDocument } from "../rich-text/domain.js"
import {
  WikiArticleCommonName,
  WikiArticleCommonNameInCrdtList,
} from "./wiki-article-common-name.js"

export const WikiArticleEditableTranslation = Schema.Struct({
  commonNames: Schema.NonEmptyArray(WikiArticleCommonNameInCrdtList),
  content: OptionalColumn(TiptapDocument),
})

export type WikiArticleEditableTranslation = typeof WikiArticleEditableTranslation.Type

export const WikiArticleEditableTranslations = Schema.Struct({
  en: Schema.optional(WikiArticleEditableTranslation),
  es: Schema.optional(WikiArticleEditableTranslation),
  pt: Schema.optional(WikiArticleEditableTranslation),
})

export type WikiArticleEditableTranslations = typeof WikiArticleEditableTranslations.Type

/** Per-language projection of contributor-editable names and content. */
export const commonWikiArticleTranslationProjectionFields = {
  ...WikiArticleEditableTranslation.fields,
  commonNames: Schema.fromJsonString(Schema.Array(WikiArticleCommonName)),
  content: OptionalColumn(Schema.fromJsonString(TiptapDocument)),
  wikiArticleId: WikiArticleId,
  language: SupportedLanguage,
  contentPlainText: Schema.String,
  searchableNames: Schema.String,
}
