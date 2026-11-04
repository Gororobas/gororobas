import { Schema } from "effect"

import { PlaceKind } from "../../common/enums.js"
import { GeoNamesId, WhosOnFirstId, WikidataId } from "../../common/external-identifiers.js"
import { WikiArticleId } from "../../common/ids.js"
import { OptionalColumn } from "../../common/primitives.js"
import { defineKind } from "./define-kind.js"

const ProjectedAttributes = Schema.Struct({
  placeKind: OptionalColumn(PlaceKind),
  /** Set on places created from the gazetteer, which keeps their shape and hierarchy. */
  whosOnFirstId: OptionalColumn(WhosOnFirstId),
  wikidataId: OptionalColumn(WikidataId),
  geonamesId: OptionalColumn(GeoNamesId),
  /** The PLACE article containing this one: a municipality's state, a state's country. */
  parentPlaceId: OptionalColumn(WikiArticleId),
})

export const WikiPlaceArticle = defineKind({
  EditableTranslationFields: {},
  Kind: Schema.Literal("PLACE"),
  EditableAttributes: ProjectedAttributes,
  ProjectedAttributes,
  projectAttributes: (editableAttributes) => ProjectedAttributes.make(editableAttributes),
})

export type PlaceArticleKind = typeof WikiPlaceArticle.Kind.Type
export type PlaceEditableAttributes = typeof WikiPlaceArticle.EditableAttributes.Type
export type PlaceProjectedAttributes = typeof WikiPlaceArticle.ProjectedAttributes.Type
export type PlaceEditableArticle = typeof WikiPlaceArticle.EditableArticle.Type
export type PlaceProjectionRow = typeof WikiPlaceArticle.ProjectionRow.Type
