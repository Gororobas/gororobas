import { InheritablePropertyId } from "../inheritance.js"
import { defineCanonicalProperty } from "../property.js"

/**
 * A property listed here shows the ancestors' values, a property with claims of its own shows
 * those, and neither is unknown. Only `BY_CHOICE` properties are listed:
 * `ALONGSIDE` ones always show the ancestors' beneath the article's own (`inheritance.ts`).

 @todo I think this shouldn't exist, inheritance should be at the view/resolution/materialization level, not at the property level
 */
export const InheritedPropertiesProperty = defineCanonicalProperty({
  id: "inheritedProperties",
  valueSchema: InheritablePropertyId,
  kinds: ["PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  sources: (source) => [source.person()],
})
