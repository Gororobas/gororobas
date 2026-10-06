import { Effect, Equal, Record, Schema } from "effect"
import { type LoroDoc } from "loro-crdt"

import { defineCrdtDocument } from "../crdts/define-crdt-document.js"
import { defineCrdtOperations } from "../crdts/define-crdt-operations.js"
import { createLoroDocFromData } from "../crdts/initialize-loro-document.js"
import {
  makeLocaleContentCrdtOperations,
  projectLocaleContentCrdtDocument,
} from "../crdts/locale-content-crdt-operations.js"
import { toLoroValue } from "../crdts/loro-values.js"
import {
  EventMetadata,
  PostMetadata,
  PublicationLocalizedData,
  PublicationSourceData,
} from "./domain.js"

const SetPublicationMetadata = Schema.TaggedStruct("SetPublicationMetadata", {
  value: Schema.Union([PostMetadata, EventMetadata]),
})

const operations = defineCrdtOperations([
  ...makeLocaleContentCrdtOperations("Publication")(PublicationLocalizedData),
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
  const encoded = yield* Schema.encodeEffect(Schema.toCodecJson(PublicationSourceData))(sourceData)
  return createLoroDocFromData(encoded)
})

const projectPublicationCrdtDocument = (document: LoroDoc) => ({
  ...document.toJSON(),
  metadata: document.getMap("metadata").toJSON(),
  locales: projectLocaleContentCrdtDocument(document),
})

export const PublicationCrdt = defineCrdtDocument({
  schema: PublicationSourceData,
  createDocument: createPublicationDocument,
  projectDocument: projectPublicationCrdtDocument,
  applyEdit: operations.applyAttributeEdit,
})
