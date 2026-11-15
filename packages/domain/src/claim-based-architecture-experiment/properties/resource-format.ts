import { ResourceFormat } from "../../common/enums.js"
import { defineCanonicalProperty } from "../property.js"

export const ResourceFormatProperty = defineCanonicalProperty({
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
