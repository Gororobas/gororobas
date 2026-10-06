import { Option, Schema } from "effect"

import { NameInCrdtList, OptionalColumn, ValidName } from "../../common/primitives.js"
import { PartialDate } from "../../common/utils/dates.js"
import { defineKind } from "./define-kind.js"

const ProjectedAttributes = Schema.Struct({
  names: OptionalColumn(Schema.Array(ValidName)),
  areasOfWork: OptionalColumn(Schema.Array(ValidName)),
  birthDate: OptionalColumn(PartialDate),
  deathDate: OptionalColumn(PartialDate),
  occupations: OptionalColumn(Schema.Array(Schema.String)),
  location: OptionalColumn(ValidName),
  url: OptionalColumn(Schema.URLFromString),
})

export const WikiNoteworthyPersonArticle = defineKind({
  EditableTranslationFields: {},
  Kind: Schema.Literal("NOTEWORTHY_PERSON"),
  EditableAttributes: Schema.Struct({
    ...ProjectedAttributes.fields,
    names: OptionalColumn(Schema.Array(NameInCrdtList)),
    areasOfWork: OptionalColumn(Schema.Array(NameInCrdtList)),
  }),
  ProjectedAttributes: ProjectedAttributes,
  projectAttributes: (editableAttributes) =>
    ProjectedAttributes.make({
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
export type NoteworthyPersonProjectedAttributes =
  typeof WikiNoteworthyPersonArticle.ProjectedAttributes.Type
export type NoteworthyPersonEditableArticle =
  typeof WikiNoteworthyPersonArticle.EditableArticle.Type
export type NoteworthyPersonProjectionRow = typeof WikiNoteworthyPersonArticle.ProjectionRow.Type
