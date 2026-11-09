/**
 * Article text: the rich text of an article in one language, the only part of an article that
 * stays a Loro document. Peritext merges concurrent pending revisions deterministically, which
 * whole-value claims can't, and Loro keeps the node IDs evidence points at.
 *
 * It's "text" rather than "content": publications and comments have content too, and "text
 * revision" reads unambiguously next to claims. Each language is its own document, so a
 * translation never conflicts with an edit in another language.
 */
import { Schema } from "effect"

import { ModerationStatus, SupportedLanguage } from "../common/enums.js"
import { WikiArticleId } from "../common/ids.js"
import { LoroDocFrontier, LoroDocSnapshot, LoroDocUpdate } from "../crdts/domain.js"
import { LanguageModelInfo } from "../links/domain.js"
import { Evaluation } from "./claims.js"
import { PersonSource } from "./sources.js"

export const ArticleTextRevisionId = Schema.String.pipe(Schema.brand("ArticleTextRevisionId"))

/** The current document: approved revisions and visible translations, merged. */
export const ArticleText = Schema.Struct({
  wikiArticleId: WikiArticleId,
  language: SupportedLanguage,
  crdtSnapshot: LoroDocSnapshot,
  crdtFrontier: LoroDocFrontier,
})

const revisionFields = {
  id: ArticleTextRevisionId,
  wikiArticleId: WikiArticleId,
  language: SupportedLanguage,
  crdtUpdate: LoroDocUpdate,
  fromCrdtFrontier: LoroDocFrontier,
  createdAt: Schema.DateTimeUtcFromString,
}

/**
 * Text revisions follow the same two lifecycles as claims: people's wait for an evaluation,
 * machine translations are visible by default and censorable.
 */
export const ArticleTextRevision = Schema.Union([
  Schema.Struct({ ...revisionFields, source: PersonSource, evaluation: Evaluation }),
  Schema.Struct({
    ...revisionFields,
    source: Schema.TaggedStruct("MACHINE_TRANSLATION", {
      model: LanguageModelInfo,
      translatedFromLanguage: SupportedLanguage,
      /** A newer approved revision in that language makes the translation stale. */
      translatedFromFrontier: LoroDocFrontier,
    }),
    moderationStatus: ModerationStatus,
  }),
])

export type ArticleTextRevision = typeof ArticleTextRevision.Type
