import { UrlAsString } from "../../common/primitives.js"
import { defineProperty } from "../property.js"

/** Today's optional `url` on books, films, entities and people. A resource's URL is `resourceUrl`. */
export const WebsiteProperty = defineProperty({
  id: "website",
  value: UrlAsString,
  subjectKinds: ["BOOK", "FILM", "NOTEWORTHY_ENTITY", "NOTEWORTHY_PERSON"],
  scope: "ARTICLE_WIDE",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: ["PERSON"],
})
