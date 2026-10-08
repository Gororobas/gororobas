import { Effect, Schema } from "effect"

import { defineCrdtDocument } from "../crdts/define-crdt-document.js"
import { defineCrdtOperations } from "../crdts/define-crdt-operations.js"
import { createLoroDocFromData } from "../crdts/initialize-loro-document.js"
import {
  makeSourceContentCrdtOperations,
  SourceContentStorageFields,
  projectSourceContentCrdtDocument,
} from "../crdts/source-content-crdt-operations.js"
import { SourceCommentData } from "./domain.js"

const CommentCrdtData = Schema.Struct(SourceContentStorageFields).pipe(
  Schema.decodeTo(Schema.toType(SourceCommentData)),
)

const operations = defineCrdtOperations(makeSourceContentCrdtOperations("Comment"))

export const CommentEdit = operations.AttributeEdit
export type CommentEdit = typeof CommentEdit.Type

const createCommentDocument = Effect.fn("createCommentCrdtDocument")(function* (
  sourceData: SourceCommentData,
) {
  const encoded = yield* Schema.encodeEffect(Schema.toCodecJson(CommentCrdtData))(sourceData)

  return createLoroDocFromData(encoded)
})

const projectCommentCrdtDocument = projectSourceContentCrdtDocument

export const CommentCrdt = defineCrdtDocument({
  schema: CommentCrdtData,
  createDocument: createCommentDocument,
  projectDocument: projectCommentCrdtDocument,
  applyEdit: operations.applyAttributeEdit,
})
