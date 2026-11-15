/**
 * The deep module's interface. Adding a property means writing one `defineCanonicalProperty` or
 * `defineSituatedProperty` call; storage, resolution or summarizing, extraction from providers,
 * moderation, the edit diff, JSON-LD and the article's TypeScript shape all follow from it.
 *
 * A property's type (`propertyType`) says how its answer is settled:
 *
 * - **Canonical**: one answer the wiki holds (an identifier, a classification, a book's
 *   publication date, a plant's origin). Sources may disagree; the canonical answer comes from the
 *   most authoritative one, so sources are ranked. People propose values and corrections, which a
 *   curator evaluates, and the answer is never final. It's never inferred from text.
 * - **Situated**: tallied from everyone's situation. As many answers as people have experiences
 *   (days to harvest, strata, edible parts, names), visible at once and tallied into a summary
 *   (`situated-summary.ts`). Its sources are unranked.
 *
 * Either type may inherit values from the articles an article inherits from (`inheritance.ts`).
 */
import { Array as EffectArray, Match, Option, Predicate, Result, Schema } from "effect"
import type { NonEmptyReadonlyArray } from "effect/Array"

import { SupportedLanguage } from "../common/enums.js"
import type { WikiArticleId } from "../common/ids.js"
import { type PropertyScope, canonicalClaimSchema, situatedClaimSchema } from "./claims.js"
import type { Extraction, ExtractionContext, ExtractionIssue } from "./extraction.js"
import type { InheritanceDefinition } from "./inheritance.js"
import type { ArticleKind } from "./kinds.js"
import type { ProviderInput } from "./providers/index.js"
import type { JsonLdContext, JsonLdFields, SchemaOrgMapping } from "./schema-org.js"
import {
  type SummaryBuilder,
  type SummaryStrategy,
  makeSummaryBuilder,
} from "./situated-summary.js"
import {
  type CanonicalSourceBuilder,
  type CanonicalSourceDefinition,
  type SituatedSourceBuilder,
  type SituatedSourceDefinition,
  type SituatedSourceKeys,
  type SituatedSources,
  makeCanonicalSourceBuilder,
  makeSituatedSourceBuilder,
} from "./sources.js"

export type PropertyType = "CANONICAL" | "SITUATED"

/**
 * How many values a canonical property shows; each claim states one of them.
 *
 * - `ONE`: a single value (an identifier, a publication date).
 * - `SET`: values in no particular order (ISBNs, genres).
 * - `LIST`: values in the order people put them (authors). Values from other sources follow
 *   people's, in source order.
 *
 * Situated properties have none: a claim's value is what its author gave, a set of strata as
 * much as one growth rate, and the property's `summary` says how claims are tallied.
 */
export type PropertyCardinality = "ONE" | "SET" | "LIST"

export type PropertyPresence = "REQUIRED" | "OPTIONAL"

interface PropertyBase<
  Id,
  Value,
  Encoded,
  Kind,
  Scope extends PropertyScope,
  Inheritance extends InheritanceDefinition | undefined,
> {
  readonly id: Id
  /**
   * Invariants spanning fields go inside one value (`height` is a range), so a claim can never
   * state half of an invariant.
   *
   * Two values are the same value when the value schema's equivalence says so
   * (`Schema.toEquivalence`); schemas fold what readers don't distinguish, such as a name's case.
   */
  readonly valueSchema: Schema.Codec<Value, Encoded>
  readonly kinds: NonEmptyReadonlyArray<Kind>
  readonly scope: Scope
  /**
   * For relations: the article a value points to, stored in an indexed column so the other article
   * can list it ("cultivars of this plant"). The server checks the target's kind when the claim is
   * written; the domain has no database to check it with.
   */
  readonly references?: {
    readonly targetKinds: NonEmptyReadonlyArray<ArticleKind>
    readonly target: (value: Value) => Option.Option<WikiArticleId>
  }
  /** How its values publish as schema.org; a property without a match isn't published. */
  readonly schemaOrg?: SchemaOrgMapping<Value>
  /** Whether, and how, articles inherit its values from the articles they inherit from. */
  readonly inheritance?: Inheritance
}

export type CanonicalPropertyDefinition<
  Id extends string,
  Value,
  Encoded,
  Kind extends ArticleKind,
  Scope extends PropertyScope,
  Cardinality extends PropertyCardinality,
  Presence extends PropertyPresence,
  Sources extends NonEmptyReadonlyArray<CanonicalSourceDefinition<Value, Scope>>,
  Inheritance extends InheritanceDefinition | undefined,
> = PropertyBase<Id, Value, Encoded, Kind, Scope, Inheritance> & {
  readonly cardinality: Cardinality
  /**
   * Who may assert it, best-ranked first: the canonical answer comes from the earliest source
   * with a value. Each provider listed says how to read its result.
   */
  readonly sources: (source: CanonicalSourceBuilder<Value, Scope>) => Sources
  /**
   * `REQUIRED`: the article isn't published until it has a value (in some language), and no
   * retraction or censoring may take its last one away (see `guards.ts`). Defaults to `OPTIONAL`.
   */
  readonly presence?: Presence
}

export type SituatedPropertyDefinition<
  Id extends string,
  Value,
  Encoded,
  Kind extends ArticleKind,
  Scope extends PropertyScope,
  Sources extends SituatedSources<Value, Scope>,
  Summary,
  Inheritance extends InheritanceDefinition | undefined,
