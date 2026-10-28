/**
 * Links from wiki articles and publications to the wiki articles they're about.
 *
 * Links are derived, never contributor-authored: they're projected from the linking entity's
 * content, or inferred from it by the link inference workflows. Each link carries the evidence of
 * where it was established, so people can verify it.
 */
import { Schema } from "effect"

import { WikiArticleId } from "../common/ids.js"
import { TimestampColumn } from "../common/primitives.js"
import { LoroDocFrontier } from "../crdts/domain.js"

export const LinkSource = Schema.Literals([
  /** A contributor placed an `entityReference` node to the linked article. */
  "ENTITY_REFERENCE",
  /** Link inference found the linked article named in the content, by a name or synonym. */
  "MENTION",
  /** Link inference concluded the content is about the linked article without naming it. */
  "INFERENCE",
  /** The legacy Gororobas database tagged the entity with the linked article. */
  "LEGACY_TAG",
])

export type LinkSource = typeof LinkSource.Type

/**
 * One step into a linking entity's data: an object key, an array index, or the item with this ID
 * among a CRDT list's items or a rich-text document's nodes (at any depth).
 */
export const EvidencePathSegment = Schema.Union([
  Schema.String,
  Schema.Int,
  Schema.Struct({ id: Schema.NonEmptyString }),
])

export type EvidencePathSegment = typeof EvidencePathSegment.Type

/**
 * Where evidence sits in the linking entity's data, as a path from its root. Rich-text content is
 * just another value along the way, so a paragraph and a scientific name are located alike:
 * `["translations", "pt", "content", { id: paragraphId }]`,
 * `["attributes", "scientificNames", { id: itemId }]`.
 */
export const EvidenceLocation = Schema.NonEmptyArray(EvidencePathSegment)

export type EvidenceLocation = typeof EvidenceLocation.Type

/**
 * How a language model's quote was found in the source text: verbatim, word for word ignoring case
 * and accents, or by similar words (see `alignQuotes`).
 */
export const AlignmentStatus = Schema.Literals(["EXACT", "NORMALIZED", "FUZZY"])

export type AlignmentStatus = typeof AlignmentStatus.Type

export const EntityReferenceEvidence = Schema.Struct({
  /** Ends at the `entityReference` node's ID. */
  location: EvidenceLocation,
  /** The reference's label, as rendered in the content. */
  text: Schema.String,
})

export type EntityReferenceEvidence = typeof EntityReferenceEvidence.Type

export const MentionEvidence = Schema.Struct({
  location: EvidenceLocation,
  /** The span naming the linked article. */
  text: Schema.NonEmptyString,
  /** Absent for exact dictionary matches, which need no alignment. */
  alignmentStatus: Schema.optional(AlignmentStatus),
})

export type MentionEvidence = typeof MentionEvidence.Type

export const InferenceEvidence = Schema.Struct({
  location: EvidenceLocation,
  /** The span the linked article was inferred from. */
  text: Schema.NonEmptyString,
  /** Why the span implies the linked article, for people verifying the link. */
  rationale: Schema.NonEmptyString,
  alignmentStatus: Schema.optional(AlignmentStatus),
})

export type InferenceEvidence = typeof InferenceEvidence.Type

/**
 * One link per linking entity, linked article and source. A pair can be linked by several sources
 * (named in one paragraph, inferred from another), each a separate claim with its own evidence.
 */
export const makeLink = <const Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.Union([
    Schema.Struct({ ...fields, source: Schema.Literal("LEGACY_TAG") }),
    Schema.Struct({
      ...fields,
      source: Schema.Literal("ENTITY_REFERENCE"),
      evidence: Schema.NonEmptyArray(EntityReferenceEvidence),
    }),
    Schema.Struct({
      ...fields,
      source: Schema.Literal("MENTION"),
      evidence: Schema.NonEmptyArray(MentionEvidence),
    }),
    Schema.Struct({
      ...fields,
      source: Schema.Literal("INFERENCE"),
      evidence: Schema.NonEmptyArray(InferenceEvidence),
    }),
  ])

