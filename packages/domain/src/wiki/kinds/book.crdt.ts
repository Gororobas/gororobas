import { Effect, Schema } from "effect"

import { IntNonNegative, NameInCrdtList } from "../../common/primitives.js"
import { makeMovableListEditOperations } from "../../crdts/movable-list-edit-operations.js"
import { makeOptionalScalarEditOperations } from "../../crdts/optional-scalar-edit-operations.js"
import type { BookEditableAttributes } from "./book.js"
import { defineKindCrdtOperations } from "./define-kind-crdt-operations.js"

const authorsOperations = makeMovableListEditOperations("Author")({
  ValueSchema: NameInCrdtList.schema.fields.value,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMovableList("authors" satisfies keyof BookEditableAttributes),
    ),
})

const publisherOperations = makeOptionalScalarEditOperations("Publisher")({
  ValueSchema: Schema.String,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "publisher" satisfies keyof BookEditableAttributes,
})

const publicationDateOperations = makeOptionalScalarEditOperations("PublicationDate")({
  ValueSchema: Schema.String,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "publicationDate" satisfies keyof BookEditableAttributes,
})

const isbn10Operations = makeOptionalScalarEditOperations("Isbn10")({
  ValueSchema: Schema.String,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "isbn10" satisfies keyof BookEditableAttributes,
})

const isbn13Operations = makeOptionalScalarEditOperations("Isbn13")({
  ValueSchema: Schema.String,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "isbn13" satisfies keyof BookEditableAttributes,
})

const editionOperations = makeOptionalScalarEditOperations("Edition")({
  ValueSchema: Schema.String,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "edition" satisfies keyof BookEditableAttributes,
})

const languageOperations = makeOptionalScalarEditOperations("Language")({
  ValueSchema: Schema.String,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "language" satisfies keyof BookEditableAttributes,
})

const pageCountOperations = makeOptionalScalarEditOperations("PageCount")({
  ValueSchema: IntNonNegative,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "pageCount" satisfies keyof BookEditableAttributes,
})

export const WikiBookArticleCrdtOperations = defineKindCrdtOperations([
  ...authorsOperations,
  ...publisherOperations,
  ...publicationDateOperations,
  ...isbn10Operations,
  ...isbn13Operations,
  ...editionOperations,
  ...languageOperations,
  ...pageCountOperations,
])
export type WikiBookArticleAttributeEdit = typeof WikiBookArticleCrdtOperations.AttributeEdit.Type
