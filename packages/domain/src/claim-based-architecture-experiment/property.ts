/**
 * The deep module's interface. Adding a property means writing one `defineProperty` call; storage,
 * resolution, extraction from providers, moderation, the edit diff, JSON-LD and the article's
 * TypeScript shape all follow from it.
 */
import { Array as EffectArray, Match, Option, Predicate, Result, Schema } from "effect"
import type { NonEmptyReadonlyArray } from "effect/Array"

import { SupportedLanguage } from "../common/enums.js"
import type { WikiArticleId } from "../common/ids.js"
import { type PropertyScope, claimSchema } from "./claims.js"
import type { Extraction, ExtractionContext, ExtractionIssue } from "./extraction.js"
import type { ArticleKind } from "./kinds.js"
import type { ProviderInput } from "./providers/index.js"
import type { JsonLdContext, JsonLdFields, SchemaOrgMapping } from "./schema-org.js"
import { type SourceBuilder, type SourceDefinition, makeSourceBuilder } from "./sources.js"

/**
 * - `ONE`: a single value (a height, an identifier).
 * - `SET`: values in no particular order (strata, ISBNs).
 * - `LIST`: values in the order people put them (names: the first is the one most people
 *   recognize). Values from other sources follow people's, in source order.
 */
export type PropertyCardinality = "ONE" | "SET" | "LIST"

export type PropertyPresence = "REQUIRED" | "OPTIONAL"

interface PropertyBase<Id, Value, Encoded, Kind, Scope extends PropertyScope, Presence, Sources> {
  readonly id: Id
  /**
   * Invariants spanning fields go inside one value (`height` is a range), so evaluating claims one
   * by one can never accept half of an invariant.
   *
   * Two values are the same value when the value schema's equivalence says so
   * (`Schema.toEquivalence`); schemas fold what readers don't distinguish, such as a name's case.
   */
  readonly valueSchema: Schema.Codec<Value, Encoded>
  readonly kinds: NonEmptyReadonlyArray<Kind>
  readonly scope: Scope
  /**
   * Who may assert it, best-ranked first: resolution prefers values from earlier sources. Each
   * provider listed says how to read its result.
   */
  readonly sources: (source: SourceBuilder<Value, Scope>) => Sources
  /**
   * For relations: the article a value points to, stored in an indexed column so the other article
   * can list it ("cultivars of this plant"). The server checks the target's kind when the claim is
   * written; the domain has no database to check it with.
   */
  readonly references?: {
    readonly targetKinds: NonEmptyReadonlyArray<ArticleKind>
    readonly target: (value: Value) => Option.Option<WikiArticleId>
  }
  /**
   * `REQUIRED`: the article isn't published until it has a value (in some language), and no
   * retraction or censoring may take its last one away (see `guards.ts`). Defaults to `OPTIONAL`.
   */
  readonly presence?: Presence
  /** How its values publish as schema.org; a property without a match isn't published. */
  readonly schemaOrg?: SchemaOrgMapping<Value>
}

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

export type PropertyDefinition<
  Id extends string,
  Value,
  Encoded,
  Kind extends ArticleKind,
  Scope extends PropertyScope,
  Cardinality extends PropertyCardinality,
  Presence extends PropertyPresence,
  Sources extends NonEmptyReadonlyArray<SourceDefinition<Value, Scope>>,
> = PropertyBase<Id, Value, Encoded, Kind, Scope, Presence, Sources> &
  CardinalityFields<Cardinality>

/** A value a provider stated, checked against the property: with its language, or `null`. */
export interface ExtractedValue<Value> {
  readonly language: SupportedLanguage | null
  readonly value: Value
}

/** What a provider's result says about one property of one article. */
export interface PropertyExtraction<Value> {
  readonly propertyId: string
  /** Distinct values, in the provider's order: positions for list properties. */
  readonly values: ReadonlyArray<ExtractedValue<Value>>
  readonly issues: ReadonlyArray<ExtractionIssue>
}

export const defineProperty = <
  const Id extends string,
  Value,
  Encoded,
  const Kind extends ArticleKind,
  const Scope extends PropertyScope,
  const Cardinality extends PropertyCardinality,
  const Sources extends NonEmptyReadonlyArray<SourceDefinition<Value, Scope>>,
  const Presence extends PropertyPresence = "OPTIONAL",
