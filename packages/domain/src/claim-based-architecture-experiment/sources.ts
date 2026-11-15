/**
 * Who may assert a property, and how. The builder is typed by the property's value and scope, so
 * a source that extracts the wrong type, or a language for a universal property, doesn't compile.
 *
 * - A canonical property lists its sources best-ranked first: the order is resolution's ranking.
 * - A situated property names its sources in a record. Nobody outranks anybody, so there's no
 *   order to get wrong, and a source can't be listed twice.
 *
 * A source definition says how a source asserts values; a claim's provenance (`provenance.ts`)
 * records which source asserted one, with its evidence.
 */
import { Result } from "effect"

import type { PropertyScope } from "./claims.js"
import type { Extracted, Extraction, ExtractionContext, ExtractionIssue } from "./extraction.js"
import type { FetchedProvider, ProviderResults } from "./providers/index.js"

/** People proposing values of a canonical property, which a curator evaluates. */
export interface PersonSource {
  readonly _tag: "PERSON"
}

/** People giving their own say on a situated property, visible at once. */
export interface SituatedPersonSource {
  readonly _tag: "PERSON"
  /**
   * Whether a machine may read the property from people's own public publications, as their
   * claims marked "inferred". Only situated properties can be inferred, never canonical ones.
   */
  readonly inferable: boolean
  /** At most this many inferred claims of the property from one publication, the most confident first. */
  readonly claimsPerPublication: number
}

/** A provider we fetch or look up, with how this property reads its result. */
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

export interface MachineTranslationSource {
  readonly _tag: "MACHINE_TRANSLATION"
}

export interface ArticleTextEntityReferenceSource {
  readonly _tag: "ARTICLE_TEXT_ENTITY_REFERENCE"
}

export type ProviderSourceDefinition<Value, Scope extends PropertyScope> =
  | FetchedProviderSource<"WIKIDATA", Value, Scope>
  | FetchedProviderSource<"GBIF", Value, Scope>
  | FetchedProviderSource<"GOOGLE_BOOKS", Value, Scope>
  | FetchedProviderSource<"CONTENT_CHANNELS", Value, Scope>
  | FetchedProviderSource<"SYNTROPEDIA", Value, Scope>
  | FetchedProviderSource<"TMDB", Value, Scope>
  | FetchedProviderSource<"WHOS_ON_FIRST", Value, Scope>

export type CanonicalSourceDefinition<Value, Scope extends PropertyScope> =
  | PersonSource
  | ProviderSourceDefinition<Value, Scope>
  | MachineTranslationSource
  | ArticleTextEntityReferenceSource

export type SituatedSourceDefinition<Value, Scope extends PropertyScope> =
  | SituatedPersonSource
  | ProviderSourceDefinition<Value, Scope>

/** A situated property's sources, by name. At least one; `defineSituatedProperty` checks it. */
export interface SituatedSources<Value, Scope extends PropertyScope> {
  readonly person?: SituatedPersonSource
  readonly wikidata?: FetchedProviderSource<"WIKIDATA", Value, Scope>
  readonly gbif?: FetchedProviderSource<"GBIF", Value, Scope>
  readonly googleBooks?: FetchedProviderSource<"GOOGLE_BOOKS", Value, Scope>
  readonly contentChannels?: FetchedProviderSource<"CONTENT_CHANNELS", Value, Scope>
  readonly syntropedia?: FetchedProviderSource<"SYNTROPEDIA", Value, Scope>
  readonly tmdb?: FetchedProviderSource<"TMDB", Value, Scope>
  readonly whosOnFirst?: FetchedProviderSource<"WHOS_ON_FIRST", Value, Scope>
}

/** The source keys a situated property's record names. */
export type SituatedSourceKeys<Sources> = {
  readonly [K in keyof Sources]-?: NonNullable<Sources[K]> extends { readonly _tag: infer Tag }
    ? Tag
    : never
}[keyof Sources]

type ExtractOf<Provider extends FetchedProvider, Value, Scope extends PropertyScope> = Pick<
  FetchedProviderSource<Provider, Value, Scope>,
  "extract"
>

interface ProviderSourceBuilder<Value, Scope extends PropertyScope> {
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
  readonly tmdb: (
    config: ExtractOf<"TMDB", Value, Scope>,
  ) => FetchedProviderSource<"TMDB", Value, Scope>
  readonly whosOnFirst: (
    config: ExtractOf<"WHOS_ON_FIRST", Value, Scope>,
  ) => FetchedProviderSource<"WHOS_ON_FIRST", Value, Scope>
  /**
   * A value `extract` found: the value itself for a universal property, `{ language, value }` for
   * a language-specific one.
   */
  readonly found: (extracted: Extracted<Value, Scope>) => Extraction<Value, Scope>
  readonly issue: (issue: ExtractionIssue) => Extraction<Value, Scope>
}

export interface CanonicalSourceBuilder<
  Value,
  Scope extends PropertyScope,
> extends ProviderSourceBuilder<Value, Scope> {
  readonly person: () => PersonSource
  readonly machineTranslation: () => MachineTranslationSource
  readonly articleTextEntityReference: () => ArticleTextEntityReferenceSource
}

export interface SituatedSourceBuilder<
  Value,
  Scope extends PropertyScope,
> extends ProviderSourceBuilder<Value, Scope> {
  readonly person: (config: {
    readonly inferable: boolean
    readonly claimsPerPublication?: number
  }) => SituatedPersonSource
}

/** Claims of one property from one publication, before the property says otherwise. */
const DEFAULT_CLAIMS_PER_PUBLICATION = 20

const makeProviderSourceBuilder = <Value, Scope extends PropertyScope>(): ProviderSourceBuilder<
  Value,
  Scope
> => ({
  wikidata: ({ extract }) => ({ _tag: "WIKIDATA", extract }),
  gbif: ({ extract }) => ({ _tag: "GBIF", extract }),
  googleBooks: ({ extract }) => ({ _tag: "GOOGLE_BOOKS", extract }),
  contentChannels: ({ extract }) => ({ _tag: "CONTENT_CHANNELS", extract }),
  syntropedia: ({ extract }) => ({ _tag: "SYNTROPEDIA", extract }),
  tmdb: ({ extract }) => ({ _tag: "TMDB", extract }),
  whosOnFirst: ({ extract }) => ({ _tag: "WHOS_ON_FIRST", extract }),
  found: (extracted) => Result.succeed(extracted),
  issue: (issue) => Result.fail(issue),
})

export const makeCanonicalSourceBuilder = <
  Value,
  Scope extends PropertyScope,
>(): CanonicalSourceBuilder<Value, Scope> => ({
  ...makeProviderSourceBuilder<Value, Scope>(),
  person: () => ({ _tag: "PERSON" }),
  machineTranslation: () => ({ _tag: "MACHINE_TRANSLATION" }),
  articleTextEntityReference: () => ({ _tag: "ARTICLE_TEXT_ENTITY_REFERENCE" }),
})

export const makeSituatedSourceBuilder = <
  Value,
  Scope extends PropertyScope,
>(): SituatedSourceBuilder<Value, Scope> => ({
  ...makeProviderSourceBuilder<Value, Scope>(),
  person: ({ inferable, claimsPerPublication }) => ({
    _tag: "PERSON",
    inferable,
    claimsPerPublication: claimsPerPublication ?? DEFAULT_CLAIMS_PER_PUBLICATION,
  }),
})
