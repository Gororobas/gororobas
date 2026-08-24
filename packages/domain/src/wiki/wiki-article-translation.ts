import { Schema } from "effect"

import { GrammaticalGender, Locale } from "../common/enums.js"
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

/** Per-locale materialization of contributor-editable names and content. */
export const WikiArticleTranslationMaterializedRow = Schema.Struct({
  ...WikiArticleEditableTranslation.fields,
  commonNames: Schema.Array(ValidName),
  wikiArticleId: WikiArticleId,
  locale: Locale,
  contentPlainText: Schema.String,
  searchableNames: Schema.String,
})
export type WikiArticleTranslationMaterializedRow =
  typeof WikiArticleTranslationMaterializedRow.Type
