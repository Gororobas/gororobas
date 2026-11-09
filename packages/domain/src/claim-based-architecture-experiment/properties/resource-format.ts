import { ResourceFormat } from "../../common/enums.js"
import { defineProperty } from "../property.js"

export const ResourceFormatProperty = defineProperty({
  id: "resourceFormat",
  valueSchema: ResourceFormat,
  kinds: ["RESOURCE"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "REQUIRED",
  sources: ["PERSON", "CONTENT_CHANNELS"],
  extract: {
    CONTENT_CHANNELS: (item) => [{ value: item.format }],
  },
})
