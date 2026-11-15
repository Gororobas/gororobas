import { Option, Schema } from "effect"

import { WikiArticleId } from "../../common/ids.js"
import type { JsonLdContext, JsonLdValue } from "../schema-org.js"
import { NameWithNormalizedEquivalence } from "./name-with-normalized-equivalence.js"

/**
 * An article when there is one, a name until there is. Today authors, directors, genres and
 * locations are free text; this lets people link them as articles appear, and lets a curator
 * match a name to an article once one exists.
 */
export const ArticleOrName = Schema.TaggedUnion({
  ARTICLE: { wikiArticleId: WikiArticleId },
  NAME: { name: NameWithNormalizedEquivalence },
})

export type ArticleOrName = typeof ArticleOrName.Type

export const articleOf = (value: ArticleOrName): Option.Option<WikiArticleId> =>
  ArticleOrName.guards.ARTICLE(value) ? Option.some(value.wikiArticleId) : Option.none()

/** For schema.org: a link to our article, or the name until there's one. */
export const articleOrNameToJsonLd = (value: ArticleOrName, context: JsonLdContext): JsonLdValue =>
  ArticleOrName.match(value, {
    ARTICLE: ({ wikiArticleId }) => ({ "@id": context.articleUrl(wikiArticleId) }),
    NAME: ({ name }) => ({ name }),
  })
