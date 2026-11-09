import { Schema } from "effect"

import { ContentChannelType } from "../../common/enums.js"
import { NonEmptyTrimmedString } from "../../common/primitives.js"
import { defineProperty } from "../property.js"

/**
 * Which channel item a scraped resource is: a YouTube video's ID, an RSS item's GUID. Like the
 * other identifiers it's unique across articles, so scraping a channel again finds the resource it
 * created instead of creating another, and a person adding the same video by hand is offered a
 * merge.
 */
export const ContentChannelItemProperty = defineProperty({
  id: "contentChannelItem",
  valueSchema: Schema.Struct({
    channelType: ContentChannelType,
    externalId: NonEmptyTrimmedString,
  }),
  kinds: ["RESOURCE"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["CONTENT_CHANNELS", "PERSON"],
  extract: {
    CONTENT_CHANNELS: ({ channelType, externalId }) => [{ value: { channelType, externalId } }],
  },
})
