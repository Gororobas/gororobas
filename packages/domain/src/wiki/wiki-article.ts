import { Match, Schema, Tuple } from "effect"

import { Locale, RevisionEvaluation, WikiArticleStatus } from "../common/enums.js"
import { PersonId, WikiArticleId, WikiArticleRevisionId } from "../common/ids.js"
import { Handle, OptionalColumn, TimestampColumn, TimestampedStruct } from "../common/primitives.js"
import { LoroDocFrontier, LoroDocSnapshot, LoroDocUpdate } from "../crdts/domain.js"
import { WikiAnimalArticle } from "./kinds/animal.js"
import { WikiConceptArticle } from "./kinds/concept.js"
import { WikiPlantArticle } from "./kinds/plant.js"
import { WikiToolArticle } from "./kinds/tool.js"
import { WikiUncategorizedArticle } from "./kinds/uncategorized.js"
import {
  WikiArticleEditableTranslation,
  WikiArticleTranslationMaterializedRow,
} from "./wiki-article-translation.js"

export const WikiArticleEditableData = Schema.Union([
  WikiAnimalArticle.EditableArticle,
  WikiConceptArticle.EditableArticle,
  WikiPlantArticle.EditableArticle,
  WikiToolArticle.EditableArticle,
  WikiUncategorizedArticle.EditableArticle,
]).pipe(Schema.toTaggedUnion("kind"))
export type WikiArticleEditableData = typeof WikiArticleEditableData.Type

export const WikiArticleKind = Schema.Literals(
  WikiArticleEditableData.members.map((m) => m.fields.kind.literal),
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

/** The main queryable article record.*/
export const WikiArticleMaterializedRow = Schema.Union([
  WikiAnimalArticle.MaterializedRow,
  WikiPlantArticle.MaterializedRow,
  WikiConceptArticle.MaterializedRow,
  WikiToolArticle.MaterializedRow,
  WikiUncategorizedArticle.MaterializedRow,
]).pipe(Schema.toTaggedUnion("kind"))
export type WikiArticleMaterializedRow = typeof WikiArticleMaterializedRow.Type

/** Stable generated route handles, uniquely owned within an article kind. */
export const WikiArticleHandleMaterializedRow = Schema.Struct({
  wikiArticleId: WikiArticleId,
  kind: WikiArticleKind,
  handle: Handle,
  locale: Locale,
})
export type WikiArticleHandleMaterializedRow = typeof WikiArticleHandleMaterializedRow.Type

/** A locale-specific article projection returned by the read APIs. */
export const WikiArticleQueriedPageData = WikiArticleMaterializedRow.mapMembers(
  Tuple.map(
    Schema.fieldsAssign({
      ...WikiArticleTranslationMaterializedRow.fields,
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
  commonNames: WikiArticleEditableTranslation.fields.commonNames,
  locale: Locale,
})
export type WikiArticleQueriedCardData = typeof WikiArticleQueriedCardData.Type

export const editableToMaterializedArticle = (
  editableData: WikiArticleEditableData,
  metadata: Omit<WikiArticleMaterializedRow, "kind" | "attributes">,
): WikiArticleMaterializedRow => {
  return Match.value(editableData).pipe(
    Match.discriminatorsExhaustive("kind")({
      ANIMAL: (animal) =>
        WikiAnimalArticle.MaterializedRow.make({
          kind: animal.kind,
          attributes: WikiAnimalArticle.materializeAttributes(animal.attributes),
          ...metadata,
        }),
      CONCEPT: (concept) =>
        WikiConceptArticle.MaterializedRow.make({
          kind: concept.kind,
          attributes: WikiConceptArticle.materializeAttributes(concept.attributes),
          ...metadata,
        }),
      PLANT: (plant) =>
        WikiPlantArticle.MaterializedRow.make({
          kind: plant.kind,
          attributes: WikiPlantArticle.materializeAttributes(plant.attributes),
          ...metadata,
        }),
      TOOL: (tool) =>
        WikiToolArticle.MaterializedRow.make({
          kind: tool.kind,
          attributes: WikiToolArticle.materializeAttributes(tool.attributes),
          ...metadata,
        }),
      UNCATEGORIZED: (uncategorized) =>
        WikiUncategorizedArticle.MaterializedRow.make({
          kind: uncategorized.kind,
          attributes: WikiUncategorizedArticle.materializeAttributes(uncategorized.attributes),
          ...metadata,
        }),
    }),
  )
}
