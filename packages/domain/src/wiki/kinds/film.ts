import { Option, Schema } from "effect"

import {
  ItemInCrdtList,
  NameInCrdtList,
  OptionalColumn,
  UrlAsString,
  ValidName,
} from "../../common/primitives.js"
import { PartialDate } from "../../common/utils/dates.js"
import { defineKind } from "./define-kind.js"

const ProjectedAttributes = Schema.Struct({
  url: OptionalColumn(UrlAsString),
  country: OptionalColumn(Schema.String),
  directors: OptionalColumn(Schema.Array(ValidName)),
  releaseDate: OptionalColumn(PartialDate),
  languages: OptionalColumn(Schema.Array(Schema.String)),
  genres: OptionalColumn(Schema.Array(ValidName)),
})

export const WikiFilmArticle = defineKind({
  EditableTranslationFields: {},
  Kind: Schema.Literal("FILM"),
  EditableAttributes: Schema.Struct({
    ...ProjectedAttributes.fields,
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
  ProjectedAttributes,
  projectAttributes: (editableAttributes) =>
    ProjectedAttributes.make({
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
export type FilmProjectedAttributes = typeof WikiFilmArticle.ProjectedAttributes.Type
export type FilmEditableArticle = typeof WikiFilmArticle.EditableArticle.Type
export type FilmProjectionRow = typeof WikiFilmArticle.ProjectionRow.Type
