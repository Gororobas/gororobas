/**
 * Relations between wiki articles are derived, never contributor-authored: they live outside the
 * article's LoroDoc in `wiki_article_relations`, one row per source that found them.
 */
import { Option, Schema } from "effect"

import { SupportedLanguage } from "../common/enums.js"
import { WikiArticleId } from "../common/ids.js"
import { makeLink, makeLinkRow } from "../links/domain.js"
import { entityReferenceLinks, type EntityReferenceLink } from "../links/entity-reference-links.js"
import { WikiArticleQueriedCardData, type WikiArticleEditableData } from "./wiki-article.js"

export const WikiArticleRelationRow = makeLinkRow({
  wikiArticleId: WikiArticleId,
  relatedWikiArticleId: WikiArticleId,
}).pipe(Schema.toTaggedUnion("source"))

export type WikiArticleRelationRow = typeof WikiArticleRelationRow.Type

/** Which article's content established a relation, seen from the article listing its relations. */
export const WikiArticleRelationDirection = Schema.Literals([
  /** The listing article's content relates it to the other article, so the evidence is in it. */
  "OUTGOING",
  /** The other article's content relates it to the listing article, so the evidence is in the other article. */
  "INCOMING",
])

export type WikiArticleRelationDirection = typeof WikiArticleRelationDirection.Type

export const WikiArticleRelationLink = makeLink({
  direction: WikiArticleRelationDirection,
}).pipe(Schema.toTaggedUnion("source"))

export type WikiArticleRelationLink = typeof WikiArticleRelationLink.Type

/** A related article's card, with every link relating it to the listing article in either direction. */
export const RelatedWikiArticle = Schema.Struct({
  ...WikiArticleQueriedCardData.fields,
  links: Schema.NonEmptyArray(WikiArticleRelationLink),
})

export type RelatedWikiArticle = typeof RelatedWikiArticle.Type

/** Other wiki articles referenced from any of the article's translations. */
export const entityReferenceRelations = (
  article: WikiArticleEditableData,
  ownId: WikiArticleId,
): ReadonlyArray<EntityReferenceLink> =>
  entityReferenceLinks(
    SupportedLanguage.literals.flatMap((language) =>
      Option.toArray(Option.fromUndefinedOr(article.translations[language])).flatMap(
        (translation) =>
          Option.toArray(translation.content).map((content) => ({
            path: ["translations", language, "content"] as const,
            content,
          })),
      ),
    ),
  ).filter((link) => link.wikiArticleId !== ownId)
