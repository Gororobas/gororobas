import { Option, Schema } from "effect"

import { NameInCrdtList, OptionalColumn, ValidName } from "../../common/primitives.js"
import { defineKind } from "./define-kind.js"

const MaterializedAttributes = Schema.Struct({
  directors: OptionalColumn(Schema.Array(ValidName)),
  releaseDate: OptionalColumn(Schema.String),
  runtimeMinutes: OptionalColumn(Schema.Int),
  productionCompanies: OptionalColumn(Schema.Array(Schema.String)),
  countries: OptionalColumn(Schema.Array(Schema.String)),
  languages: OptionalColumn(Schema.Array(Schema.String)),
  genres: OptionalColumn(Schema.Array(Schema.String)),
})

export const WikiFilmArticle = defineKind({
  Kind: Schema.Literal("FILM"),
  EditableAttributes: Schema.Struct({
    ...MaterializedAttributes.fields,
    directors: OptionalColumn(Schema.Array(NameInCrdtList)),
  }),
  MaterializedAttributes,
  materializeAttributes: (editableAttributes) =>
    MaterializedAttributes.make({
      ...editableAttributes,
      directors: Option.map(editableAttributes.directors, (directors) =>
        directors.map((director) => director.value),
      ),
    }),
})

export type FilmArticleKind = typeof WikiFilmArticle.Kind.Type
export type FilmEditableAttributes = typeof WikiFilmArticle.EditableAttributes.Type
export type FilmMaterializedAttributes = typeof WikiFilmArticle.MaterializedAttributes.Type
export type FilmEditableArticle = typeof WikiFilmArticle.EditableArticle.Type
export type FilmMaterializedRow = typeof WikiFilmArticle.MaterializedRow.Type
