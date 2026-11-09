import { UrlAsString } from "../../common/primitives.js"
import { defineProperty } from "../property.js"

/** Where the resource is, which makes it the resource. Required, unlike other kinds' `website`. */
export const ResourceUrlProperty = defineProperty({
  id: "resourceUrl",
  value: UrlAsString,
  subjectKinds: ["RESOURCE"],
  scope: "ARTICLE_WIDE",
  cardinality: "ONE",
  presence: "REQUIRED",
  sources: ["PERSON"],
})
