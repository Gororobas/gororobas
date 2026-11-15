/**
 * A claim is one source asserting one value of one property about one article. Its shape follows
 * its property's type and its source's lifecycle, so invalid states don't decode.
 *
 * Canonical claims (`defineCanonicalProperty`):
 *
 * - A person's claim proposes asserting or retracting a value, and has an evaluation: a curator
 *   accepts it or not. Where sources disagree, the most authoritative wins; the answer is never
 *   final, so anyone may propose a correction.
 * - A machine's claim asserts, and has a moderation status. It's never pending, never retracts.
 *
 * Situated claims (`defineSituatedProperty`) come in three, none reviewed before it shows:
 *
 * - **Direct**: a person's say, made on the article.
 * - **Inferred**: a person's say, read by a machine from a passage of their own public
 *   publication. It counts like a direct claim, marked as inferred, and the author may confirm,
 *   fix or remove it.
 * - **External source**: what a provider the property lists says (Syntropedia on `strata`),
 *   shown by name and never counted among people.
 *
 * A property's `Claim` schema only accepts the sources it lists, in its type too: `make` on a
 * people-only property won't take a provider source.
 *
 * A person's canonical claim may only supersede or retract an older person's claim about the same
 * article, property and language. The server checks it when the claim is written; resolution
 * ignores references that break it, which is also what keeps them from forming cycles.
 */
import { Array as EffectArray, DateTime, Order, Predicate, Schema } from "effect"

import { ModerationStatus, SupportedLanguage } from "../common/enums.js"
import {
  MediaAssetId,
  PersonId,
  PublicationId,
  TiptapNodeId,
  WikiArticleId,
} from "../common/ids.js"
import { IntNonNegative, NonEmptyTrimmedString, UrlAsString } from "../common/primitives.js"
import { makeRange } from "../common/range.js"
import { PartialDate, isPartialDateNotAfter } from "../common/utils/dates.js"
import { LanguageModelInfo } from "../links/domain.js"
import {
  type AllowedMachineProvenance,
  type AllowedPersonProvenance,
  MachineProvenance,
  ClaimId,
  PersonProvenance,
  type ProvenanceSourceKey,
  sourceKeyOfMachineProvenance,
} from "./provenance.js"
import type { Provider } from "./providers/index.js"
import { FractionalIndex } from "./values/fractional-index.js"

/** A curator's verdict on something people proposed: a canonical claim or an article text revision. */
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

/** The fields every claim has, canonical or situated. */
export const claimBaseFields = <const Id extends string, Scope extends PropertyScope>(property: {
  readonly id: Id
  readonly scope: Scope
}) => ({
  id: ClaimId,
  articleId: WikiArticleId,
  property: Schema.Literal(property.id),
  language: LANGUAGE_COLUMN_SCHEMA[property.scope],
  createdAt: Schema.DateTimeUtcFromString,
})

/** The language a claim is stored in, and the one a reader asks for. */
export type LanguageOf<Scope extends PropertyScope> = {
  readonly UNIVERSAL: null
  readonly LANGUAGE_SPECIFIC: SupportedLanguage
}[Scope]

export interface ClaimBase<Scope extends PropertyScope> {
  readonly id: ClaimId
  readonly articleId: WikiArticleId
  readonly property: string
  readonly language: LanguageOf<Scope>
  readonly createdAt: DateTime.Utc
}

/**
 * Oldest first, and claims created in the same millisecond by ID, so any two claims compare the
 * same way wherever they're sorted.
 */
type Chronological = Pick<ClaimBase<PropertyScope>, "createdAt" | "id">

export const oldestClaimFirst: Order.Order<Chronological> = Order.combine(
  Order.mapInput(Order.Number, (claim: Chronological) => DateTime.toEpochMillis(claim.createdAt)),
  Order.mapInput(Order.String, (claim: Chronological) => claim.id),
)

/** How many people did something, with a few of them to show as avatars. */
export const PeopleSummary = Schema.Struct({
  totalCount: IntNonNegative,
  /** The most recent ones, at most three. */
  samplePeopleIds: Schema.Array(PersonId).check(Schema.isMaxLength(3)),
})

export type PeopleSummary = typeof PeopleSummary.Type

