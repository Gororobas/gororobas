import { Option, Schema } from "effect"

import { AnimalRole } from "../../common/enums.js"
import {
  CrdtLiteralSet,
  NameInCrdtList,
  OptionalColumn,
  ValidName,
} from "../../common/primitives.js"
import { defineKind } from "./define-kind.js"

const MaterializedAttributes = Schema.Struct({
  scientificNames: OptionalColumn(Schema.Array(ValidName)),
  roles: OptionalColumn(Schema.Array(AnimalRole)),
})

export const WikiAnimalArticle = defineKind({
  Kind: Schema.Literal("ANIMAL"),
  EditableAttributes: Schema.Struct({
    scientificNames: OptionalColumn(Schema.Array(NameInCrdtList)),
    roles: OptionalColumn(CrdtLiteralSet(AnimalRole)),
  }),
  MaterializedAttributes,
  materializeAttributes: (editableAttributes) =>
    MaterializedAttributes.make({
      scientificNames: Option.map(editableAttributes.scientificNames, (names) =>
        names.map((n) => n.value),
      ),
      roles: Option.map(editableAttributes.roles, (roles) => Array.from(roles)),
    }),
})

export type AnimalArticleKind = typeof WikiAnimalArticle.Kind.Type
export type AnimalEditableAttributes = typeof WikiAnimalArticle.EditableAttributes.Type
export type AnimalMaterializedAttributes = typeof WikiAnimalArticle.MaterializedAttributes.Type
export type AnimalEditableArticle = typeof WikiAnimalArticle.EditableArticle.Type
export type AnimalMaterializedRow = typeof WikiAnimalArticle.MaterializedRow.Type
