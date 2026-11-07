import { Schema, Struct } from "effect"
import * as Quantity from "effect-units/Quantity"
import * as Temperature from "effect-units/Temperature"

import {
  AgroforestryStratum,
  AnimalRole,
  ContentChannelType,
  EdiblePlantPart,
  NoteworthyEntityType,
  PlantLifecycle,
  PlantUsage,
  PlantingMethod,
  ResourceFormat,
  RevisionEvaluation,
  SupportedLanguage,
  ToolUsage,
  WikiArticleStatus,
} from "../common/enums.js"
import { PersonId, WikiArticleId, WikiArticleRevisionId } from "../common/ids.js"
import { Centimeters, Handle, IntNonNegative, TemperatureInCelsius } from "../common/primitives.js"
import { PartialDate } from "../common/utils/dates.js"
import { LoroDocUpdate } from "../crdts/domain.js"
import { WikiMediaSelection } from "../media-assets/attachments.js"
import { WikiArticleEditableData, WikiArticleKind, WikiArticleRevisionRow } from "./wiki-article.js"

export * from "./kinds/index.js"
export * from "./wiki-article-translation.js"
export * from "./wiki-article.js"
export * from "./wiki-article-page.js"
export * from "./pages/place.js"
export * from "./pages/plant-cultivar.js"
export * from "./wiki-article-relation.js"
export * from "./wiki-article-people.js"
export * from "./external-data/domain.js"

const WikiSearchText = Schema.optional(Schema.Trimmed.check(Schema.isNonEmpty()))
const WikiSearchLanguage = Schema.optional(SupportedLanguage)

const WikiArticleKindWithoutSearchFilters = Schema.Literals(
  WikiArticleKind.literals.filter(
    (
      kind,
    ): kind is Exclude<
      WikiArticleKind,
      | "PLANT"
      | "BOOK"
      | "FILM"
      | "NOTEWORTHY_ENTITY"
      | "NOTEWORTHY_PERSON"
      | "ANIMAL"
      | "TOOL"
      | "RESOURCE"
      | "CONTENT_PRODUCER"
    > =>
      ![
        "PLANT",
        "BOOK",
        "FILM",
        "NOTEWORTHY_ENTITY",
        "NOTEWORTHY_PERSON",
        "ANIMAL",
        "TOOL",
        "RESOURCE",
        "CONTENT_PRODUCER",
      ].includes(kind),
  ),
)

/**
 * A chosen article kind with the filters only that kind offers, such as a plant's uses. The source
 * of truth for what searches can filter: clients build their filter UIs and URLs from it.
 */
export const WikiKindSearchFilters = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("PLANT"),
    plantUsages: Schema.optionalKey(Schema.Array(PlantUsage)),
    plantLifecycles: Schema.optionalKey(Schema.Array(PlantLifecycle)),
    plantingMethods: Schema.optionalKey(Schema.Array(PlantingMethod)),
    strata: Schema.optionalKey(Schema.Array(AgroforestryStratum)),
    edibleParts: Schema.optionalKey(Schema.Array(EdiblePlantPart)),
    developmentCycleMin: Schema.optional(IntNonNegative),
    developmentCycleMax: Schema.optional(IntNonNegative),
    heightMin: Schema.optional(Centimeters),
    heightMax: Schema.optional(Centimeters),
    temperatureMin: Schema.optional(TemperatureInCelsius),
    temperatureMax: Schema.optional(TemperatureInCelsius),
  }).check(
    Schema.makeFilter(
      (filters) => {
        if (
          filters.developmentCycleMin !== undefined &&
          filters.developmentCycleMax !== undefined &&
          filters.developmentCycleMin > filters.developmentCycleMax
        ) {
          return "Development cycle minimum must not exceed maximum"
        }

        if (
          filters.heightMin !== undefined &&
          filters.heightMax !== undefined &&
          !Quantity.isLessThanOrEqualTo(filters.heightMin, filters.heightMax)
        ) {
          return "Height minimum must not exceed maximum"
        }

        if (
          filters.temperatureMin !== undefined &&
          filters.temperatureMax !== undefined &&
          !Temperature.isLessThanOrEqualTo(filters.temperatureMin, filters.temperatureMax)
        ) {
          return "Temperature minimum must not exceed maximum"
        }

        return true
      },
      {
        identifier: "WikiPlantSearchRange",
        title: "Valid plant search ranges",
        description: "Each supplied minimum must not exceed its corresponding maximum.",
      },
    ),
  ),
  Schema.Struct({
    kind: Schema.Literal("BOOK"),
    publicationDateMin: Schema.optional(PartialDate),
    publicationDateMax: Schema.optional(PartialDate),
    pageCountMin: Schema.optional(IntNonNegative),
    pageCountMax: Schema.optional(IntNonNegative),
  }),
  Schema.Struct({
    kind: Schema.Literal("FILM"),
    releaseDateMin: Schema.optional(PartialDate),
    releaseDateMax: Schema.optional(PartialDate),
  }),
  Schema.Struct({
    kind: Schema.Literal("NOTEWORTHY_ENTITY"),
    entityTypes: Schema.optionalKey(Schema.Array(NoteworthyEntityType)),
    foundedDateMin: Schema.optional(PartialDate),
    foundedDateMax: Schema.optional(PartialDate),
    dissolvedDateMin: Schema.optional(PartialDate),
    dissolvedDateMax: Schema.optional(PartialDate),
  }),
  Schema.Struct({
    kind: Schema.Literal("NOTEWORTHY_PERSON"),
    birthDateMin: Schema.optional(PartialDate),
    birthDateMax: Schema.optional(PartialDate),
    deathDateMin: Schema.optional(PartialDate),
    deathDateMax: Schema.optional(PartialDate),
  }),
  Schema.Struct({
    kind: Schema.Literal("ANIMAL"),
    animalRoles: Schema.optionalKey(Schema.Array(AnimalRole)),
  }),
  Schema.Struct({
    kind: Schema.Literal("TOOL"),
    toolUsages: Schema.optionalKey(Schema.Array(ToolUsage)),
  }),
  Schema.Struct({
    kind: Schema.Literal("RESOURCE"),
    resourceFormats: Schema.optionalKey(Schema.Array(ResourceFormat)),
  }),
  Schema.Struct({
    kind: Schema.Literal("CONTENT_PRODUCER"),
    contentChannelTypes: Schema.optionalKey(Schema.Array(ContentChannelType)),
  }),
  Schema.Struct({
    kind: WikiArticleKindWithoutSearchFilters,
  }),
])

