import {
  PersonId,
  WikiArticleEditableData,
  WikiArticleId,
  WikiArticleRevisionId,
  WikiArticleStatus,
  LoroDocUpdate,
} from "@gororobas/domain"
import { Schema } from "effect"

export const CreateWikiArticleInput = Schema.Struct({
  createdById: PersonId,
  sourceData: WikiArticleEditableData,
  status: WikiArticleStatus,
})
export type CreateWikiArticleInput = typeof CreateWikiArticleInput.Type

export const CreateWikiArticleRevisionInput = Schema.Struct({
  createdById: PersonId,
  crdtUpdate: LoroDocUpdate,
  wikiArticleId: WikiArticleId,
})
export type CreateWikiArticleRevisionInput = typeof CreateWikiArticleRevisionInput.Type

export const EvaluateWikiArticleRevisionInput = Schema.Struct({
  evaluatedById: PersonId,
  evaluation: Schema.Literals(["APPROVED", "REJECTED"]),
  evaluationReason: Schema.optional(Schema.String),
  revisionId: WikiArticleRevisionId,
})
export type EvaluateWikiArticleRevisionInput = typeof EvaluateWikiArticleRevisionInput.Type
