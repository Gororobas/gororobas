import { Option, Schema } from "effect"

import {
  ItemInCrdtList,
  NameInCrdtList,
  OptionalColumn,
  TimestampColumn,
  ValidName,
} from "../../common/primitives.js"
import { defineKind } from "./define-kind.js"

const MaterializedAttributes = Schema.Struct({
  directors: OptionalColumn(Schema.Array(ValidName)),
  releaseDate: OptionalColumn(TimestampColumn),
  languages: OptionalColumn(Schema.Array(Schema.String)),
  genres: OptionalColumn(Schema.Array(ValidName)),
})

export const WikiFilmArticle = defineKind({
  Kind: Schema.Literal("FILM"),
  EditableAttributes: Schema.Struct({
    ...MaterializedAttributes.fields,
    directors: OptionalColumn(Schema.Array(NameInCrdtList)),
    languages: OptionalColumn(
      Schema.Array(
        Schema.Struct({
          ...ItemInCrdtList.fields,
          value: Schema.Trimmed,
        }),
      ),
    ),
    genres: OptionalColumn(Schema.Array(NameInCrdtList)),
  }),
  MaterializedAttributes,
  materializeAttributes: (editableAttributes) =>
    MaterializedAttributes.make({
      ...editableAttributes,
      directors: Option.map(editableAttributes.directors, (directors) =>
        directors.map((director) => director.value),
      ),
      languages: Option.map(editableAttributes.languages, (languages) =>
        languages.map((language) => language.value),
      ),
      genres: Option.map(editableAttributes.genres, (genres) => genres.map((genre) => genre.value)),
    }),
})

export type FilmArticleKind = typeof WikiFilmArticle.Kind.Type
export type FilmEditableAttributes = typeof WikiFilmArticle.EditableAttributes.Type
export type FilmMaterializedAttributes = typeof WikiFilmArticle.MaterializedAttributes.Type
export type FilmEditableArticle = typeof WikiFilmArticle.EditableArticle.Type
export type FilmMaterializedRow = typeof WikiFilmArticle.MaterializedRow.Type
