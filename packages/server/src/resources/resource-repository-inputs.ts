import {
  LoroDocFrontier,
  PersonId,
  ResourceId,
  ResourceRevisionId,
  RevisionEvaluation,
  SourceResourceData,
  TiptapDocument,
} from "@gororobas/domain"
import { Schema } from "effect"

export const CreateResourceInput = Schema.Struct({
  createdById: PersonId,
  sourceData: SourceResourceData,
})
export type CreateResourceInput = typeof CreateResourceInput.Type

export const CreateResourceRevisionInput = Schema.Struct({
  createdById: PersonId,
  resourceId: ResourceId,
  expectedCurrentCrdtFrontier: LoroDocFrontier,
  title: Schema.optional(Schema.Trimmed.check(Schema.isNonEmpty())),
  description: Schema.optional(Schema.NullOr(TiptapDocument)),
  creditLine: Schema.optional(Schema.NullOr(Schema.String)),
})
export type CreateResourceRevisionInput = typeof CreateResourceRevisionInput.Type

export const EvaluateResourceRevisionInput = Schema.Struct({
  revisionId: ResourceRevisionId,
  evaluatedById: PersonId,
  evaluation: RevisionEvaluation,
})
export type EvaluateResourceRevisionInput = typeof EvaluateResourceRevisionInput.Type