/**
 * The distinct people who made some claims, with the three most recent to show. Claims by
 * deleted accounts count once each: nobody can tell whose they were.
 */
export const summarizeAuthors = (
  claims: ReadonlyArray<{
    readonly provenance: PersonProvenance
    readonly createdAt: DateTime.Utc
  }>,
): PeopleSummary => {
  const mostRecentFirst = EffectArray.sort(
    claims,
    Order.flip(
      Order.mapInput(Order.Number, (claim: { readonly createdAt: DateTime.Utc }) =>
        DateTime.toEpochMillis(claim.createdAt),
      ),
    ),
  )

  const knownPeople = EffectArray.dedupe(
    mostRecentFirst.flatMap(({ provenance }) =>
      provenance.authorId === null ? [] : [provenance.authorId],
    ),
  )

  const byDeletedAccounts = claims.filter(({ provenance }) => provenance.authorId === null)

  return {
    totalCount: knownPeople.length + byDeletedAccounts.length,
    samplePeopleIds: knownPeople.slice(0, 3),
  }
}

/** The narrowing both property types apply to a claim's provenance: only sources the property lists. */
const listedSourceAnnotations = (propertyId: string) => ({
  identifier: "ClaimFromListedSource",
  title: "Claim from a listed source",
  description: `A source ${propertyId} lists among its sources.`,
})

const listsSource =
  (sourceKeys: ReadonlyArray<ProvenanceSourceKey>) => (key: ProvenanceSourceKey) =>
    sourceKeys.some((sourceKey) => sourceKey === key)

/**
 * Narrowed on the provenance rather than on the claim, whose type doesn't resolve while generic.
 * A property listing no person leaves people's claim shapes with a `never` provenance: they can't
 * be made or decoded, and `ClaimOf` drops them.
 */
const personProvenanceOf = <AvailableSource extends ProvenanceSourceKey>(property: {
  readonly id: string
  readonly sourceKeys: ReadonlyArray<AvailableSource>
}) =>
  PersonProvenance.pipe(
    Schema.refine(
      (provenance): provenance is AllowedPersonProvenance<AvailableSource> =>
        listsSource(property.sourceKeys)(provenance._tag),
      listedSourceAnnotations(property.id),
    ),
  )

// Canonical claims

