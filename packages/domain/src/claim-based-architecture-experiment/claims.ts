/**
 * A claim is one source asserting one value of one property about one article. Its shape follows
 * its source's lifecycle, so invalid states don't decode:
 *
 * - A person's claim asserts or retracts, and has an evaluation.
 * - An automatic claim asserts, and has a moderation status. It's never pending, never retracts.
 *
 * A property's `Claim` schema only accepts the sources it lists, in its type too: `make` on a
 * people-only property won't take a provider source.
 */
import { type DateTime, Schema } from "effect"

import { ModerationStatus, SupportedLanguage } from "../common/enums.js"
import { PersonId, WikiArticleId } from "../common/ids.js"
import {
  type AllowedAutomaticSource,
  type AllowedPersonSource,
  AutomaticSource,
  ClaimId,
  PersonSource,
  type SourceKey,
  automaticSourceKey,
} from "./sources.js"

/** A verdict on something people submitted: a claim or an article text revision. */
export const Evaluation = Schema.TaggedUnion({
  PENDING: {},
  APPROVED: {
    /** Null once the evaluator deletes their account. */
    evaluatedById: Schema.NullOr(PersonId),
    evaluatedAt: Schema.DateTimeUtcFromString,
  },
  REJECTED: {
    evaluatedById: Schema.NullOr(PersonId),
    evaluatedAt: Schema.DateTimeUtcFromString,
    reason: Schema.NullOr(Schema.NonEmptyString),
  },
})

export type Evaluation = typeof Evaluation.Type

export const isVisibleModerationStatus = (status: ModerationStatus) => status !== "CENSORED"

/**
 * - `ARTICLE_WIDE`: one set of claims for the article (identifiers, measurements, relations).
 * - `LANGUAGE_SPECIFIC`: claims per language (names, Wikipedia pages, plant origins). Readers
 *   missing their language see another one, with a notice.
 */
export const PropertyScope = Schema.Literals(["ARTICLE_WIDE", "LANGUAGE_SPECIFIC"])

export type PropertyScope = typeof PropertyScope.Type

const languageColumn = {
  ARTICLE_WIDE: Schema.Null,
  LANGUAGE_SPECIFIC: SupportedLanguage,
} as const

/** The language a claim is stored in, and the one a reader asks for. */
export type LanguageOf<Scope extends PropertyScope> = {
  readonly ARTICLE_WIDE: null
  readonly LANGUAGE_SPECIFIC: SupportedLanguage
}[Scope]

interface ClaimBase<Scope extends PropertyScope> {
  readonly id: ClaimId
  readonly subjectId: WikiArticleId
  readonly property: string
  readonly language: LanguageOf<Scope>
  readonly createdAt: DateTime.Utc
}

export interface PersonClaim<Value, Scope extends PropertyScope> extends ClaimBase<Scope> {
  readonly source: PersonSource
  readonly change:
    | { readonly _tag: "ASSERT"; readonly value: Value; readonly supersedes: ClaimId | null }
    | { readonly _tag: "RETRACT"; readonly retracts: ClaimId }
  readonly evaluation: Evaluation
}

export interface AutomaticClaim<Value, Scope extends PropertyScope> extends ClaimBase<Scope> {
  readonly source: AutomaticSource
  readonly value: Value
  readonly moderationStatus: ModerationStatus
}

/**
 * Stated rather than derived from `claimSchema`, whose type doesn't resolve while `Scope` is
 * generic. `checks.ts` asserts a concrete property's decoded claims match it.
 */
export type Claim<Value, Scope extends PropertyScope> =
  | PersonClaim<Value, Scope>
  | AutomaticClaim<Value, Scope>

export const claimSchema = <
  const Id extends string,
  Value,
  Encoded,
  Scope extends PropertyScope,
  Source extends SourceKey,
>(property: {
  readonly id: Id
  readonly value: Schema.Codec<Value, Encoded>
  readonly scope: Scope
  readonly sources: ReadonlyArray<Source>
}) => {
  const lists = (key: SourceKey) => property.sources.some((source) => source === key)

  const annotations = {
    identifier: "ClaimFromListedSource",
    title: "Claim from a listed source",
    description: `A source ${property.id} lists among its sources.`,
  }

  /**
   * Narrowed on the source rather than on the claim, whose type doesn't resolve while generic.
   * A property listing no person (or no machine) leaves that claim shape with a `never` source:
   * it can't be made or decoded, and `ClaimOf` drops it.
   */
  const personSource = PersonSource.pipe(
    Schema.refine(
      (source): source is AllowedPersonSource<Source> => lists(source._tag),
      annotations,
    ),
  )

  const automaticSource = AutomaticSource.pipe(
    Schema.refine(
      (source): source is AllowedAutomaticSource<Source> => lists(automaticSourceKey(source)),
      annotations,
    ),
  )

  const common = {
    id: ClaimId,
    subjectId: WikiArticleId,
    property: Schema.Literal(property.id),
    language: languageColumn[property.scope],
    createdAt: Schema.DateTimeUtcFromString,
  }

  return Schema.Union([
    Schema.Struct({
      ...common,
      source: personSource,
      change: Schema.Union([
        Schema.TaggedStruct("ASSERT", {
          value: property.value,
          /** A claim by the same person or another this one replaces once approved. */
          supersedes: Schema.NullOr(ClaimId),
        }),
        /** Removes a person's claim once approved. Machine claims are flagged instead. */
        Schema.TaggedStruct("RETRACT", { retracts: ClaimId }),
      ]),
      evaluation: Evaluation,
    }),
    Schema.Struct({
      ...common,
      source: automaticSource,
      value: property.value,
      moderationStatus: ModerationStatus,
    }),
  ])
}

/** A property's claims, without the shape its sources rule out. */
export type ClaimOf<Property extends { readonly Claim: Schema.Top }> = Exclude<
  Property["Claim"]["Type"],
  { readonly source: never }
>

export const claimSourceKey = <Value, Scope extends PropertyScope>(
  claim: Claim<Value, Scope>,
): SourceKey => ("moderationStatus" in claim ? automaticSourceKey(claim.source) : claim.source._tag)
