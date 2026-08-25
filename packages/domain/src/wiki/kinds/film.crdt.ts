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

const releaseDateOperations = makeOptionalScalarEditOperations("ReleaseDate")({
  ValueSchema: Schema.String,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "releaseDate" satisfies keyof FilmEditableAttributes,
})

const runtimeMinutesOperations = makeOptionalScalarEditOperations("RuntimeMinutes")({
  ValueSchema: Schema.Int,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "runtimeMinutes" satisfies keyof FilmEditableAttributes,
})

const productionCompaniesOperations = makeOptionalScalarEditOperations("ProductionCompanies")({
  ValueSchema: Schema.Array(Schema.String),
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "productionCompanies" satisfies keyof FilmEditableAttributes,
})

const countriesOperations = makeOptionalScalarEditOperations("Countries")({
  ValueSchema: Schema.Array(Schema.String),
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "countries" satisfies keyof FilmEditableAttributes,
})

const languagesOperations = makeOptionalScalarEditOperations("Languages")({
  ValueSchema: Schema.Array(Schema.String),
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "languages" satisfies keyof FilmEditableAttributes,
})

const genresOperations = makeOptionalScalarEditOperations("Genres")({
  ValueSchema: Schema.Array(Schema.String),
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "genres" satisfies keyof FilmEditableAttributes,
})

export const WikiFilmArticleCrdtOperations = defineKindCrdtOperations([
  ...directorsOperations,
  ...releaseDateOperations,
  ...runtimeMinutesOperations,
  ...productionCompaniesOperations,
  ...countriesOperations,
  ...languagesOperations,
  ...genresOperations,
])
export type WikiFilmArticleAttributeEdit = typeof WikiFilmArticleCrdtOperations.AttributeEdit.Type
