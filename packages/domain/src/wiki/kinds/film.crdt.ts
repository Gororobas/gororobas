import { Effect, Schema } from "effect"

import { NameInCrdtList } from "../../common/primitives.js"
import { makeMovableListEditOperations } from "../../crdts/movable-list-edit-operations.js"
import { makeOptionalScalarEditOperations } from "../../crdts/optional-scalar-edit-operations.js"
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

export const WikiFilmArticleCrdtOperations = defineKindCrdtOperations([
  ...directorsOperations,
  ...releaseDateOperations,
  ...languagesOperations,
  ...genresOperations,
])
export type WikiFilmArticleAttributeEdit = typeof WikiFilmArticleCrdtOperations.AttributeEdit.Type
