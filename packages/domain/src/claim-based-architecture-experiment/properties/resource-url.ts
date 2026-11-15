import { UrlAsString } from "../../common/primitives.js"
import { defineCanonicalProperty } from "../property.js"

/** Where the resource is, which makes it the resource. Required, unlike other kinds' `website`. */
export const ResourceUrlProperty = defineCanonicalProperty({
  id: "resourceUrl",
  valueSchema: UrlAsString,
  kinds: ["RESOURCE"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "REQUIRED",
  sources: (source) => [
    source.person(),
    source.contentChannels({ extract: (item) => [source.found(item.url)] }),
  ],
})
