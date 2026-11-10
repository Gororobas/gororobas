import { Array as EffectArray, Option, Result } from "effect"

import { defineProperty } from "../property.js"
import { Wikidata, WikidataProperty } from "../providers/wikidata.js"
import { ArticleOrName, articleOf, articleOrNameToJsonLd } from "../values/article-or-name.js"

/**
 * Who wrote or made a work, in credit order: a book's, an essay's, a video's or a podcast's.
 * Wikidata's P50, schema.org's `author`. A role, not a kind: one property for every kind that has
 * authors, so a person's page lists all their works with one query. Other roles (translators,
 * directors, hosts) are properties of their own, for the same reason.
 */
export const AuthorsProperty = defineProperty({
  id: "authors",
  valueSchema: ArticleOrName,
  kinds: ["BOOK", "RESOURCE"],
  scope: "UNIVERSAL",
  cardinality: "LIST",
  mergeStrategy: "ALL_SOURCES",
  sources: (source) => [
    source.person(),
    source.wikidata({
      // Linked to our article for the author when we have one, named after its label otherwise.
      extract: (entity, context) =>
        Wikidata.statements(entity, WikidataProperty.AUTHOR).map((statement) =>
          Result.flatMap(
            Wikidata.articleOrName(statement, { context, language: "pt" }),
            source.found,
          ),
        ),
    }),
    source.googleBooks({
      // Editions list the same authors; the first edition listing any gives the order.
      extract: (result) =>
        Option.toArray(
          EffectArray.findFirst(result.editions, (edition) =>
            EffectArray.isReadonlyArrayNonEmpty(edition.authors),
          ),
        ).flatMap((edition) =>
          edition.authors.map((name) => source.found(ArticleOrName.cases.NAME.make({ name }))),
        ),
    }),
    source.contentChannels({
      // The producer whose channel listed the item.
      extract: (item) => [
        source.found(ArticleOrName.cases.ARTICLE.make({ wikiArticleId: item.producerArticleId })),
      ],
    }),
    source.articleTextInference(),
  ],
  references: {
    targetKinds: ["NOTEWORTHY_PERSON", "NOTEWORTHY_ENTITY", "CONTENT_PRODUCER"],
    target: articleOf,
  },
  schemaOrg: {
    match: "EXACT",
    encode: (author, { context }) => ({ author: articleOrNameToJsonLd(author, context) }),
  },
})
