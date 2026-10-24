/**
 * Relations between wiki articles are derived, never contributor-authored: they live outside the
 * article's LoroDoc in `wiki_article_relations`, one row per source that found them.
 */
import { Array as EffectArray, Option, Schema } from "effect"

import { SupportedLanguage } from "../common/enums.js"
import { WikiArticleId } from "../common/ids.js"
import { OptionalColumn } from "../common/primitives.js"
import { linkedEntitiesFromTiptapDocument } from "../rich-text/entity-reference-extension.js"
import { type WikiArticleEditableData } from "./wiki-article.js"

export const WikiArticleRelationSource = Schema.Literals([
  /** An `entityReference` to the related article in one of the article's translations. */
  "CONTENT_REFERENCE",
  /** Extracted from the article's content by the classification workflow. */
  "CLASSIFICATION",
  /** A tag the legacy Gororobas database attached to the article. */
  "LEGACY_TAG",
])

export type WikiArticleRelationSource = typeof WikiArticleRelationSource.Type

export const WikiArticleRelationRow = Schema.Struct({
  wikiArticleId: WikiArticleId,
  relatedWikiArticleId: WikiArticleId,
  source: WikiArticleRelationSource,
  /** The span of content the relation was extracted from, for CLASSIFICATION relations. */
  extractionText: OptionalColumn(Schema.String),
})

export type WikiArticleRelationRow = typeof WikiArticleRelationRow.Type

/** Other wiki articles referenced from any of the article's translations. */
export const contentReferencedWikiArticleIds = (
  article: WikiArticleEditableData,
  ownId: WikiArticleId,
): ReadonlyArray<WikiArticleId> =>
  EffectArray.dedupe(
    SupportedLanguage.literals.flatMap((language) =>
      Option.toArray(Option.fromUndefinedOr(article.translations[language])).flatMap(
        (translation) =>
          Option.toArray(translation.content).flatMap((content) =>
            linkedEntitiesFromTiptapDocument(content).flatMap((target) =>
              target.referenceType === "WIKI_ARTICLE" && target.referenceId !== ownId
                ? [target.referenceId]
                : [],
            ),
          ),
      ),
    ),
  )
