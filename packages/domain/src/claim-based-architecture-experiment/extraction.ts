/**
 * What a source's `extract` returns, and what it may look up while extracting. `extract` is plain
 * code reading a provider's result (see `providers/`); the property checks and orders what it
 * returns (`defineProperty`).
 */
import type { Option, Result } from "effect"

import type { SupportedLanguage } from "../common/enums.js"
import type { WhosOnFirstId, WikidataId } from "../common/external-identifiers.js"
import type { MediaAssetId, WikiArticleId } from "../common/ids.js"
import type { PropertyScope } from "./claims.js"

/** A value a source states: with its language only for language-specific properties. */
export type Extracted<Value, Scope extends PropertyScope> = Scope extends "UNIVERSAL"
  ? Value
  : { readonly language: SupportedLanguage; readonly value: Value }

/**
 * Why a candidate value didn't become a claim. Most are expected and kept for people to look at
 * (an item we have no article for is an article suggestion); `UNEXPECTED_DATATYPE`,
 * `INVALID_VALUE` and `AMBIGUOUS` mean a mapping or the provider changed.
 */
export type ExtractionIssue =
  /** The provider's datatype isn't the one the extractor reads: it changed upstream. */
  | {
      readonly _tag: "UNEXPECTED_DATATYPE"
      readonly expected: ReadonlyArray<string>
      readonly found: string
    }
  /** The value doesn't fit the property's schema: an invalid ISBN, a too-short name. */
  | { readonly _tag: "INVALID_VALUE"; readonly detail: string }
  /** Decade or century precision, BCE years, Julian dates: nothing `PartialDate` can say. */
  | { readonly _tag: "UNSUPPORTED_TIME"; readonly detail: string }
  | { readonly _tag: "UNKNOWN_UNIT"; readonly unit: string }
  | { readonly _tag: "UNMATCHED_ITEM"; readonly wikidataId: WikidataId }
  | { readonly _tag: "UNMATCHED_PLACE"; readonly whosOnFirstId: WhosOnFirstId }
  | { readonly _tag: "NOT_IMPORTED"; readonly fileName: string }
  | { readonly _tag: "UNSUPPORTED_LANGUAGE"; readonly language: string }
  /** The provider says there's a value but not which (Wikidata's `somevalue`). */
  | { readonly _tag: "UNKNOWN_VALUE" }
  /** The provider says there's none (Wikidata's `novalue`): a "none" claim, once those exist. */
  | { readonly _tag: "NO_VALUE" }
  /** A `ONE` property with several values in one language: we don't guess which is right. */
  | {
      readonly _tag: "AMBIGUOUS"
      readonly language: SupportedLanguage | null
      readonly count: number
    }
  /** The provider's record isn't about an article of this kind (a disambiguation page, the fruit). */
  | {
      readonly _tag: "NOT_OF_KIND"
      readonly expected: ReadonlyArray<string>
      readonly found: ReadonlyArray<string>
    }

export type Extraction<Value, Scope extends PropertyScope> = Result.Result<
  Extracted<Value, Scope>,
  ExtractionIssue
>

/**
 * What extraction may look up, loaded in one batch before extracting so `extract` stays pure:
 * our articles by Wikidata or Who's On First ID, the labels and language tags of the items a result points at, and
 * the provider files already imported as media assets.
 */
export interface ExtractionContext {
  readonly articleWithWikidataId: (wikidataId: WikidataId) => Option.Option<WikiArticleId>
  readonly articleWithWhosOnFirstId: (whosOnFirstId: WhosOnFirstId) => Option.Option<WikiArticleId>
  readonly labelOf: (wikidataId: WikidataId, language: SupportedLanguage) => Option.Option<string>
  /** The item's IETF tag (P305): Q7976 American English is `en-US`. */
  readonly languageTagOf: (wikidataId: WikidataId) => Option.Option<string>
  readonly importedFile: (fileName: string) => Option.Option<MediaAssetId>
}
