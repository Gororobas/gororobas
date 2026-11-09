import { InheritableTrait } from "../kinds.js"
import { defineProperty } from "../property.js"

/**
 * Today's `CultivarProperty` wrapper (`Unknown | Inherit | Value`) on every cultivar attribute,
 * turned inside out: a trait listed here shows the plant's values, a trait with claims of its own
 * shows those, and neither is unknown. Plant properties stay plain for plants.
 */
export const InheritsFromParentProperty = defineProperty({
  id: "inheritsFromParent",
  valueSchema: InheritableTrait,
  kinds: ["PLANT_CULTIVAR"],
  scope: "UNIVERSAL",
  cardinality: "SET",
  mergeStrategy: "ALL_SOURCES",
  sources: ["PERSON"],
})
