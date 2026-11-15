import { Schema } from "effect"

import { ContentChannelType } from "../../common/enums.js"
import { UrlAsString } from "../../common/primitives.js"
import { defineCanonicalProperty } from "../property.js"

export const ContentChannelsProperty = defineCanonicalProperty({
  id: "contentChannels",
  valueSchema: Schema.Struct({ type: ContentChannelType, url: UrlAsString }),
  kinds: ["CONTENT_PRODUCER"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  sources: (source) => [source.person()],
})