export interface CanonicalPersonClaim<Value, Scope extends PropertyScope> extends ClaimBase<Scope> {
  readonly provenance: PersonProvenance
  /** Why, for the curator and the history: "from Embrapa's 2019 booklet". */
  readonly note: typeof NonEmptyTrimmedString.Type | null
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

export interface CanonicalMachineClaim<
  Value,
  Scope extends PropertyScope,
> extends ClaimBase<Scope> {
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
 * Stated rather than derived from `canonicalClaimSchema`, whose type doesn't resolve while `Scope` is
 * generic. `checks.ts` asserts a concrete property's decoded claims match it.
 */
export type CanonicalClaim<Value, Scope extends PropertyScope> =
  | CanonicalPersonClaim<Value, Scope>
  | CanonicalMachineClaim<Value, Scope>

export const canonicalClaimSchema = <
  const Id extends string,
  Value,
  Encoded,
  Scope extends PropertyScope,
  AvailableSource extends ProvenanceSourceKey,
>(property: {
  readonly id: Id
  readonly valueSchema: Schema.Codec<Value, Encoded>
  readonly scope: Scope
  readonly cardinality: "ONE" | "SET" | "LIST"
  readonly sourceKeys: ReadonlyArray<AvailableSource>
}) => {
  const machineProvenance = MachineProvenance.pipe(
    Schema.refine(
      (provenance): provenance is AllowedMachineProvenance<AvailableSource> =>
        listsSource(property.sourceKeys)(sourceKeyOfMachineProvenance(provenance)),
      listedSourceAnnotations(property.id),
    ),
  )

  /** A position exactly when the property is a list. */
  const position = Schema.NullOr(FractionalIndex).check(
    Schema.makeFilter(
      (candidate) => {
        if (property.cardinality !== "LIST") {
          return candidate === null || `${property.id} isn't a list: its claims have no position`
        }
        return candidate !== null || `${property.id} is a list: its claims need a position`
      },
      {
        identifier: "ClaimPosition",
        title: "Claim position",
        description: "A position exactly when the property is a list.",
      },
    ),
  )

  const common = claimBaseFields(property)

  return Schema.Union([
    Schema.Struct({
      ...common,
      provenance: personProvenanceOf(property),
      note: Schema.NullOr(NonEmptyTrimmedString),
      change: Schema.Union([
        Schema.TaggedStruct("ASSERT", {
          value: property.valueSchema,
          /** A claim by the same person or another this one replaces once approved. */
          supersedes: Schema.NullOr(ClaimId),
          position,
        }),
        /** Removes a person's claim once approved. Machine claims are reported instead. */
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
  { readonly provenance: never }
>

export const getClaimSourceKey = <Value, Scope extends PropertyScope>(
  claim: CanonicalClaim<Value, Scope>,
): ProvenanceSourceKey =>
  "moderationStatus" in claim
    ? sourceKeyOfMachineProvenance(claim.provenance)
    : claim.provenance._tag

// Situated claims

/**
 * How a person knows what they claim. Labelled per article kind ("vi ou plantei", "tenho o
 * livro").
 */
export const ClaimBasis = Schema.TaggedUnion({
  OWN_EXPERIENCE: {},
  /**
   * A book, booklet, article or web page: one in the encyclopedia when it's there, or a link to
   * it.
   */
  PUBLISHED_WORK: {
    work: Schema.NullOr(WikiArticleId),
    url: Schema.NullOr(UrlAsString),
    /** A page, a table, or the work's title when it's neither in the encyclopedia nor online. */
    detail: Schema.NullOr(NonEmptyTrimmedString),
  },
  /** A neighbour, a course, a mutirão. */
  SOMEONE_ELSE: {
    /** When they're on Gororobas, so readers can find them. */
    personId: Schema.NullOr(PersonId),
    who: Schema.NullOr(NonEmptyTrimmedString),
  },
})

export type ClaimBasis = typeof ClaimBasis.Type

/**
 * When a claim held ("the 2025 winter", "from 2019 to 2023", "since 2020"): a single moment has
 * the same start and end, an ongoing one only a start.
 */
export const ClaimPeriod = makeRange({
  bound: PartialDate,
  isLessThanOrEqual: isPartialDateNotAfter,
  identifier: "ClaimPeriod",
  title: "Claim period",
})

/**
 * Where and when a claim holds. The place defaults to the region on the person's profile, and
 * only a region is ever shown, never an address. Readers filter by both; nothing is weighted by
 * them.
 */
export const ClaimContext = Schema.Struct({
  place: Schema.NullOr(WikiArticleId),
  /** When it happened, when that isn't when the claim was made. */
  period: Schema.NullOr(ClaimPeriod),
})

export type ClaimContext = typeof ClaimContext.Type

/** The passage of a publication an inferred claim rests on: the quote readers can check. */
export const InferencePassage = Schema.Struct({
  publicationId: PublicationId,
  nodeId: TiptapNodeId,
  quote: Schema.NonEmptyString,
})

export type InferencePassage = typeof InferencePassage.Type

export const MAX_ATTACHMENTS = 4

/** What direct and inferred claims share: a person's say, with how they know and where it holds. */
interface SituatedPersonClaimBase<Value, Scope extends PropertyScope> extends ClaimBase<Scope> {
  readonly provenance: PersonProvenance
  readonly value: Value
  readonly context: ClaimContext
  readonly basis: ClaimBasis | null
  readonly note: typeof NonEmptyTrimmedString.Type | null
  readonly attachments: ReadonlyArray<MediaAssetId>
  readonly moderationStatus: ModerationStatus
}

export interface SituatedDirectClaim<
  Value,
  Scope extends PropertyScope,
> extends SituatedPersonClaimBase<Value, Scope> {
  readonly _tag: "DIRECT"
}

/** Never read from private notes, nor from anyone's publication but the author's own. */
export interface SituatedInferredClaim<
  Value,
  Scope extends PropertyScope,
> extends SituatedPersonClaimBase<Value, Scope> {
  readonly _tag: "INFERRED"
  readonly passage: InferencePassage
  readonly model: LanguageModelInfo | null
  /** The inference workflow's version, bumped when prompts or extraction change. */
  readonly version: string
  readonly confidence: number
  /** When the author confirmed the reading. Confirming keeps the claim inferred, with its passage. */
  readonly confirmedAt: DateTime.Utc | null
}

export interface SituatedExternalSourceClaim<
  Value,
  Scope extends PropertyScope,
> extends ClaimBase<Scope> {
  readonly _tag: "EXTERNAL_SOURCE"
  readonly provenance: Extract<MachineProvenance, { readonly _tag: "EXTERNAL_PROVIDER" }>
  readonly value: Value
  readonly moderationStatus: ModerationStatus
}

export type SituatedPersonClaim<Value, Scope extends PropertyScope> =
  | SituatedDirectClaim<Value, Scope>
  | SituatedInferredClaim<Value, Scope>

/**
 * Stated rather than derived from `situatedClaimSchema`, whose type doesn't resolve while `Scope`
 * is generic. `checks.ts` asserts a concrete property's decoded claims match it.
 */
export type SituatedClaim<Value, Scope extends PropertyScope> =
  | SituatedPersonClaim<Value, Scope>
  | SituatedExternalSourceClaim<Value, Scope>

export const isSituatedPersonClaim = <Value, Scope extends PropertyScope>(
  claim: SituatedClaim<Value, Scope>,
): claim is SituatedPersonClaim<Value, Scope> => !Predicate.isTagged(claim, "EXTERNAL_SOURCE")

export const isSituatedInferredClaim = <Value, Scope extends PropertyScope>(
  claim: SituatedClaim<Value, Scope>,
): claim is SituatedInferredClaim<Value, Scope> => Predicate.isTagged(claim, "INFERRED")

export const situatedSourceKeyOf = <Value, Scope extends PropertyScope>(
  claim: SituatedClaim<Value, Scope>,
): ProvenanceSourceKey => (isSituatedPersonClaim(claim) ? "PERSON" : claim.provenance.provider)

export const situatedClaimSchema = <
  const Id extends string,
  Value,
  Encoded,
  Scope extends PropertyScope,
  AvailableSource extends ProvenanceSourceKey,
>(property: {
  readonly id: Id
  readonly valueSchema: Schema.Codec<Value, Encoded>
  readonly scope: Scope
  readonly sourceKeys: ReadonlyArray<AvailableSource>
  readonly isInferable: boolean
}) => {
  const providerProvenance = MachineProvenance.cases.EXTERNAL_PROVIDER.pipe(
    Schema.refine(
      (
        provenance,
      ): provenance is typeof MachineProvenance.cases.EXTERNAL_PROVIDER.Type & {
        readonly provider: Extract<AvailableSource, Provider>
      } => listsSource(property.sourceKeys)(provenance.provider),
      listedSourceAnnotations(property.id),
    ),
  )

  const common = claimBaseFields(property)

  const personFields = {
    ...common,
    provenance: personProvenanceOf(property),
    value: property.valueSchema,
    context: ClaimContext,
    basis: Schema.NullOr(ClaimBasis),
    note: Schema.NullOr(NonEmptyTrimmedString),
    attachments: Schema.Array(MediaAssetId).check(Schema.isMaxLength(MAX_ATTACHMENTS)),
    moderationStatus: ModerationStatus,
  }

  return Schema.Union([
    Schema.TaggedStruct("DIRECT", personFields),
    Schema.TaggedStruct("INFERRED", {
      ...personFields,
      passage: InferencePassage,
      model: Schema.NullOr(LanguageModelInfo),
      version: Schema.String,
      confidence: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
      confirmedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
    }).check(
      Schema.makeFilter(
        () =>
          property.isInferable ||
          `${property.id} isn't inferred from publications: its claims are direct`,
        {
          identifier: "InferableProperty",
          title: "Inferable property",
          description: "Inferred claims only of properties that let people's claims be inferred.",
        },
      ),
    ),
    Schema.TaggedStruct("EXTERNAL_SOURCE", {
      ...common,
      provenance: providerProvenance,
      value: property.valueSchema,
      moderationStatus: ModerationStatus,
    }),
  ])
}