/** `makeLink` as a SQL row, with evidence in a JSON column. */
export const makeLinkRow = <const Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.Union([
    Schema.Struct({ ...fields, source: Schema.Literal("LEGACY_TAG") }),
    Schema.Struct({
      ...fields,
      source: Schema.Literal("ENTITY_REFERENCE"),
      evidence: Schema.fromJsonString(Schema.NonEmptyArray(EntityReferenceEvidence)),
    }),
    Schema.Struct({
      ...fields,
      source: Schema.Literal("MENTION"),
      evidence: Schema.fromJsonString(Schema.NonEmptyArray(MentionEvidence)),
    }),
    Schema.Struct({
      ...fields,
      source: Schema.Literal("INFERENCE"),
      evidence: Schema.fromJsonString(Schema.NonEmptyArray(InferenceEvidence)),
    }),
  ])

/** Evidence by source, for code that handles one source at a time. */
export type LinkEvidence<Source extends LinkSource> = {
  ENTITY_REFERENCE: EntityReferenceEvidence
  MENTION: MentionEvidence
  INFERENCE: InferenceEvidence
  LEGACY_TAG: never
}[Source]

/** A wiki article link inference would have made, if the article existed. */
const SuggestedNames = Schema.Struct({
  pt: Schema.NonEmptyString,
  es: Schema.NonEmptyString,
  en: Schema.NonEmptyString,
})

export const SuggestedWikiArticle = Schema.Union([
  Schema.Struct({
    names: SuggestedNames,
    source: Schema.Literal("MENTION"),
    evidence: Schema.NonEmptyArray(MentionEvidence),
  }),
  Schema.Struct({
    names: SuggestedNames,
    source: Schema.Literal("INFERENCE"),
    evidence: Schema.NonEmptyArray(InferenceEvidence),
  }),
]).pipe(Schema.toTaggedUnion("source"))

export type SuggestedWikiArticle = typeof SuggestedWikiArticle.Type

/** A link link inference made to an existing wiki article. */
export const InferredLink = Schema.Union([
  Schema.Struct({
    wikiArticleId: WikiArticleId,
    source: Schema.Literal("MENTION"),
    evidence: Schema.NonEmptyArray(MentionEvidence),
  }),
  Schema.Struct({
    wikiArticleId: WikiArticleId,
    source: Schema.Literal("INFERENCE"),
    evidence: Schema.NonEmptyArray(InferenceEvidence),
  }),
]).pipe(Schema.toTaggedUnion("source"))

export type InferredLink = typeof InferredLink.Type

/** Everything a link inference run found: links to existing articles, and articles to suggest. */
export const InferredLinks = Schema.Struct({
  links: Schema.Array(InferredLink),
  suggestions: Schema.Array(SuggestedWikiArticle),
})
export type InferredLinks = typeof InferredLinks.Type

export const LanguageModelInfo = Schema.Struct({
  /** The `effect/ai` provider serving the model, such as `openai` for OpenAI-compatible APIs. */
  provider: Schema.String,
  modelId: Schema.String,
})

export type LanguageModelInfo = typeof LanguageModelInfo.Type

/**
 * The record of a publication's latest link inference run, stored on `publication_sources`. Its
 * links are persisted as rows; the record keeps what rows can't hold.
 */
export const LinkInferenceRun = Schema.Struct({
  version: Schema.String,
  /** `null` when no language model took part. */
  model: Schema.NullOr(LanguageModelInfo),
  crdtFrontier: LoroDocFrontier,
  startedAt: TimestampColumn,
  finishedAt: TimestampColumn,
  suggestions: Schema.Array(SuggestedWikiArticle),
})

export type LinkInferenceRun = typeof LinkInferenceRun.Type
