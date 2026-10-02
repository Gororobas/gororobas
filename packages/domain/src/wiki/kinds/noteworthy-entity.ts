import { Option, Schema } from "effect"

import { NoteworthyEntityType } from "../../common/enums.js"
import { TagId } from "../../common/ids.js"
import { CrdtBrandedStringSet, OptionalColumn } from "../../common/primitives.js"
import { PartialDate } from "../../common/utils/dates.js"
import { defineKind } from "./define-kind.js"

const MaterializedAttributes = Schema.Struct({
  entityType: NoteworthyEntityType,
  foundedDate: OptionalColumn(PartialDate),
  dissolvedDate: OptionalColumn(PartialDate),
  url: OptionalColumn(Schema.URLFromString),
  tags: OptionalColumn(Schema.Array(TagId)),
})

export const WikiNoteworthyEntityArticle = defineKind({
  EditableTranslationFields: {},
  Kind: Schema.Literal("NOTEWORTHY_ENTITY"),
  EditableAttributes: Schema.Struct({
    ...MaterializedAttributes.fields,
    tags: OptionalColumn(CrdtBrandedStringSet(TagId)),
  }),
  MaterializedAttributes,
  materializeAttributes: (editableAttributes) =>
    MaterializedAttributes.make({
      ...editableAttributes,
      tags: Option.map(editableAttributes.tags, (tags) => Array.from(tags)),
    }),
})

export type NoteworthyEntityArticleKind = typeof WikiNoteworthyEntityArticle.Kind.Type
export type NoteworthyEntityEditableAttributes =
  typeof WikiNoteworthyEntityArticle.EditableAttributes.Type
export type NoteworthyEntityMaterializedAttributes =
  typeof WikiNoteworthyEntityArticle.MaterializedAttributes.Type
export type NoteworthyEntityEditableArticle =
  typeof WikiNoteworthyEntityArticle.EditableArticle.Type
export type NoteworthyEntityMaterializedRow =
  typeof WikiNoteworthyEntityArticle.MaterializedRow.Type
