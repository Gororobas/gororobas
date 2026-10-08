import { Match, Option, Schema } from "effect"

import { SupportedLanguage, RevisionEvaluation, WikiArticleStatus } from "../common/enums.js"
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
  createdById: Schema.NullOr(PersonId),
  crdtUpdate: LoroDocUpdate,
  fromCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
  evaluation: RevisionEvaluation,
  evaluationReason: OptionalColumn(Schema.String),
  hasMediaSelection: Schema.BooleanFromBit,
  evaluatedById: OptionalColumn(PersonId),
  evaluatedAt: OptionalColumn(TimestampColumn),
})

export type WikiArticleRevisionRow = typeof WikiArticleRevisionRow.Type

/** Persisted read model derived from the canonical CRDT state. */
export const WikiArticleProjectionRow = Schema.Union([
  WikiAnimalArticle.ProjectionRow,
  WikiBookArticle.ProjectionRow,
  WikiPlantArticle.ProjectionRow,
  WikiPlantCultivarArticle.ProjectionRow,
  WikiConceptArticle.ProjectionRow,
  WikiFilmArticle.ProjectionRow,
  WikiNoteworthyEntityArticle.ProjectionRow,
  WikiResourceArticle.ProjectionRow,
  WikiToolArticle.ProjectionRow,
  WikiUncategorizedArticle.ProjectionRow,
]).pipe(Schema.toTaggedUnion("kind"))

export type WikiArticleProjectionRow = typeof WikiArticleProjectionRow.Type

/** Stable generated route handles, uniquely owned within an article kind. */
export const WikiArticleHandleProjectionRow = Schema.Struct({
  wikiArticleId: WikiArticleId,
  kind: WikiArticleKind,
  handle: Handle,
  language: SupportedLanguage,
})

export type WikiArticleHandleProjectionRow = typeof WikiArticleHandleProjectionRow.Type

export const WikiArticleTranslationProjectionRow = Schema.Union([
  WikiAnimalArticle.TranslationProjectionRow,
  WikiBookArticle.TranslationProjectionRow,
  WikiConceptArticle.TranslationProjectionRow,
  WikiFilmArticle.TranslationProjectionRow,
  WikiNoteworthyEntityArticle.TranslationProjectionRow,
  WikiPlantArticle.TranslationProjectionRow,
  WikiPlantCultivarArticle.TranslationProjectionRow,
  WikiResourceArticle.TranslationProjectionRow,
  WikiToolArticle.TranslationProjectionRow,
  WikiUncategorizedArticle.TranslationProjectionRow,
]).pipe(Schema.toTaggedUnion("kind"))

export type WikiArticleTranslationProjectionRow = typeof WikiArticleTranslationProjectionRow.Type

/** A language-specific article projection returned by the read APIs. */
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
  language: SupportedLanguage,
})

export type WikiArticleQueriedCardData = typeof WikiArticleQueriedCardData.Type

export const projectArticle = (
  editableData: WikiArticleEditableData,
  metadata: Omit<WikiArticleProjectionRow, "kind" | "attributes">,
): WikiArticleProjectionRow => {
  return Match.value(editableData).pipe(
    Match.discriminatorsExhaustive("kind")({
      ANIMAL: (animal) =>
        WikiAnimalArticle.ProjectionRow.make({
          kind: animal.kind,
          attributes: WikiAnimalArticle.projectAttributes(animal.attributes),
          ...metadata,
        }),
      BOOK: (book) =>
        WikiBookArticle.ProjectionRow.make({
          kind: book.kind,
          attributes: WikiBookArticle.projectAttributes(book.attributes),
          ...metadata,
        }),
      CONCEPT: (concept) =>
        WikiConceptArticle.ProjectionRow.make({
          kind: concept.kind,
          attributes: WikiConceptArticle.projectAttributes(concept.attributes),
          ...metadata,
        }),
      FILM: (film) =>
        WikiFilmArticle.ProjectionRow.make({
          kind: film.kind,
          attributes: WikiFilmArticle.projectAttributes(film.attributes),
          ...metadata,
        }),
      NOTEWORTHY_ENTITY: (entity) =>
        WikiNoteworthyEntityArticle.ProjectionRow.make({
          kind: entity.kind,
          attributes: WikiNoteworthyEntityArticle.projectAttributes(entity.attributes),
          ...metadata,
        }),
      PLANT: (plant) =>
        WikiPlantArticle.ProjectionRow.make({
          kind: plant.kind,
          attributes: WikiPlantArticle.projectAttributes(plant.attributes),
          ...metadata,
        }),
      PLANT_CULTIVAR: (cultivar) =>
        WikiPlantCultivarArticle.ProjectionRow.make({
          kind: cultivar.kind,
          attributes: WikiPlantCultivarArticle.projectAttributes(cultivar.attributes),
          ...metadata,
        }),
      RESOURCE: (resource) =>
        WikiResourceArticle.ProjectionRow.make({
          kind: resource.kind,
          attributes: WikiResourceArticle.projectAttributes(resource.attributes),
          ...metadata,
        }),
      TOOL: (tool) =>
        WikiToolArticle.ProjectionRow.make({
          kind: tool.kind,
          attributes: WikiToolArticle.projectAttributes(tool.attributes),
          ...metadata,
        }),
      UNCATEGORIZED: (uncategorized) =>
        WikiUncategorizedArticle.ProjectionRow.make({
          kind: uncategorized.kind,
          attributes: WikiUncategorizedArticle.projectAttributes(uncategorized.attributes),
          ...metadata,
        }),
    }),
  )
}

export const projectTranslation = ({
  article,
  language,
  wikiArticleId,
}: {
  article: WikiArticleEditableData
  language: SupportedLanguage
  wikiArticleId: WikiArticleId
}): Option.Option<WikiArticleTranslationProjectionRow> => {
  const translation = article.translations[language]

  if (!translation) return Option.none()

  return Option.some(
    WikiArticleTranslationProjectionRow.make({
      ...translation,
      wikiArticleId,
      kind: article.kind,
      language,
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
