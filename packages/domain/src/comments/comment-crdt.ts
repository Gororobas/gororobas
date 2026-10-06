import { Effect, Schema } from "effect"
import { type LoroDoc } from "loro-crdt"

import { defineCrdtDocument } from "../crdts/define-crdt-document.js"
import { defineCrdtOperations } from "../crdts/define-crdt-operations.js"
import { createLoroDocFromData } from "../crdts/initialize-loro-document.js"
import {
  makeLocaleContentCrdtOperations,
  projectLocaleContentCrdtDocument,
} from "../crdts/locale-content-crdt-operations.js"
import { CommentLocalizedData, SourceCommentData } from "./domain.js"

const operations = defineCrdtOperations(
  makeLocaleContentCrdtOperations("Comment")(CommentLocalizedData),
)

export const CommentEdit = operations.AttributeEdit
export type CommentEdit = typeof CommentEdit.Type

const createCommentDocument = Effect.fn("createCommentCrdtDocument")(function* (
  sourceData: SourceCommentData,
) {
  const encoded = yield* Schema.encodeEffect(Schema.toCodecJson(SourceCommentData))(sourceData)

  return createLoroDocFromData(encoded)
})

const projectCommentCrdtDocument = (document: LoroDoc) => ({
  ...document.toJSON(),
  locales: projectLocaleContentCrdtDocument(document),
})

export const CommentCrdt = defineCrdtDocument({
  schema: SourceCommentData,
  createDocument: createCommentDocument,
  projectDocument: projectCommentCrdtDocument,
  applyEdit: operations.applyAttributeEdit,
})
