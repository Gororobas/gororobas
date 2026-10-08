import { Effect, Equal, Record, Schema } from "effect"
import { type LoroDoc } from "loro-crdt"

import { defineCrdtDocument } from "../crdts/define-crdt-document.js"
import { defineCrdtOperations } from "../crdts/define-crdt-operations.js"
import { createLoroDocFromData } from "../crdts/initialize-loro-document.js"
import { toLoroValue } from "../crdts/loro-values.js"
import {
  makeSourceContentCrdtOperations,
  SourceContentStorageFields,
  projectSourceContentCrdtDocument,
} from "../crdts/source-content-crdt-operations.js"
import { EventMetadata, PostMetadata, PublicationSourceData } from "./domain.js"

const SetPublicationMetadata = Schema.TaggedStruct("SetPublicationMetadata", {
  value: Schema.Union([PostMetadata, EventMetadata]),
})

const PublicationCrdtData = Schema.Union([
  Schema.Struct({ ...SourceContentStorageFields, metadata: PostMetadata }),
  Schema.Struct({ ...SourceContentStorageFields, metadata: EventMetadata }),
]).pipe(Schema.decodeTo(Schema.toType(PublicationSourceData)))

const operations = defineCrdtOperations([
  ...makeSourceContentCrdtOperations("Publication"),
  {
    message: SetPublicationMetadata,
    handler: Effect.fn(function* (document: LoroDoc, payload: typeof SetPublicationMetadata.Type) {
      const encoded: Schema.JsonObject = yield* Schema.encodeEffect(
        SetPublicationMetadata.fields.value,
      )(payload.value)
      const metadata = document.getMap("metadata")
      metadata.keys().forEach((key) => {
        if (!(key in encoded)) metadata.delete(key)
      })
      Record.toEntries(encoded).forEach(([key, value]) => {
        if (!Equal.equals(metadata.get(key), value)) metadata.set(key, toLoroValue(value))
      })
    }),
  },
])

export const PublicationEdit = operations.AttributeEdit
export type PublicationEdit = typeof PublicationEdit.Type

const createPublicationDocument = Effect.fn("createPublicationCrdtDocument")(function* (
  sourceData: PublicationSourceData,
) {
  const encoded = yield* Schema.encodeEffect(Schema.toCodecJson(PublicationCrdtData))(sourceData)
  return createLoroDocFromData(encoded)
})

const projectPublicationCrdtDocument = (document: LoroDoc) => ({
  ...projectSourceContentCrdtDocument(document),
  metadata: document.getMap("metadata").toJSON(),
})

export const PublicationCrdt = defineCrdtDocument({
  schema: PublicationCrdtData,
  createDocument: createPublicationDocument,
  projectDocument: projectPublicationCrdtDocument,
  applyEdit: operations.applyAttributeEdit,
})
