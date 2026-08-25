import { Option, Schema } from "effect"

import { ContentChannelType } from "../../common/enums.js"
import {
  ItemInCrdtList,
  NameInCrdtList,
  OptionalColumn,
  ValidName,
} from "../../common/primitives.js"
import { defineKind } from "./define-kind.js"

const ContentChannel = Schema.Struct({
  type: ContentChannelType,
  url: Schema.URLFromString,
})

const MaterializedAttributes = Schema.Struct({
  names: OptionalColumn(Schema.Array(ValidName)),
  channels: OptionalColumn(Schema.Array(ContentChannel)),
})

export const WikiContentProducerArticle = defineKind({
  Kind: Schema.Literal("CONTENT_PRODUCER"),
  EditableAttributes: Schema.Struct({
    names: OptionalColumn(Schema.Array(NameInCrdtList)),
    channels: OptionalColumn(
      Schema.Array(
        Schema.Struct({
          ...ItemInCrdtList.fields,
          value: ContentChannel,
        }),
      ),
    ),
  }),
  MaterializedAttributes,
  materializeAttributes: (editableAttributes) =>
    MaterializedAttributes.make({
      names: Option.map(editableAttributes.names, (names) => names.map((name) => name.value)),
      channels: Option.map(editableAttributes.channels, (channels) =>
        channels.map((channel) => channel.value),
      ),
    }),
})

export type ContentProducerArticleKind = typeof WikiContentProducerArticle.Kind.Type
export type ContentProducerEditableAttributes =
  typeof WikiContentProducerArticle.EditableAttributes.Type
export type ContentProducerMaterializedAttributes =
  typeof WikiContentProducerArticle.MaterializedAttributes.Type
export type ContentProducerEditableArticle = typeof WikiContentProducerArticle.EditableArticle.Type
export type ContentProducerMaterializedRow = typeof WikiContentProducerArticle.MaterializedRow.Type
