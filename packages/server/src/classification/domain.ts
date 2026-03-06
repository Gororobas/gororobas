import { Handle, LoroDocFrontier, TagId, TagRow, VegetableId } from "@gororobas/domain"
/**
 * Classification domain types.
 *
 * Defines the shape of the classification JSON stored on `post_crdts.classification`.
 * This data is derived (not user-authored) and stored outside the LoroDoc to avoid
 * CRDT merge complications. It gets materialized into `post_tags` and `post_vegetables`.
 */
import { Schema } from "effect"

export const ModelInfo = Schema.Struct({
  model_id: Schema.String,
  model_type: Schema.Literal("ollama"),
})
export type ModelInfo = typeof ModelInfo.Type

export const LangExtractCharInterval = Schema.Struct({
  start_pos: Schema.optional(Schema.Number),
  end_pos: Schema.optional(Schema.Number),
})
export type LangExtractCharInterval = typeof LangExtractCharInterval.Type

export const LangExtractAlignmentStatus = Schema.Literals([
  "match_exact",
  "match_greater",
  "match_lesser",
  "match_fuzzy",
])
export type LangExtractAlignmentStatus = typeof LangExtractAlignmentStatus.Type

export const CommonExtractionData = Schema.Struct({
  extraction_text: Schema.String,
  extraction_class: Schema.String,
  char_interval: Schema.optional(LangExtractCharInterval),
  alignment_status: Schema.optional(LangExtractAlignmentStatus),
  description: Schema.optional(Schema.String),
  handle: Handle,
  attributes: Schema.Record(
    Schema.String,
    Schema.Union([Schema.String, Schema.Array(Schema.String)]),
  ),
})

export const ResolvedExistingVegetableExtraction = Schema.TaggedStruct(
  "ResolvedExistingVegetableExtraction",
  {
    ...CommonExtractionData.fields,
    vegetable_id: VegetableId,
  },
)
export type ResolvedExistingVegetableExtraction = typeof ResolvedExistingVegetableExtraction.Type

export const SuggestedVegetableExtraction = Schema.TaggedStruct("SuggestedVegetableExtraction", {
  ...CommonExtractionData.fields,
  names: Schema.Struct({
    pt: Schema.String,
    es: Schema.String,
    en: Schema.String,
  }),
})
export type SuggestedVegetableExtraction = typeof SuggestedVegetableExtraction.Type

export const ResolvedVegetableExtraction = Schema.Union([
  ResolvedExistingVegetableExtraction,
  SuggestedVegetableExtraction,
])
export type ResolvedVegetableExtraction = typeof ResolvedVegetableExtraction.Type

export const ResolvedExistingTagExtraction = Schema.TaggedStruct("ResolvedExistingTagExtraction", {
  ...CommonExtractionData.fields,
  tag_id: TagId,
})
export type ResolvedExistingTagExtraction = typeof ResolvedExistingTagExtraction.Type

export const SuggestedTagExtraction = Schema.TaggedStruct("SuggestedTagExtraction", {
  ...CommonExtractionData.fields,
  names: TagRow.fields.names,
})
export type SuggestedTagExtraction = typeof SuggestedTagExtraction.Type

export const ResolvedTagExtraction = Schema.Union([
  ResolvedExistingTagExtraction,
  SuggestedTagExtraction,
])
export type ResolvedTagExtraction = typeof ResolvedTagExtraction.Type

/**
 * The full classification stored as JSON on `post_crdts.classification`.
 * Pinned to a specific content snapshot via `content_hash` and `crdt_frontier`.
 */
export const PostClassification = Schema.Struct({
  version: Schema.String,
  model_info: ModelInfo,
  content_hash: Schema.String,
  crdt_frontier: LoroDocFrontier,
  started_at: Schema.DateTimeUtc,
  finished_at: Schema.DateTimeUtc,
  vegetables: Schema.Array(ResolvedVegetableExtraction),
  tags: Schema.Array(ResolvedTagExtraction),
})
export type PostClassification = typeof PostClassification.Type
