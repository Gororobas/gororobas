import { SyntropediaPlantId } from "../../common/external-identifiers.js"
import { defineProperty } from "../property.js"

/**
 * Identifiers drive every fetch, so no machine guesses them: people match a plant to Syntropedia's,
 * and a backfill by scientific name would be reviewed by a person who then asserts the results.
 * Syntropedia has no page per plant, so there's no `sameAs` to publish.
 */
export const SyntropediaPlantIdProperty = defineProperty({
  id: "syntropediaPlantId",
  valueSchema: SyntropediaPlantId,
  kinds: ["PLANT"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [source.person()],
})
