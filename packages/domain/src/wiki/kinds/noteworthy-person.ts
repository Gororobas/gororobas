import { Option, Schema } from "effect"

import { NameInCrdtList, OptionalColumn, ValidName } from "../../common/primitives.js"
import { defineKind } from "./define-kind.js"

const MaterializedAttributes = Schema.Struct({
  names: OptionalColumn(Schema.Array(ValidName)),
  areasOfWork: OptionalColumn(Schema.Array(ValidName)),
  birthDate: OptionalColumn(Schema.String),
  deathDate: OptionalColumn(Schema.String),
  occupations: OptionalColumn(Schema.Array(Schema.String)),
  countries: OptionalColumn(Schema.Array(Schema.String)),
  url: OptionalColumn(Schema.URLFromString),
})

export const WikiNoteworthyPersonArticle = defineKind({
  Kind: Schema.Literal("NOTEWORTHY_PERSON"),
  EditableAttributes: Schema.Struct({
    ...MaterializedAttributes.fields,
    names: OptionalColumn(Schema.Array(NameInCrdtList)),
    areasOfWork: OptionalColumn(Schema.Array(NameInCrdtList)),
  }),
  MaterializedAttributes: MaterializedAttributes,
  materializeAttributes: (editableAttributes) =>
    MaterializedAttributes.make({
      ...editableAttributes,
      names: Option.map(editableAttributes.names, (names) => names.map((item) => item.value)),
      areasOfWork: Option.map(editableAttributes.areasOfWork, (areasOfWork) =>
        areasOfWork.map((item) => item.value),
      ),
    }),
})

export type NoteworthyPersonArticleKind = typeof WikiNoteworthyPersonArticle.Kind.Type
export type NoteworthyPersonEditableAttributes =
  typeof WikiNoteworthyPersonArticle.EditableAttributes.Type
export type NoteworthyPersonMaterializedAttributes =
  typeof WikiNoteworthyPersonArticle.MaterializedAttributes.Type
export type NoteworthyPersonEditableArticle =
  typeof WikiNoteworthyPersonArticle.EditableArticle.Type
export type NoteworthyPersonMaterializedRow =
  typeof WikiNoteworthyPersonArticle.MaterializedRow.Type
