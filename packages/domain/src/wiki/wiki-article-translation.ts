import { Schema } from "effect"

import { GrammaticalGender, SupportedLanguage } from "../common/enums.js"
import { WikiArticleId } from "../common/ids.js"
import { NameInCrdtList, OptionalColumn, ValidName } from "../common/primitives.js"
import { TiptapDocument } from "../rich-text/domain.js"

export const WikiArticleEditableTranslation = Schema.Struct({
  commonNames: Schema.NonEmptyArray(NameInCrdtList),
  content: OptionalColumn(TiptapDocument),
  grammaticalGender: OptionalColumn(GrammaticalGender),
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
  commonNames: Schema.fromJsonString(Schema.Array(ValidName)),
  content: OptionalColumn(Schema.fromJsonString(TiptapDocument)),
  wikiArticleId: WikiArticleId,
  language: SupportedLanguage,
  contentPlainText: Schema.String,
  searchableNames: Schema.String,
}
