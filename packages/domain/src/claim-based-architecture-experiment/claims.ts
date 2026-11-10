/**
 * A claim is one source asserting one value of one property about one article. Its shape follows
 * its source's lifecycle, so invalid states don't decode:
 *
 * - A person's claim asserts or retracts, and has an evaluation.
 * - a machine claim asserts, and has a moderation status. It's never pending, never retracts.
 *
 * A property's `Claim` schema only accepts the sources it lists, in its type too: `make` on a
 * people-only property won't take a provider source.
 *
 * A person's claim may only supersede or retract an older person's claim about the same article,
 * property and language. The server checks it when the claim is written; resolution ignores
 * references that break it, which is also what keeps them from forming cycles.
 */
import { type DateTime, Schema } from "effect"

import { ModerationStatus, SupportedLanguage } from "../common/enums.js"
import { PersonId, WikiArticleId } from "../common/ids.js"
import {
  type AllowedMachineProvenance,
  type AllowedPersonProvenance,
  MachineProvenance,
  ClaimId,
  PersonProvenance,
  type SourceKey,
  sourceKeyOfMachineProvenance,
} from "./sources.js"
import { FractionalIndex } from "./values/fractional-index.js"

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
 * - `UNIVERSAL`: one set of claims for the article, the same in every language (identifiers,
 *   measurements, relations).
 * - `LANGUAGE_SPECIFIC`: claims per language (names, Wikipedia pages, plant origins). Readers
 *   missing their language see another one, with a notice.
 */
export const PropertyScope = Schema.Literals(["UNIVERSAL", "LANGUAGE_SPECIFIC"])

export type PropertyScope = typeof PropertyScope.Type

const LANGUAGE_COLUMN_SCHEMA = {
  UNIVERSAL: Schema.Null,
  LANGUAGE_SPECIFIC: SupportedLanguage,
} as const

/** The language a claim is stored in, and the one a reader asks for. */
export type LanguageOf<Scope extends PropertyScope> = {
  readonly UNIVERSAL: null
  readonly LANGUAGE_SPECIFIC: SupportedLanguage
}[Scope]

interface ClaimBase<Scope extends PropertyScope> {
  readonly id: ClaimId
  readonly articleId: WikiArticleId
  readonly property: string
  readonly language: LanguageOf<Scope>
  readonly createdAt: DateTime.Utc
}

export interface PersonClaim<Value, Scope extends PropertyScope> extends ClaimBase<Scope> {
  readonly provenance: PersonProvenance
  readonly change:
    | {
        readonly _tag: "ASSERT"
        readonly value: Value
        readonly supersedes: ClaimId | null
        /** Where people put the value in a `LIST` property; null for every other cardinality. */
        readonly position: FractionalIndex | null
      }
    | { readonly _tag: "RETRACT"; readonly retracts: ClaimId }
  readonly evaluation: Evaluation
}

export interface MachineClaim<Value, Scope extends PropertyScope> extends ClaimBase<Scope> {
  readonly provenance: MachineProvenance
  readonly value: Value
  /**
   * In a `LIST` property, the order the source gave (Wikidata's label before its aliases, Google
   * Books' first author first), among that source's values; null for every other cardinality.
   */
  readonly position: FractionalIndex | null
  readonly moderationStatus: ModerationStatus
}

/**
 * Stated rather than derived from `claimSchema`, whose type doesn't resolve while `Scope` is
 * generic. `checks.ts` asserts a concrete property's decoded claims match it.
 */
export type Claim<Value, Scope extends PropertyScope> =
  | PersonClaim<Value, Scope>
  | MachineClaim<Value, Scope>

export const claimSchema = <
  const Id extends string,
  Value,
  Encoded,
  Scope extends PropertyScope,
  Source extends SourceKey,
>(property: {
  readonly id: Id
  readonly valueSchema: Schema.Codec<Value, Encoded>
  readonly scope: Scope
  readonly cardinality: "ONE" | "SET" | "LIST"
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
  const personProvenance = PersonProvenance.pipe(
    Schema.refine(
      (source): source is AllowedPersonProvenance<Source> => lists(source._tag),
      annotations,
    ),
  )

  const machineProvenance = MachineProvenance.pipe(
    Schema.refine(
      (source): source is AllowedMachineProvenance<Source> =>
        lists(sourceKeyOfMachineProvenance(source)),
      annotations,
    ),
  )

  /** A position exactly when the property is a list. */
  const position = Schema.NullOr(FractionalIndex).check(
    Schema.makeFilter(
      (candidate) =>
        // @todo clearer check below, this code is quite confusing. Do an early return if cardinality !== LIST
        (property.cardinality === "LIST") === (candidate !== null) ||
        (property.cardinality === "LIST"
          ? `${property.id} is a list: its claims need a position`
          : `${property.id} isn't a list: its claims have no position`),
      {
        identifier: "ClaimPosition",
        title: "Claim position",
        description: "A position exactly when the property is a list.",
      },
    ),
  )

  const common = {
    id: ClaimId,
    articleId: WikiArticleId,
    property: Schema.Literal(property.id),
    language: LANGUAGE_COLUMN_SCHEMA[property.scope],
    createdAt: Schema.DateTimeUtcFromString,
  }

  return Schema.Union([
    Schema.Struct({
      ...common,
      provenance: personProvenance,
      change: Schema.Union([
        Schema.TaggedStruct("ASSERT", {
          value: property.valueSchema,
          /** A claim by the same person or another this one replaces once approved. */
          supersedes: Schema.NullOr(ClaimId),
          position,
        }),
        /** Removes a person's claim once approved. Machine claims are disputed instead. */
        Schema.TaggedStruct("RETRACT", { retracts: ClaimId }),
      ]),
      evaluation: Evaluation,
    }),
    Schema.Struct({
      ...common,
      provenance: machineProvenance,
      value: property.valueSchema,
      position,
      moderationStatus: ModerationStatus,
    }),
  ])
}

/** A property's claims, without the shape its sources rule out. */
export type ClaimOf<Property extends { readonly Claim: Schema.Top }> = Exclude<
  Property["Claim"]["Type"],
  { readonly source: never }
>

export const getClaimSourceKey = <Value, Scope extends PropertyScope>(
  claim: Claim<Value, Scope>,
): SourceKey =>
  "moderationStatus" in claim
    ? sourceKeyOfMachineProvenance(claim.provenance)
    : claim.provenance._tag