> = PropertyBase<Id, Value, Encoded, Kind, Scope, Inheritance> & {
  /** Who may say, by name: nobody outranks anybody. */
  readonly sources: (source: SituatedSourceBuilder<Value, Scope>) => Sources
  /**
   * How claims are tallied into what readers see: each value whole (a growth rate), each member
   * of a set on its own (strata), or ranges combined into one (heights).
   */
  readonly summary: (summarize: SummaryBuilder<Value>) => SummaryStrategy<Value, Summary>
}

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

type AnySourceDefinition<Value, Scope extends PropertyScope> =
  | CanonicalSourceDefinition<Value, Scope>
  | SituatedSourceDefinition<Value, Scope>

/** Extraction from providers and JSON-LD, the same for both property types. */
const providerReading = <Value, Encoded, Scope extends PropertyScope>({
  id,
  valueSchema,
  scope,
  isSingleValued,
  schemaOrg,
  sources,
}: {
  readonly id: string
  readonly valueSchema: Schema.Codec<Value, Encoded>
  readonly scope: Scope
  /** A canonical `ONE` property: several values in one language are ambiguous. */
  readonly isSingleValued: boolean
  readonly schemaOrg: SchemaOrgMapping<Value> | undefined
  readonly sources: ReadonlyArray<AnySourceDefinition<Value, Scope>>
}) => {
  const isSameValue = Schema.toEquivalence(valueSchema)
  const isInLanguage = Schema.is(Schema.Struct({ language: SupportedLanguage, value: valueSchema }))
  const isValue = Schema.is(valueSchema)

  /**
   * What `extract` returned, checked: each value against the value schema and the property's
   * scope (invariant: extraction only yields values the property accepts), deduplicated, and a
   * `ONE` canonical property with several values in one language reported as ambiguous instead of
   * guessed. A situated property keeps every value, each its own claim: a provider may say
   * several things too.
   */
  const checkExtractions = (
    extractions: ReadonlyArray<Extraction<Value, Scope>>,
  ): PropertyExtraction<Value> => {
    const candidates = extractions.flatMap((extraction) =>
      Result.match(extraction, {
        onFailure: () => [],
        onSuccess: (extracted): ReadonlyArray<ExtractedValue<Value>> =>
          scope === "UNIVERSAL"
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
      (language) => isSingleValued && countIn(language) > 1,
    )

    return {
      propertyId: id,
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
    Option.match(Option.fromNullishOr(schemaOrg), {
      onNone: () => [],
      onSome: (mapping) =>
        values.filter(isValue).map((value, index) => mapping.encode(value, { context, index })),
    })

  return { extractFrom, toJsonLd }
}

export const defineCanonicalProperty = <
  const Id extends string,
  Value,
  Encoded,
  const Kind extends ArticleKind,
  const Scope extends PropertyScope,
  const Cardinality extends PropertyCardinality,
  const Sources extends NonEmptyReadonlyArray<CanonicalSourceDefinition<Value, Scope>>,
  const Presence extends PropertyPresence = "OPTIONAL",
  const Inheritance extends InheritanceDefinition | undefined = undefined,
>(
  definition: CanonicalPropertyDefinition<
    Id,
    Value,
    Encoded,
    Kind,
    Scope,
    Cardinality,
    Presence,
    Sources,
    Inheritance
  >,
) => {
  const sources = definition.sources(makeCanonicalSourceBuilder<Value, Scope>())
  const sourceKeys = sources.map((source): Sources[number]["_tag"] => source._tag)

  return {
    ...definition,
    propertyType: "CANONICAL" as const,
    sources,
    sourceKeys,
    ...providerReading({
      id: definition.id,
      valueSchema: definition.valueSchema,
      scope: definition.scope,
      isSingleValued: definition.cardinality === "ONE",
      schemaOrg: definition.schemaOrg,
      sources,
    }),
    Claim: canonicalClaimSchema({ ...definition, sourceKeys }),
  }
}

export const defineSituatedProperty = <
  const Id extends string,
  Value,
  Encoded,
  const Kind extends ArticleKind,
  const Scope extends PropertyScope,
  const Sources extends SituatedSources<Value, Scope>,
  Summary,
  const Inheritance extends InheritanceDefinition | undefined = undefined,
>(
  definition: SituatedPropertyDefinition<
    Id,
    Value,
    Encoded,
    Kind,
    Scope,
    Sources,
    Summary,
    Inheritance
  >,
) => {
  const sources = definition.sources(makeSituatedSourceBuilder<Value, Scope>())

  const sourceList: ReadonlyArray<SituatedSourceDefinition<Value, Scope>> = [
    sources.person,
    sources.wikidata,
    sources.gbif,
    sources.googleBooks,
    sources.contentChannels,
    sources.syntropedia,
    sources.tmdb,
    sources.whosOnFirst,
  ].filter(Predicate.isNotUndefined)

  const isListed = (
    key: SituatedSourceDefinition<Value, Scope>["_tag"],
  ): key is Extract<SituatedSourceDefinition<Value, Scope>["_tag"], SituatedSourceKeys<Sources>> =>
    sourceList.some((source) => source._tag === key)
  const sourceKeys = sourceList.map((source) => source._tag).filter(isListed)
  const isInferable = sources.person?.inferable ?? false

  return {
    ...definition,
    propertyType: "SITUATED" as const,
    sources,
    sourceList,
    sourceKeys,
    summary: definition.summary(makeSummaryBuilder(definition.valueSchema)),
    /** Whether a machine may read the property from people's publications. */
    isInferable,
    ...providerReading({
      id: definition.id,
      valueSchema: definition.valueSchema,
      scope: definition.scope,
      isSingleValued: false,
      schemaOrg: definition.schemaOrg,
      sources: sourceList,
    }),
    Claim: situatedClaimSchema({ ...definition, sourceKeys, isInferable }),
  }
}