>(
  definition: PropertyDefinition<Id, Value, Encoded, Kind, Scope, Cardinality, Presence, Sources>,
) => {
  const sources = definition.sources(makeSourceBuilder<Value, Scope>())
  const sourceKeys = sources.map((source): Sources[number]["_tag"] => source._tag)

  const isSameValue = Schema.toEquivalence(definition.valueSchema)
  const isInLanguage = Schema.is(
    Schema.Struct({ language: SupportedLanguage, value: definition.valueSchema }),
  )
  const isValue = Schema.is(definition.valueSchema)

  /**
   * What `extract` returned, checked: each value against the value schema and the property's
   * scope (invariant: extraction only yields values the property accepts), deduplicated, and a
   * `ONE` property with several values in one language reported as ambiguous instead of guessed.
   */
  const checkExtractions = (
    extractions: ReadonlyArray<Extraction<Value, Scope>>,
  ): PropertyExtraction<Value> => {
    const candidates = extractions.flatMap((extraction) =>
      Result.match(extraction, {
        onFailure: () => [],
        onSuccess: (extracted): ReadonlyArray<ExtractedValue<Value>> =>
          definition.scope === "UNIVERSAL"
            ? isValue(extracted)
              ? [{ language: null, value: extracted }]
              : []
            : isInLanguage(extracted)
              ? [extracted]
              : [],
      }),
    )

    const distinct = candidates.filter(
      (candidate, index) =>
        candidates.findIndex(
          (other) =>
            other.language === candidate.language && isSameValue(other.value, candidate.value),
        ) === index,
    )

    const countIn = (language: SupportedLanguage | null) =>
      distinct.filter((value) => value.language === language).length
    const ambiguousLanguages = EffectArray.dedupe(distinct.map(({ language }) => language)).filter(
      (language) => definition.cardinality === "ONE" && countIn(language) > 1,
    )

    return {
      propertyId: definition.id,
      values: distinct.filter(({ language }) => !ambiguousLanguages.includes(language)),
      issues: [
        ...extractions.flatMap((extraction) =>
          Result.match(extraction, { onFailure: (issue) => [issue], onSuccess: () => [] }),
        ),
        ...ambiguousLanguages.map((language): ExtractionIssue => ({
          _tag: "AMBIGUOUS",
          language,
          count: countIn(language),
        })),
      ],
    }
  }

  const extractions = (input: ProviderInput, context: ExtractionContext) =>
    Match.value(input).pipe(
      Match.discriminatorsExhaustive("provider")({
        WIKIDATA: ({ result }) =>
          sources.flatMap((source) =>
            Predicate.isTagged(source, "WIKIDATA") ? [source.extract(result, context)] : [],
          ),
        GBIF: ({ result }) =>
          sources.flatMap((source) =>
            Predicate.isTagged(source, "GBIF") ? [source.extract(result, context)] : [],
          ),
        GOOGLE_BOOKS: ({ result }) =>
          sources.flatMap((source) =>
            Predicate.isTagged(source, "GOOGLE_BOOKS") ? [source.extract(result, context)] : [],
          ),
        CONTENT_CHANNELS: ({ result }) =>
          sources.flatMap((source) =>
            Predicate.isTagged(source, "CONTENT_CHANNELS") ? [source.extract(result, context)] : [],
          ),
        SYNTROPEDIA: ({ result }) =>
          sources.flatMap((source) =>
            Predicate.isTagged(source, "SYNTROPEDIA") ? [source.extract(result, context)] : [],
          ),
        TMDB: ({ result }) =>
          sources.flatMap((source) =>
            Predicate.isTagged(source, "TMDB") ? [source.extract(result, context)] : [],
          ),
        WHOS_ON_FIRST: ({ result }) =>
          sources.flatMap((source) =>
            Predicate.isTagged(source, "WHOS_ON_FIRST") ? [source.extract(result, context)] : [],
          ),
      }),
    )

  /** What a provider's result says about this property, if the property lists the provider. */
  const extractFrom = (
    input: ProviderInput,
    context: ExtractionContext,
  ): Option.Option<PropertyExtraction<Value>> =>
    Option.map(EffectArray.head(extractions(input, context)), checkExtractions)

  /** The values' schema.org fields; values not of the property's type (a stale projection) are left out. */
  const toJsonLd = (
    values: ReadonlyArray<unknown>,
    context: JsonLdContext,
  ): ReadonlyArray<JsonLdFields> =>
    Option.match(Option.fromNullishOr(definition.schemaOrg), {
      onNone: () => [],
      onSome: (schemaOrg) =>
        values.filter(isValue).map((value, index) => schemaOrg.encode(value, { context, index })),
    })

  return {
    ...definition,
    sources,
    sourceKeys,
    extractFrom,
    toJsonLd,
    Claim: claimSchema({ ...definition, sourceKeys }),
  }
}
