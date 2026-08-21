import { Schema } from "effect"

import { GrammaticalGender } from "../common/enums.js"
import { NameInCrdtList, OptionalColumn } from "../common/primitives.js"
import { TiptapDocument } from "../rich-text/domain.js"

export const WikiArticleTranslation = Schema.Struct({
  commonNames: Schema.NonEmptyArray(NameInCrdtList),
  content: OptionalColumn(TiptapDocument),
  grammaticalGender: OptionalColumn(GrammaticalGender),
})
export type WikiArticleTranslation = typeof WikiArticleTranslation.Type

export const WikiArticleTranslations = Schema.Struct({
  en: Schema.optional(WikiArticleTranslation),
  es: Schema.optional(WikiArticleTranslation),
  pt: Schema.optional(WikiArticleTranslation),
})
export type WikiArticleTranslations = typeof WikiArticleTranslations.Type
