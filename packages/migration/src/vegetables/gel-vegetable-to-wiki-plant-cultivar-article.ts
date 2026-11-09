import {
  WikiPlantCultivarArticle,
  type WikiArticleId,
  type WikiPlantArticle,
} from "@gororobas/domain"
import { Option } from "effect"

const valueOrUnknown = <A, B>(value: Option.Option<A>, convert: (value: A) => B) =>
  Option.match(value, {
    onNone: () => ({ _tag: "Unknown" as const }),
    onSome: (present) => ({ _tag: "Value" as const, value: convert(present) }),
  })

export const plantAttributesToCultivar = (
  attributes: typeof WikiPlantArticle.EditableAttributes.Type,
  parentPlantId: WikiArticleId,
) =>
  WikiPlantCultivarArticle.EditableAttributes.make({
    parentPlantId,
    scientificNames: valueOrUnknown(attributes.scientificNames, (names) =>
      names.map((name) => name.value),
    ),
    developmentCycle: valueOrUnknown(
      Option.all({ min: attributes.developmentCycleMin, max: attributes.developmentCycleMax }),
      (range) => range,
    ),
    height: valueOrUnknown(
      Option.all({ min: attributes.heightMin, max: attributes.heightMax }),
      (range) => range,
    ),
    temperature: valueOrUnknown(
      Option.all({ min: attributes.temperatureMin, max: attributes.temperatureMax }),
      (range) => range,
    ),
    edibleParts: valueOrUnknown(attributes.edibleParts, (values) => Array.from(values)),
    lifecycles: valueOrUnknown(attributes.lifecycles, (values) => Array.from(values)),
    plantingMethods: valueOrUnknown(attributes.plantingMethods, (values) => Array.from(values)),
    strata: valueOrUnknown(attributes.strata, (values) => Array.from(values)),
    usage: valueOrUnknown(attributes.usage, (values) => Array.from(values)),
  })
