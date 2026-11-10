import { Option, Result } from "effect"

import { PartialDate } from "../../common/utils/dates.js"
import { defineProperty } from "../property.js"
import { Wikidata, WikidataProperty } from "../providers/wikidata.js"
import { partialDateToIso } from "../schema-org.js"

/**
 * When a work came out: a book, a resource, a film (today's `publicationDate` and `releaseDate`),
 * named as schema.org names it for every kind of work.
 *
 * Today's book attributes describe one edition (publisher, date, pages, edition label), while
 * Google Books returns many (`bookEditions`). Deciding whether a BOOK article is a work or an
 * edition would decide whether these stay, or move into `bookEditions` as people-authored values.
 */
export const DatePublishedProperty = defineProperty({
  id: "datePublished",
  valueSchema: PartialDate,
  kinds: ["BOOK", "RESOURCE", "FILM"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.person(),
    source.wikidata({
      extract: (entity) =>
        Wikidata.statements(entity, WikidataProperty.PUBLICATION_DATE).map((statement) =>
          Result.flatMap(Wikidata.time(statement), source.found),
        ),
    }),
    source.contentChannels({
      extract: (item) => Option.toArray(Option.fromNullishOr(item.publishedOn)).map(source.found),
    }),
  ],
  schemaOrg: { match: "EXACT", encode: (date) => ({ datePublished: partialDateToIso(date) }) },
})
