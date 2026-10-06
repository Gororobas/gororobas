import { Effect, Schema } from "effect"
import { LoroDoc } from "loro-crdt"

import { defineCrdtOperations } from "../../crdts/define-crdt-operations.js"
import { toLoroValue } from "../../crdts/loro-values.js"
import { WikiPlantCultivarArticle, type PlantCultivarEditableAttributes } from "./plant-cultivar.js"

const replaceAttribute = <const Tag extends string, Value, Encoded>({
  tag,
  key,
  ValueSchema,
}: {
  tag: Tag
  key: keyof PlantCultivarEditableAttributes
  ValueSchema: Schema.Codec<Value, Encoded, never, never>
}) => {
  const Message = Schema.TaggedStruct(tag, { value: ValueSchema })

  return {
    message: Message,
    handler: Effect.fn(tag)(function* (document: LoroDoc, payload: typeof Message.Type) {
      const encoded = yield* Schema.encodeEffect(Schema.toCodecJson(ValueSchema))(payload.value)
      // Keep the state and value atomic, including entire arrays and paired range endpoints.
      document.getMap("attributes").set(key, toLoroValue(encoded))
    }),
  }
}

const fields = WikiPlantCultivarArticle.EditableAttributes.fields

export const WikiPlantCultivarArticleCrdtOperations = defineCrdtOperations([
  replaceAttribute({
    tag: "SetPlantCultivarParentPlantId",
    key: "parentPlantId",
    ValueSchema: fields.parentPlantId,
  }),
  replaceAttribute({
    tag: "SetPlantCultivarScientificNames",
    key: "scientificNames",
    ValueSchema: fields.scientificNames,
  }),
  replaceAttribute({
    tag: "SetPlantCultivarDevelopmentCycle",
    key: "developmentCycle",
    ValueSchema: fields.developmentCycle,
  }),
  replaceAttribute({ tag: "SetPlantCultivarHeight", key: "height", ValueSchema: fields.height }),
  replaceAttribute({
    tag: "SetPlantCultivarTemperature",
    key: "temperature",
    ValueSchema: fields.temperature,
  }),
  replaceAttribute({
    tag: "SetPlantCultivarEdibleParts",
    key: "edibleParts",
    ValueSchema: fields.edibleParts,
  }),
  replaceAttribute({
    tag: "SetPlantCultivarLifecycles",
    key: "lifecycles",
    ValueSchema: fields.lifecycles,
  }),
  replaceAttribute({
    tag: "SetPlantCultivarPlantingMethods",
    key: "plantingMethods",
    ValueSchema: fields.plantingMethods,
  }),
  replaceAttribute({ tag: "SetPlantCultivarStrata", key: "strata", ValueSchema: fields.strata }),
  replaceAttribute({ tag: "SetPlantCultivarUsage", key: "usage", ValueSchema: fields.usage }),
])

export type WikiPlantCultivarArticleAttributeEdit =
  typeof WikiPlantCultivarArticleCrdtOperations.AttributeEdit.Type
