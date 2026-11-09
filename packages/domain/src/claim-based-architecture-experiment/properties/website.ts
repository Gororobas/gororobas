import { UrlAsString } from "../../common/primitives.js"
import { defineProperty } from "../property.js"

/** Today's optional `url` on books, films, entities and people. A resource's URL is `resourceUrl`. */
export const WebsiteProperty = defineProperty({
  id: "website",
  valueSchema: UrlAsString,
  kinds: ["BOOK", "FILM", "NOTEWORTHY_ENTITY", "NOTEWORTHY_PERSON"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON"],
})
