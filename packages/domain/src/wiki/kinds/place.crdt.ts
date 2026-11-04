import { Effect } from "effect"

import { PlaceKind } from "../../common/enums.js"
import { GeoNamesId, WhosOnFirstId, WikidataId } from "../../common/external-identifiers.js"
import { WikiArticleId } from "../../common/ids.js"
import { defineCrdtOperations } from "../../crdts/define-crdt-operations.js"
import { makeOptionalScalarEditOperations } from "../../crdts/optional-scalar-edit-operations.js"
import type { PlaceEditableAttributes } from "./place.js"

const placeKindOperations = makeOptionalScalarEditOperations("PlaceKind")({
  ValueSchema: PlaceKind,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "placeKind" satisfies keyof PlaceEditableAttributes,
})

const whosOnFirstIdOperations = makeOptionalScalarEditOperations("PlaceWhosOnFirstId")({
  ValueSchema: WhosOnFirstId,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "whosOnFirstId" satisfies keyof PlaceEditableAttributes,
})

const wikidataIdOperations = makeOptionalScalarEditOperations("PlaceWikidataId")({
  ValueSchema: WikidataId,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "wikidataId" satisfies keyof PlaceEditableAttributes,
})

const geonamesIdOperations = makeOptionalScalarEditOperations("PlaceGeoNamesId")({
  ValueSchema: GeoNamesId,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "geonamesId" satisfies keyof PlaceEditableAttributes,
})

const parentPlaceIdOperations = makeOptionalScalarEditOperations("PlaceParentPlaceId")({
  ValueSchema: WikiArticleId,
  getParentContainer: (document) => Effect.succeed(document.getMap("attributes")),
  keyInParentContainer: "parentPlaceId" satisfies keyof PlaceEditableAttributes,
})

export const WikiPlaceArticleCrdtOperations = defineCrdtOperations([
  ...placeKindOperations,
  ...whosOnFirstIdOperations,
  ...wikidataIdOperations,
  ...geonamesIdOperations,
  ...parentPlaceIdOperations,
])

export type WikiPlaceArticleAttributeEdit = typeof WikiPlaceArticleCrdtOperations.AttributeEdit.Type
