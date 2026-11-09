import { UrlAsString } from "../../common/primitives.js"
import { defineProperty } from "../property.js"

/** Where the resource is, which makes it the resource. Required, unlike other kinds' `website`. */
export const ResourceUrlProperty = defineProperty({
  id: "resourceUrl",
  valueSchema: UrlAsString,
  kinds: ["RESOURCE"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "REQUIRED",
  sources: ["PERSON", "CONTENT_CHANNELS"],
  extract: {
    CONTENT_CHANNELS: (item) => [{ value: item.url }],
  },
})
