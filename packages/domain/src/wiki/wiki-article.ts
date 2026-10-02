import { Match, Option, Schema } from "effect"

import { Locale, RevisionEvaluation, WikiArticleStatus } from "../common/enums.js"
import { PersonId, WikiArticleId, WikiArticleRevisionId } from "../common/ids.js"
import { Handle, OptionalColumn, TimestampColumn, TimestampedStruct } from "../common/primitives.js"
import { strToSearchTokens } from "../common/utils/strings.js"
import { LoroDocFrontier, LoroDocSnapshot, LoroDocUpdate } from "../crdts/domain.js"
import { tiptapToText } from "../rich-text/tiptap-to-text.js"
import { WikiAnimalArticle } from "./kinds/animal.js"
import { WikiBookArticle } from "./kinds/book.js"
import { WikiConceptArticle } from "./kinds/concept.js"
import { WikiFilmArticle } from "./kinds/film.js"
import { WikiNoteworthyEntityArticle } from "./kinds/noteworthy-entity.js"
import { WikiPlantCultivarArticle } from "./kinds/plant-cultivar.js"
import { WikiPlantArticle } from "./kinds/plant.js"
import { WikiResourceArticle } from "./kinds/resource.js"
import { WikiToolArticle } from "./kinds/tool.js"
import { WikiUncategorizedArticle } from "./kinds/uncategorized.js"
import { WikiArticleEditableTranslation } from "./wiki-article-translation.js"

export const WikiArticleEditableData = Schema.Union([
  WikiAnimalArticle.EditableArticle,
  WikiBookArticle.EditableArticle,
  WikiConceptArticle.EditableArticle,
  WikiFilmArticle.EditableArticle,
  WikiNoteworthyEntityArticle.EditableArticle,
  WikiPlantArticle.EditableArticle,
  WikiPlantCultivarArticle.EditableArticle,
  WikiResourceArticle.EditableArticle,
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
  WikiBookArticle.MaterializedRow,
  WikiPlantArticle.MaterializedRow,
  WikiPlantCultivarArticle.MaterializedRow,
  WikiConceptArticle.MaterializedRow,
  WikiFilmArticle.MaterializedRow,
  WikiNoteworthyEntityArticle.MaterializedRow,
  WikiResourceArticle.MaterializedRow,
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

export const WikiArticleTranslationMaterializedRow = Schema.Union([
  WikiAnimalArticle.TranslationMaterializedRow,
  WikiBookArticle.TranslationMaterializedRow,
  WikiConceptArticle.TranslationMaterializedRow,
  WikiFilmArticle.TranslationMaterializedRow,
  WikiNoteworthyEntityArticle.TranslationMaterializedRow,
  WikiPlantArticle.TranslationMaterializedRow,
  WikiPlantCultivarArticle.TranslationMaterializedRow,
  WikiResourceArticle.TranslationMaterializedRow,
  WikiToolArticle.TranslationMaterializedRow,
  WikiUncategorizedArticle.TranslationMaterializedRow,
]).pipe(Schema.toTaggedUnion("kind"))
export type WikiArticleTranslationMaterializedRow =
  typeof WikiArticleTranslationMaterializedRow.Type

/** A locale-specific article projection returned by the read APIs. */
export const WikiArticleQueriedPageData = Schema.Union([
  WikiAnimalArticle.QueriedPageData,
  WikiBookArticle.QueriedPageData,
  WikiConceptArticle.QueriedPageData,
  WikiFilmArticle.QueriedPageData,
  WikiNoteworthyEntityArticle.QueriedPageData,
  WikiPlantArticle.QueriedPageData,
  WikiPlantCultivarArticle.QueriedPageData,
  WikiResourceArticle.QueriedPageData,
  WikiToolArticle.QueriedPageData,
  WikiUncategorizedArticle.QueriedPageData,
]).pipe(Schema.toTaggedUnion("kind"))
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
      BOOK: (book) =>
        WikiBookArticle.MaterializedRow.make({
          kind: book.kind,
          attributes: WikiBookArticle.materializeAttributes(book.attributes),
          ...metadata,
        }),
      CONCEPT: (concept) =>
        WikiConceptArticle.MaterializedRow.make({
          kind: concept.kind,
          attributes: WikiConceptArticle.materializeAttributes(concept.attributes),
          ...metadata,
        }),
      FILM: (film) =>
        WikiFilmArticle.MaterializedRow.make({
          kind: film.kind,
          attributes: WikiFilmArticle.materializeAttributes(film.attributes),
          ...metadata,
        }),
      NOTEWORTHY_ENTITY: (entity) =>
        WikiNoteworthyEntityArticle.MaterializedRow.make({
          kind: entity.kind,
          attributes: WikiNoteworthyEntityArticle.materializeAttributes(entity.attributes),
          ...metadata,
        }),
      PLANT: (plant) =>
        WikiPlantArticle.MaterializedRow.make({
          kind: plant.kind,
          attributes: WikiPlantArticle.materializeAttributes(plant.attributes),
          ...metadata,
        }),
      PLANT_CULTIVAR: (cultivar) =>
        WikiPlantCultivarArticle.MaterializedRow.make({
          kind: cultivar.kind,
          attributes: WikiPlantCultivarArticle.materializeAttributes(cultivar.attributes),
          ...metadata,
        }),
      RESOURCE: (resource) =>
        WikiResourceArticle.MaterializedRow.make({
          kind: resource.kind,
          attributes: WikiResourceArticle.materializeAttributes(resource.attributes),
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

export const editableToMaterializedTranslation = (
  article: WikiArticleEditableData,
  locale: Locale,
  wikiArticleId: WikiArticleId,
): Option.Option<WikiArticleTranslationMaterializedRow> => {
  const translation = article.translations[locale]

  if (!translation) return Option.none()

  return Option.some(
    WikiArticleTranslationMaterializedRow.make({
      ...translation,
      wikiArticleId,
      kind: article.kind,
      locale,
      commonNames: translation.commonNames.map((name) => name.value),
      searchableNames: strToSearchTokens(
        translation.commonNames.map((name) => name.value).join(" "),
      ),
      contentPlainText: Option.match(translation.content, {
        onNone: () => "",
        onSome: tiptapToText,
      }),
      // This is solely to make TS happy
      // @todo is there a better way to type this construction?
      origin: "origin" in translation ? translation.origin : Option.none(),
    }),
  )
}
