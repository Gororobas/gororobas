import { Option, Schema } from "effect"

import { NoteworthyEntityType } from "../../common/enums.js"
import { NameInCrdtList, OptionalColumn, ValidName } from "../../common/primitives.js"
import { defineKind } from "./define-kind.js"

const MaterializedAttributes = Schema.Struct({
  entityType: NoteworthyEntityType,
  names: OptionalColumn(Schema.Array(ValidName)),
  areasOfWork: OptionalColumn(Schema.Array(ValidName)),
  foundedDate: OptionalColumn(Schema.String),
  dissolvedDate: OptionalColumn(Schema.String),
  url: OptionalColumn(Schema.URLFromString),
})

export const WikiNoteworthyEntityArticle = defineKind({
  Kind: Schema.Literal("NOTEWORTHY_ENTITY"),
  EditableAttributes: Schema.Struct({
    ...MaterializedAttributes.fields,
    names: OptionalColumn(Schema.Array(NameInCrdtList)),
    areasOfWork: OptionalColumn(Schema.Array(NameInCrdtList)),
  }),
  MaterializedAttributes,
  materializeAttributes: (editableAttributes) =>
    MaterializedAttributes.make({
      ...editableAttributes,
      names: Option.map(editableAttributes.names, (names) => names.map((name) => name.value)),
      areasOfWork: Option.map(editableAttributes.areasOfWork, (areasOfWork) =>
        areasOfWork.map((item) => item.value),
      ),
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
