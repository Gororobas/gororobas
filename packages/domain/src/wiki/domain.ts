import { Schema, Struct } from "effect"

import { WikiArticleStatus } from "../common/enums.js"
import { PersonId, WikiArticleId, WikiArticleRevisionId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"
import { LoroDocUpdate } from "../crdts/domain.js"
import { WikiArticleEditableData, WikiArticleKind, WikiArticleRevisionRow } from "./wiki-article.js"

export * from "./kinds/index.js"
export * from "./wiki-article-crdt.js"
export * from "./wiki-article-translation.js"
export * from "./wiki-article.js"

/** Search filters will be added once wiki-specific filtering is designed. */
export const WikiSearchParams = Schema.Struct({})
export type WikiSearchParams = typeof WikiSearchParams.Type

export const WikiArticleLookup = Schema.Struct({
  handle: Handle,
  kind: WikiArticleKind,
})
export type WikiArticleLookup = typeof WikiArticleLookup.Type

export const CreateWikiArticlePayload = Schema.Struct({
  wikiArticle: WikiArticleEditableData,
})
export type CreateWikiArticlePayload = typeof CreateWikiArticlePayload.Type

export const CreateWikiArticleInput = Schema.Struct({
  ...CreateWikiArticlePayload.fields,
  createdById: PersonId,
  status: WikiArticleStatus,
})
export type CreateWikiArticleInput = typeof CreateWikiArticleInput.Type

export const CreateWikiArticleRevisionPayload = Schema.Struct({ crdtUpdate: LoroDocUpdate })
export type CreateWikiArticleRevisionPayload = typeof CreateWikiArticleRevisionPayload.Type

export const CreateWikiArticleRevisionInput = Schema.Struct({
  ...CreateWikiArticleRevisionPayload.fields,
  createdById: PersonId,
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

export const WikiArticleRevisionUpdateRow = WikiArticleRevisionRow.mapFields(
  Struct.omit(["createdAt", "createdById", "crdtUpdate", "fromCrdtFrontier", "wikiArticleId"]),
)
