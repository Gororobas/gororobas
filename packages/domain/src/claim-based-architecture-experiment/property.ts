/**
 * The deep module's interface. Adding a property means writing one `defineProperty` call; storage,
 * resolution, extraction from providers, moderation, the edit diff and the article's TypeScript
 * shape all follow from it.
 */
import type { Option, Schema } from "effect"
import type { NonEmptyReadonlyArray } from "effect/Array"

import type { WikiArticleId } from "../common/ids.js"
import { type LanguageOf, type PropertyScope, claimSchema } from "./claims.js"
import type { ArticleKind } from "./kinds.js"
import type { FetchedProvider, ProviderResults } from "./providers.js"
import type { SourceKey } from "./sources.js"

/**
 * - `ONE`: a single value (a height, an identifier).
 * - `SET`: values in no particular order (strata, ISBNs).
 * - `LIST`: values in the order people put them (names: the first is the one most people
 *   recognize). Values from other sources follow people's, in source order.
 */
export type PropertyCardinality = "ONE" | "SET" | "LIST"

export type Extracted<Value, Scope extends PropertyScope> = Scope extends "UNIVERSAL"
  ? { readonly value: Value }
  : { readonly language: LanguageOf<Scope>; readonly value: Value }

interface PropertyBase<Id, Value, Encoded, Kind, Scope, Source, Presence> {
  readonly id: Id
  /**
   * Invariants spanning fields go inside one value (`height` is a range), so evaluating claims one
   * by one can never accept half of an invariant.
   */
  readonly value: Schema.Codec<Value, Encoded>
  readonly subjectKinds: NonEmptyReadonlyArray<Kind>
  readonly scope: Scope
  /** Which sources may assert it, best first: resolution prefers values from earlier sources. */
  readonly sources: NonEmptyReadonlyArray<Source>
  /**
   * For relations: the article a value points to, stored in an indexed column so the other article
   * can list it ("cultivars of this plant"). The server checks the target's kind when the claim is
   * written; the domain has no database to check it with.
   */
  readonly references?: {
    readonly kinds: NonEmptyReadonlyArray<ArticleKind>
    readonly target: (value: Value) => Option.Option<WikiArticleId>
  }
  /**
   * `REQUIRED`: the article isn't published until it has a value (in some language), and no
   * retraction or censoring may take its last one away (see `guards.ts`). Defaults to `OPTIONAL`.
   *
   * Two values are the same value when the value schema's equivalence says so
   * (`Schema.toEquivalence`); schemas fold what readers don't distinguish, such as a name's case.
   */
  readonly presence?: Presence
}

export type PropertyPresence = "REQUIRED" | "OPTIONAL"

type CardinalityFields<Cardinality> = Cardinality extends "ONE"
  ? { readonly cardinality: Cardinality }
  : {
      readonly cardinality: Cardinality
      /**
       * How to combine multiple claims of this property:
       *
       * - `ALL_SOURCES`: every value, best-ranked first
       * - `FIRST_SOURCE_WITH_VALUES`: only the values of the best-ranked source that has any valid claim
       */
      readonly mergeStrategy: "ALL_SOURCES" | "FIRST_SOURCE_WITH_VALUES"
    }

/** Listing a fetched provider among the sources requires saying how to read it. */
type ExtractFields<Source, Value, Scope extends PropertyScope> = [
  Extract<Source, FetchedProvider>,
] extends [never]
  ? { readonly extract?: never }
  : {
      readonly extract: {
        readonly [P in Extract<Source, FetchedProvider>]: (
          result: ProviderResults[P],
        ) => ReadonlyArray<Extracted<Value, Scope>>
      }
    }

export type PropertyDefinition<
  Id extends string,
  Value,
  Encoded,
  Kind extends ArticleKind,
  Scope extends PropertyScope,
  Cardinality extends PropertyCardinality,
  Source extends SourceKey,
  Presence extends PropertyPresence,
> = PropertyBase<Id, Value, Encoded, Kind, Scope, Source, Presence> &
  CardinalityFields<Cardinality> &
  ExtractFields<Source, Value, Scope>

export const defineProperty = <
  const Id extends string,
  Value,
  Encoded,
  const Kind extends ArticleKind,
  const Scope extends PropertyScope,
  const Cardinality extends PropertyCardinality,
  const Source extends SourceKey,
  const Presence extends PropertyPresence = "OPTIONAL",
>(
  definition: PropertyDefinition<Id, Value, Encoded, Kind, Scope, Cardinality, Source, Presence>,
) => ({ ...definition, Claim: claimSchema(definition) })
