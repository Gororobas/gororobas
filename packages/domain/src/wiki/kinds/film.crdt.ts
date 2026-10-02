import { Effect, Schema } from "effect"

import { TagId } from "../../common/ids.js"
import { NameInCrdtList, UrlAsString } from "../../common/primitives.js"
import { makeMovableListEditOperations } from "../../crdts/movable-list-edit-operations.js"
import { makeOptionalScalarEditOperations } from "../../crdts/optional-scalar-edit-operations.js"
import { makeStringSetEditOperations } from "../../crdts/string-set-edit-operations.js"
import { defineKindCrdtOperations } from "./define-kind-crdt-operations.js"
import type { FilmEditableAttributes } from "./film.js"

const directorsOperations = makeMovableListEditOperations("Director")({
  ValueSchema: NameInCrdtList.schema.fields.value,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMovableList("directors" satisfies keyof FilmEditableAttributes),
    ),
})

const genresOperations = makeMovableListEditOperations("Genre")({
  ValueSchema: NameInCrdtList.schema.fields.value,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMovableList("genres" satisfies keyof FilmEditableAttributes),
    ),
})

const languagesOperations = makeMovableListEditOperations("Language")({
  ValueSchema: Schema.Trimmed,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMovableList("languages" satisfies keyof FilmEditableAttributes),
    ),
})

const releaseDateOperations = makeOptionalScalarEditOperations("ReleaseDate")({
  ValueSchema: Schema.String,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "releaseDate" satisfies keyof FilmEditableAttributes,
})

const filmTagOperations = makeStringSetEditOperations("FilmTag")({
  ValueSchema: TagId,
  getContainer: (document) =>
    Effect.succeed(document.getMap("attributes").ensureMergeableMap("tags")),
})

const urlOperations = makeOptionalScalarEditOperations("FilmUrl")({
  ValueSchema: UrlAsString,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "url" satisfies keyof FilmEditableAttributes,
})
const countryOperations = makeOptionalScalarEditOperations("FilmCountry")({
  ValueSchema: Schema.String,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "country" satisfies keyof FilmEditableAttributes,
})

export const WikiFilmArticleCrdtOperations = defineKindCrdtOperations([
  ...urlOperations,
  ...countryOperations,
  ...directorsOperations,
  ...releaseDateOperations,
  ...languagesOperations,
  ...genresOperations,
  ...filmTagOperations,
])
export type WikiFilmArticleAttributeEdit = typeof WikiFilmArticleCrdtOperations.AttributeEdit.Type
