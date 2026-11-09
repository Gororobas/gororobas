import { Array as EffectArray, Option } from "effect"

import { defineProperty } from "../property.js"
import { ArticleOrName, articleOf } from "../values/article-or-name.js"

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
  sources: ["PERSON", "WIKIDATA", "GOOGLE_BOOKS", "CONTENT_CHANNELS", "ARTICLE_TEXT_INFERENCE"],
  references: {
    targetKinds: ["NOTEWORTHY_PERSON", "NOTEWORTHY_ENTITY", "CONTENT_PRODUCER"],
    target: articleOf,
  },
  extract: {
    // Linked to our article for the author when we have one, named otherwise.
    WIKIDATA: ({ entity }, { articleWithWikidataId }) =>
      entity.authors.map(({ wikidataId, label }) => ({
        value: Option.match(articleWithWikidataId(wikidataId), {
          onNone: () => ArticleOrName.cases.NAME.make({ name: label }),
          onSome: (wikiArticleId) => ArticleOrName.cases.ARTICLE.make({ wikiArticleId }),
        }),
      })),
    // Editions list the same authors; the first edition listing any gives the order.
    GOOGLE_BOOKS: (result) =>
      Option.toArray(
        EffectArray.findFirst(result.editions, (edition) =>
          EffectArray.isReadonlyArrayNonEmpty(edition.authors),
        ),
      ).flatMap((edition) =>
        edition.authors.map((name) => ({ value: ArticleOrName.cases.NAME.make({ name }) })),
      ),
    // The producer whose channel listed the item.
    CONTENT_CHANNELS: (item) => [
      { value: ArticleOrName.cases.ARTICLE.make({ wikiArticleId: item.producerArticleId }) },
    ],
  },
})
