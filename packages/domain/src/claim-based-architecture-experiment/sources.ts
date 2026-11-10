/**
 * Who may assert a property, and how. A property's `sources` builds the list with a
 * `SourceBuilder`, best-ranked first: the order is resolution's ranking. The builder is typed by
 * the property's value and scope, so a source that extracts the wrong type, or a language for a
 * universal property, doesn't compile.
 *
 * A source definition says how a source asserts values; a claim's provenance (`provenance.ts`)
 * records which source asserted one, with its evidence.
 */
import { Result } from "effect"

import type { PropertyScope } from "./claims.js"
import type { Extracted, Extraction, ExtractionContext, ExtractionIssue } from "./extraction.js"
import type { FetchedProvider, ProviderResults } from "./providers/index.js"

export interface PersonSource {
  readonly _tag: "PERSON"
}

/** A provider we fetch, with how this property reads its result. */
export interface FetchedProviderSource<
  Provider extends FetchedProvider,
  Value,
  Scope extends PropertyScope,
> {
  readonly _tag: Provider
  readonly extract: (
    result: ProviderResults[Provider],
    context: ExtractionContext,
  ) => ReadonlyArray<Extraction<Value, Scope>>
}

/** A provider that writes claims itself: the gazetteer when it creates places. */
export interface WritingProviderSource<Provider extends "WHOS_ON_FIRST"> {
  readonly _tag: Provider
}

export interface ArticleTextInferenceSource {
  readonly _tag: "ARTICLE_TEXT_INFERENCE"
  /** At most this many claims of the property from one text, the most confident first. */
  readonly claimsPerText: number
}

export interface MachineTranslationSource {
  readonly _tag: "MACHINE_TRANSLATION"
}

export interface ArticleTextEntityReferenceSource {
  readonly _tag: "ARTICLE_TEXT_ENTITY_REFERENCE"
}

export type SourceDefinition<Value, Scope extends PropertyScope> =
  | PersonSource
  | FetchedProviderSource<"WIKIDATA", Value, Scope>
  | FetchedProviderSource<"GBIF", Value, Scope>
  | FetchedProviderSource<"GOOGLE_BOOKS", Value, Scope>
  | FetchedProviderSource<"CONTENT_CHANNELS", Value, Scope>
  | FetchedProviderSource<"SYNTROPEDIA", Value, Scope>
  | WritingProviderSource<"WHOS_ON_FIRST">
  | ArticleTextInferenceSource
  | MachineTranslationSource
  | ArticleTextEntityReferenceSource

type ExtractOf<Provider extends FetchedProvider, Value, Scope extends PropertyScope> = Pick<
  FetchedProviderSource<Provider, Value, Scope>,
  "extract"
>

export interface SourceBuilder<Value, Scope extends PropertyScope> {
  readonly person: () => PersonSource
  readonly wikidata: (
    config: ExtractOf<"WIKIDATA", Value, Scope>,
  ) => FetchedProviderSource<"WIKIDATA", Value, Scope>
  readonly gbif: (
    config: ExtractOf<"GBIF", Value, Scope>,
  ) => FetchedProviderSource<"GBIF", Value, Scope>
  readonly googleBooks: (
    config: ExtractOf<"GOOGLE_BOOKS", Value, Scope>,
  ) => FetchedProviderSource<"GOOGLE_BOOKS", Value, Scope>
  readonly contentChannels: (
    config: ExtractOf<"CONTENT_CHANNELS", Value, Scope>,
  ) => FetchedProviderSource<"CONTENT_CHANNELS", Value, Scope>
  readonly syntropedia: (
    config: ExtractOf<"SYNTROPEDIA", Value, Scope>,
  ) => FetchedProviderSource<"SYNTROPEDIA", Value, Scope>
  readonly whosOnFirst: () => WritingProviderSource<"WHOS_ON_FIRST">
  readonly articleTextInference: (config?: {
    readonly claimsPerText?: number
  }) => ArticleTextInferenceSource
  readonly machineTranslation: () => MachineTranslationSource
  readonly articleTextEntityReference: () => ArticleTextEntityReferenceSource
  /**
   * A value `extract` found: the value itself for a universal property, `{ language, value }` for
   * a language-specific one.
   */
  readonly found: (extracted: Extracted<Value, Scope>) => Extraction<Value, Scope>
  readonly issue: (issue: ExtractionIssue) => Extraction<Value, Scope>
}

/** Typed facts or links from one text, before the property says otherwise (the plan's budgets). */
const DEFAULT_CLAIMS_PER_TEXT = 20

export const makeSourceBuilder = <Value, Scope extends PropertyScope>(): SourceBuilder<
  Value,
  Scope
> => ({
  person: () => ({ _tag: "PERSON" }),
  wikidata: ({ extract }) => ({ _tag: "WIKIDATA", extract }),
  gbif: ({ extract }) => ({ _tag: "GBIF", extract }),
  googleBooks: ({ extract }) => ({ _tag: "GOOGLE_BOOKS", extract }),
  contentChannels: ({ extract }) => ({ _tag: "CONTENT_CHANNELS", extract }),
  syntropedia: ({ extract }) => ({ _tag: "SYNTROPEDIA", extract }),
  whosOnFirst: () => ({ _tag: "WHOS_ON_FIRST" }),
  articleTextInference: (config) => ({
    _tag: "ARTICLE_TEXT_INFERENCE",
    claimsPerText: config?.claimsPerText ?? DEFAULT_CLAIMS_PER_TEXT,
  }),
  machineTranslation: () => ({ _tag: "MACHINE_TRANSLATION" }),
  articleTextEntityReference: () => ({ _tag: "ARTICLE_TEXT_ENTITY_REFERENCE" }),
  found: (extracted) => Result.succeed(extracted),
  issue: (issue) => Result.fail(issue),
})
