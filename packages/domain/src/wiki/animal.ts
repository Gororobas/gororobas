import { Schema } from "effect"

import { AnimalRole } from "../common/enums.js"
import { CrdtLiteralSet, NameInCrdtList, OptionalColumn, ValidName } from "../common/primitives.js"
import { WikiArticleTranslations } from "./wiki-article-translation.js"

export const AnimalWikiArticleKind = Schema.Literal("ANIMAL")
export type AnimalWikiArticleKind = typeof AnimalWikiArticleKind.Type

export const AnimalEditableAttributes = Schema.Struct({
  scientificNames: OptionalColumn(Schema.Array(NameInCrdtList)),
  roles: OptionalColumn(CrdtLiteralSet(AnimalRole)),
})
export type AnimalEditableAttributes = typeof AnimalEditableAttributes.Type

export const AnimalMaterializedAttributes = Schema.Struct({
  scientificNames: OptionalColumn(Schema.Array(ValidName)),
  roles: OptionalColumn(Schema.Array(AnimalRole)),
})
export type AnimalMaterializedAttributes = typeof AnimalMaterializedAttributes.Type

export const AnimalEditableArticle = Schema.Struct({
  kind: AnimalWikiArticleKind,
  attributes: AnimalEditableAttributes,
  translations: WikiArticleTranslations,
})
export type AnimalEditableArticle = typeof AnimalEditableArticle.Type
