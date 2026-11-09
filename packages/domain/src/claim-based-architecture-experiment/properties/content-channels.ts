import { Schema } from "effect"

import { ContentChannelType } from "../../common/enums.js"
import { UrlAsString } from "../../common/primitives.js"
import { defineProperty } from "../property.js"

export const ContentChannelsProperty = defineProperty({
  id: "contentChannels",
  value: Schema.Struct({ type: ContentChannelType, url: UrlAsString }),
  subjectKinds: ["CONTENT_PRODUCER"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON"],
})
