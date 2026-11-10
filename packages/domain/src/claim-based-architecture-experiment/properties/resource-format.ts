import { ResourceFormat } from "../../common/enums.js"
import { defineProperty } from "../property.js"

export const ResourceFormatProperty = defineProperty({
  id: "resourceFormat",
  valueSchema: ResourceFormat,
  kinds: ["RESOURCE"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "REQUIRED",
  sources: (source) => [
    source.person(),
    source.contentChannels({ extract: (item) => [source.found(item.format)] }),
  ],
})
