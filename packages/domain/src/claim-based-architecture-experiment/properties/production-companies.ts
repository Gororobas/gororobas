import { Result } from "effect"

import { defineProperty } from "../property.js"
import { Tmdb } from "../providers/tmdb.js"
import { ArticleOrName, articleOf, articleOrNameToJsonLd } from "../values/article-or-name.js"

/** The companies behind a work (schema.org's `productionCompany`), distinct from `publisher`. */
export const ProductionCompaniesProperty = defineProperty({
  id: "productionCompanies",
  valueSchema: ArticleOrName,
  kinds: ["FILM"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [
    source.tmdb({
      extract: (work) =>
        Tmdb.productionCompanies(work).map((name) => Result.flatMap(Tmdb.name(name), source.found)),
    }),
  ],
  references: { targetKinds: ["NOTEWORTHY_ENTITY", "CONTENT_PRODUCER"], target: articleOf },
  schemaOrg: {
    match: "EXACT",
    encode: (company, { context }) => ({
      productionCompany: articleOrNameToJsonLd(company, context),
    }),
  },
})