export type WikiKindSearchFilters = typeof WikiKindSearchFilters.Type

const searchTextFields = { language: WikiSearchLanguage, text: WikiSearchText }

const [
  plantSearchFilters,
  bookSearchFilters,
  filmSearchFilters,
  noteworthyEntitySearchFilters,
  noteworthyPersonSearchFilters,
  animalSearchFilters,
  toolSearchFilters,
  resourceSearchFilters,
  contentProducerSearchFilters,
  withoutFiltersSearchFilters,
] = WikiKindSearchFilters.members

/** Adds the text fields to a kind's filters. Checks only read the filters, so they still hold. */
const withSearchText = { unsafePreserveChecks: true }

export const WikiSearchParams = Schema.Union([
  Schema.Struct({ kind: Schema.optional(Schema.Undefined), ...searchTextFields }),
  plantSearchFilters.mapFields(Struct.assign(searchTextFields), withSearchText),
  bookSearchFilters.mapFields(Struct.assign(searchTextFields), withSearchText),
  filmSearchFilters.mapFields(Struct.assign(searchTextFields), withSearchText),
  noteworthyEntitySearchFilters.mapFields(Struct.assign(searchTextFields), withSearchText),
  noteworthyPersonSearchFilters.mapFields(Struct.assign(searchTextFields), withSearchText),
  animalSearchFilters.mapFields(Struct.assign(searchTextFields), withSearchText),
  toolSearchFilters.mapFields(Struct.assign(searchTextFields), withSearchText),
  resourceSearchFilters.mapFields(Struct.assign(searchTextFields), withSearchText),
  contentProducerSearchFilters.mapFields(Struct.assign(searchTextFields), withSearchText),
  withoutFiltersSearchFilters.mapFields(Struct.assign(searchTextFields), withSearchText),
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
  evaluation: RevisionEvaluation.pick(["APPROVED", "REJECTED"]),
  reason: Schema.optional(Schema.Trimmed.check(Schema.isNonEmpty())),
})
export type EvaluateWikiArticleRevisionPayload = typeof EvaluateWikiArticleRevisionPayload.Type

export const EvaluateWikiArticleRevisionInput = Schema.Struct({
  wikiArticleId: Schema.optional(WikiArticleId),
  evaluatedById: PersonId,
  evaluation: EvaluateWikiArticleRevisionPayload.fields.evaluation,
  evaluationReason: Schema.optional(Schema.String),
  revisionId: WikiArticleRevisionId,
})

export type EvaluateWikiArticleRevisionInput = typeof EvaluateWikiArticleRevisionInput.Type

/** New revisions require an author even though deletion can clear persisted authorship. */
export const WikiArticleRevisionInsertRow = WikiArticleRevisionRow.pipe(
  Schema.fieldsAssign({ createdById: PersonId }),
)

/** System processes' revisions, such as places created from the gazetteer, have no author. */
export const WikiArticleSystemRevisionInsertRow = WikiArticleRevisionRow.pipe(
  Schema.fieldsAssign({ createdById: Schema.Null }),
)

export const WikiArticleRevisionUpdateRow = WikiArticleRevisionRow.mapFields(
  Struct.omit(["createdAt", "createdById", "crdtUpdate", "fromCrdtFrontier", "wikiArticleId"]),
)
