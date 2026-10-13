import { Schema, Struct } from "effect"

import {
  AgroforestryStratum,
  EdiblePlantPart,
  PlantLifecycle,
  PlantUsage,
  PlantingMethod,
  RevisionEvaluation,
  WikiArticleStatus,
} from "../common/enums.js"
import { PersonId, WikiArticleId, WikiArticleRevisionId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"
import { LoroDocUpdate } from "../crdts/domain.js"
import { WikiMediaSelection } from "../media-assets/attachments.js"
import { WikiArticleEditableData, WikiArticleKind, WikiArticleRevisionRow } from "./wiki-article.js"

export * from "./kinds/index.js"
export * from "./wiki-article-translation.js"
export * from "./wiki-article.js"
export * from "./external-data/domain.js"

const WikiSearchText = Schema.optional(Schema.Trimmed.check(Schema.isNonEmpty()))

const NonPlantWikiArticleKind = Schema.Literals(
  WikiArticleKind.literals.filter(
    (kind): kind is Exclude<WikiArticleKind, "PLANT"> => kind !== "PLANT",
  ),
)

export const WikiSearchParams = Schema.Union([
  Schema.Struct({ kind: Schema.optional(Schema.Undefined), text: WikiSearchText }),
  Schema.Struct({
    kind: Schema.Literal("PLANT"),
    text: WikiSearchText,
    plantUsage: Schema.optional(PlantUsage),
    plantLifecycle: Schema.optional(PlantLifecycle),
    plantingMethod: Schema.optional(PlantingMethod),
    stratum: Schema.optional(AgroforestryStratum),
    ediblePart: Schema.optional(EdiblePlantPart),
  }),
  Schema.Struct({
    kind: NonPlantWikiArticleKind,
    text: WikiSearchText,
  }),
])

export type WikiSearchParams = typeof WikiSearchParams.Type

export const WikiArticleLookup = Schema.Struct({
  handle: Handle,
  kind: WikiArticleKind,
})
export type WikiArticleLookup = typeof WikiArticleLookup.Type

export const CreateWikiArticlePayload = Schema.Struct({
  wikiArticle: WikiArticleEditableData,
  mediaAssets: Schema.optional(WikiMediaSelection),
})
export type CreateWikiArticlePayload = typeof CreateWikiArticlePayload.Type

export const CreateWikiArticleInput = Schema.Struct({
  ...CreateWikiArticlePayload.fields,
  createdById: PersonId,
  status: WikiArticleStatus,
})

export type CreateWikiArticleInput = typeof CreateWikiArticleInput.Type

export const CreateWikiArticleRevisionPayload = Schema.Struct({
  crdtUpdate: LoroDocUpdate,
  mediaAssets: Schema.optional(WikiMediaSelection),
})
export type CreateWikiArticleRevisionPayload = typeof CreateWikiArticleRevisionPayload.Type

export const CreateWikiArticleRevisionInput = Schema.Struct({
  ...CreateWikiArticleRevisionPayload.fields,
  createdById: PersonId,
  wikiArticleId: WikiArticleId,
})

export type CreateWikiArticleRevisionInput = typeof CreateWikiArticleRevisionInput.Type

export const EvaluateWikiArticleRevisionPayload = Schema.Struct({
  status: RevisionEvaluation.pick(["APPROVED", "REJECTED"]),
  reason: Schema.optional(Schema.Trimmed.check(Schema.isNonEmpty())),
})
export type EvaluateWikiArticleRevisionPayload = typeof EvaluateWikiArticleRevisionPayload.Type

export const EvaluateWikiArticleRevisionInput = Schema.Struct({
  wikiArticleId: Schema.optional(WikiArticleId),
  evaluatedById: PersonId,
  evaluation: EvaluateWikiArticleRevisionPayload.fields.status,
  evaluationReason: Schema.optional(Schema.String),
  revisionId: WikiArticleRevisionId,
})

export type EvaluateWikiArticleRevisionInput = typeof EvaluateWikiArticleRevisionInput.Type

/** New revisions require an author even though deletion can clear persisted authorship. */
export const WikiArticleRevisionInsertRow = WikiArticleRevisionRow.pipe(
  Schema.fieldsAssign({ createdById: PersonId }),
)

export const WikiArticleRevisionUpdateRow = WikiArticleRevisionRow.mapFields(
  Struct.omit(["createdAt", "createdById", "crdtUpdate", "fromCrdtFrontier", "wikiArticleId"]),
)
