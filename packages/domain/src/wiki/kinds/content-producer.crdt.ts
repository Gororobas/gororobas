import { Effect, Schema } from "effect"

import { ContentChannelType } from "../../common/enums.js"
import { NameInCrdtList } from "../../common/primitives.js"
import { makeMovableListEditOperations } from "../../crdts/movable-list-edit-operations.js"
import type { ContentProducerEditableAttributes } from "./content-producer.js"
import { defineKindCrdtOperations } from "./define-kind-crdt-operations.js"

const contentChannel = Schema.Struct({
  type: ContentChannelType,
  url: Schema.URLFromString,
})

const namesOperations = makeMovableListEditOperations("Name")({
  ValueSchema: NameInCrdtList.schema.fields.value,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMovableList("names" satisfies keyof ContentProducerEditableAttributes),
    ),
})

const channelsOperations = makeMovableListEditOperations("Channel")({
  ValueSchema: contentChannel,
  getContainer: (document) =>
    Effect.succeed(
      document
        .getMap("attributes")
        .ensureMergeableMovableList("channels" satisfies keyof ContentProducerEditableAttributes),
    ),
  encodeValue: (value) =>
    Effect.succeed({
      type: value.type,
      url: value.url.toString(),
    }),
})

export const WikiContentProducerArticleCrdtOperations = defineKindCrdtOperations([
  ...namesOperations,
  ...channelsOperations,
])
export type WikiContentProducerArticleAttributeEdit =
  typeof WikiContentProducerArticleCrdtOperations.AttributeEdit.Type
