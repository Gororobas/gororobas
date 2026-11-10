import { Option, Schema } from "effect"

import { WikiArticleId } from "../../common/ids.js"
import type { JsonLdContext, JsonLdValue } from "../schema-org.js"
import { FoldedName } from "./folded-name.js"

/**
 * An article when there is one, a name until there is. Today authors, directors, genres and
 * locations are free text; this lets people link them as articles appear, and lets text inference
 * link them when a name matches an article.
 */
export const ArticleOrName = Schema.TaggedUnion({
  ARTICLE: { wikiArticleId: WikiArticleId },
  NAME: { name: FoldedName },
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
