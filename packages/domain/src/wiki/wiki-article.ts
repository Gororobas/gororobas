import { Schema, Tuple } from "effect"

import { Locale, RevisionEvaluation, WikiArticleStatus } from "../common/enums.js"
import { PersonId, WikiArticleId, WikiArticleRevisionId } from "../common/ids.js"
import { Handle, OptionalColumn, TimestampColumn, TimestampedStruct } from "../common/primitives.js"
import { LoroDocFrontier, LoroDocSnapshot, LoroDocUpdate } from "../crdts/domain.js"
import { AnimalArticleData } from "./animal.js"
import { ConceptArticleData } from "./concept.js"
import { PlantArticleData } from "./plant.js"
import { ToolArticleData } from "./tool.js"
import { UncategorizedArticleData } from "./uncategorized.js"
import { WikiArticleTranslation } from "./wiki-article-translation.js"

export const WikiArticleEditableData = Schema.Union([
  AnimalArticleData,
  ConceptArticleData,
  PlantArticleData,
  ToolArticleData,
  UncategorizedArticleData,
])
export type WikiArticleEditableData = typeof WikiArticleEditableData.Type

export const WikiArticleKind = Schema.Literals(
  WikiArticleEditableData.members.map((m) => m.fields._tag.schema.literal),
)
export type WikiArticleKind = typeof WikiArticleKind.Type

/** Stores the canonical contributor-editable state + the status. */
export const WikiArticleCrdtRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: WikiArticleId,
  status: WikiArticleStatus,
  crdtSnapshot: LoroDocSnapshot,
})
export type WikiArticleCrdtRow = typeof WikiArticleCrdtRow.Type

/** A submitted change that has not necessarily changed the canonical article. */
export const WikiArticleRevisionRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: WikiArticleRevisionId,
  wikiArticleId: WikiArticleId,
  createdById: PersonId,
  crdtUpdate: LoroDocUpdate,
  fromCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
  evaluation: RevisionEvaluation,
  evaluationReason: OptionalColumn(Schema.String),
  evaluatedById: OptionalColumn(PersonId),
  evaluatedAt: OptionalColumn(TimestampColumn),
})
export type WikiArticleRevisionRow = typeof WikiArticleRevisionRow.Type

const coreWikiArticleMaterializedRowFields = {
  ...TimestampedStruct.fields,
  id: WikiArticleId,
  status: WikiArticleStatus,
  currentCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
} as const

/** The main queryable article record.*/
export const WikiArticleMaterializedRow = WikiArticleEditableData.mapMembers(
  // @todo find a way to automatically encode/decode `kind` as `_tag`
  Tuple.map(Schema.fieldsAssign(coreWikiArticleMaterializedRowFields)),
)
export type WikiArticleMaterializedRow = typeof WikiArticleMaterializedRow.Type

/** Per-locale materialization of contributor-editable names and content. */
export const WikiArticleTranslationMaterializedRow = Schema.Struct({
  ...WikiArticleTranslation.fields,
  wikiArticleId: WikiArticleId,
  locale: Locale,
  contentPlainText: Schema.String,
  searchableNames: Schema.String,
  // @todo is this needed?
  commonNames: Schema.fromJsonString(WikiArticleTranslation.fields.commonNames),
  content: Schema.fromJsonString(WikiArticleTranslation.fields.content),
})
export type WikiArticleTranslationMaterializedRow =
  typeof WikiArticleTranslationMaterializedRow.Type

/** Stable generated route handles, scoped to an article kind and locale. */
export const WikiArticleHandleMaterializedRow = Schema.Struct({
  wikiArticleId: WikiArticleId,
  kind: WikiArticleKind,
  locale: Locale,
  handle: Handle,
})
export type WikiArticleHandleMaterializedRow = typeof WikiArticleHandleMaterializedRow.Type

/** A locale-specific article projection returned by the read APIs. */
export const WikiArticleQueriedPageData = WikiArticleEditableData.mapMembers(
  Tuple.map(
    // @todo find a way to automatically encode/decode `kind` as `_tag`
    Schema.fieldsAssign({
      ...coreWikiArticleMaterializedRowFields,
      ...WikiArticleTranslation.fields,
      id: WikiArticleId,
      handle: Handle,
      locale: Locale,
    }),
  ),
)
export type WikiArticleQueriedPageData = typeof WikiArticleQueriedPageData.Type

export const WikiArticleQueriedCardData = Schema.Struct({
  id: WikiArticleId,
  handle: Handle,
  kind: WikiArticleKind,
  commonNames: WikiArticleTranslation.fields.commonNames,
  locale: Locale,
})
export type WikiArticleQueriedCardData = typeof WikiArticleQueriedCardData.Type
