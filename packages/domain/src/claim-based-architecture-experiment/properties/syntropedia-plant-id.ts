import { SyntropediaPlantId } from "../../common/external-identifiers.js"
import { defineCanonicalProperty } from "../property.js"

/**
 * Identifiers drive every fetch, so no machine guesses them: people match a plant to Syntropedia's.
 * Syntropedia has no page per plant, so there's no `sameAs` to publish.
 */
export const SyntropediaPlantIdProperty = defineCanonicalProperty({
  id: "syntropediaPlantId",
  valueSchema: SyntropediaPlantId,
  kinds: ["PLANT"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [source.person()],
})
