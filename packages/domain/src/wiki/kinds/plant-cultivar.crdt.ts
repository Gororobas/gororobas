import { Effect, Schema } from "effect"
import { LoroDoc } from "loro-crdt"

import { toLoroValue } from "../../crdts/loro-values.js"
import { defineKindCrdtOperations } from "./define-kind-crdt-operations.js"
import { WikiPlantCultivarArticle, type PlantCultivarEditableAttributes } from "./plant-cultivar.js"

const replaceAttribute = <const Tag extends string, Value, Encoded>(
  tag: Tag,
  key: keyof PlantCultivarEditableAttributes,
  ValueSchema: Schema.Codec<Value, Encoded, never, never>,
) => {
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

export const WikiPlantCultivarArticleCrdtOperations = defineKindCrdtOperations([
  replaceAttribute("SetPlantCultivarParentPlantId", "parentPlantId", fields.parentPlantId),
  replaceAttribute("SetPlantCultivarScientificNames", "scientificNames", fields.scientificNames),
  replaceAttribute("SetPlantCultivarDevelopmentCycle", "developmentCycle", fields.developmentCycle),
  replaceAttribute("SetPlantCultivarHeight", "height", fields.height),
  replaceAttribute("SetPlantCultivarTemperature", "temperature", fields.temperature),
  replaceAttribute("SetPlantCultivarEdibleParts", "edibleParts", fields.edibleParts),
  replaceAttribute("SetPlantCultivarLifecycles", "lifecycles", fields.lifecycles),
  replaceAttribute("SetPlantCultivarPlantingMethods", "plantingMethods", fields.plantingMethods),
  replaceAttribute("SetPlantCultivarStrata", "strata", fields.strata),
  replaceAttribute("SetPlantCultivarUsage", "usage", fields.usage),
])

export type WikiPlantCultivarArticleAttributeEdit =
  typeof WikiPlantCultivarArticleCrdtOperations.AttributeEdit.Type
