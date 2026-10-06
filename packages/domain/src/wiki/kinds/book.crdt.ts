import { Effect, Schema } from "effect"

import { GoogleBooksVolumeId } from "../../common/external-identifiers.js"
import { TagId } from "../../common/ids.js"
import { IntNonNegative, NameInCrdtList } from "../../common/primitives.js"
import { defineCrdtOperations } from "../../crdts/define-crdt-operations.js"
import { makeMovableListEditOperations } from "../../crdts/movable-list-edit-operations.js"
import { makeOptionalScalarEditOperations } from "../../crdts/optional-scalar-edit-operations.js"
import { makeStringSetEditOperations } from "../../crdts/string-set-edit-operations.js"
import type { BookEditableAttributes } from "./book.js"

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

const urlOperations = makeOptionalScalarEditOperations("PublisherUrl")({
  ValueSchema: Schema.URLFromString,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "url" satisfies keyof BookEditableAttributes,
})

const bookTagOperations = makeStringSetEditOperations("BookTag")({
  ValueSchema: TagId,
  getContainer: (document) =>
    Effect.succeed(document.getMap("attributes").ensureMergeableMap("tags")),
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

const googleBooksVolumeIdOperations = makeOptionalScalarEditOperations("GoogleBooksVolumeId")({
  ValueSchema: GoogleBooksVolumeId,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "googleBooksVolumeId" satisfies keyof BookEditableAttributes,
})

export const WikiBookArticleCrdtOperations = defineCrdtOperations([
  ...authorsOperations,
  ...bookTagOperations,
  ...editionOperations,
  ...googleBooksVolumeIdOperations,
  ...isbn10Operations,
  ...isbn13Operations,
  ...languageOperations,
  ...pageCountOperations,
  ...publicationDateOperations,
  ...publisherOperations,
  ...urlOperations,
])

export type WikiBookArticleAttributeEdit = typeof WikiBookArticleCrdtOperations.AttributeEdit.Type
