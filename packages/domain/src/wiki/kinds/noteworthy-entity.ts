import { Schema } from "effect"

import { NoteworthyEntityType } from "../../common/enums.js"
import { OptionalColumn } from "../../common/primitives.js"
import { PartialDate } from "../../common/utils/dates.js"
import { defineKind } from "./define-kind.js"

const ProjectedAttributes = Schema.Struct({
  entityType: NoteworthyEntityType,
  foundedDate: OptionalColumn(PartialDate),
  dissolvedDate: OptionalColumn(PartialDate),
  url: OptionalColumn(Schema.URLFromString),
})

export const WikiNoteworthyEntityArticle = defineKind({
  EditableTranslationFields: {},
  Kind: Schema.Literal("NOTEWORTHY_ENTITY"),
  EditableAttributes: ProjectedAttributes,
  ProjectedAttributes,
  projectAttributes: (editableAttributes) => editableAttributes,
})

export type NoteworthyEntityArticleKind = typeof WikiNoteworthyEntityArticle.Kind.Type
export type NoteworthyEntityEditableAttributes =
  typeof WikiNoteworthyEntityArticle.EditableAttributes.Type
export type NoteworthyEntityProjectedAttributes =
  typeof WikiNoteworthyEntityArticle.ProjectedAttributes.Type
export type NoteworthyEntityEditableArticle =
  typeof WikiNoteworthyEntityArticle.EditableArticle.Type
export type NoteworthyEntityProjectionRow = typeof WikiNoteworthyEntityArticle.ProjectionRow.Type
