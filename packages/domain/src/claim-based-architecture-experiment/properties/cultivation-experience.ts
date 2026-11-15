import { Option, Schema } from "effect"

import { WikiArticleId } from "../../common/ids.js"
import { defineSituatedProperty } from "../property.js"

/** How a cultivation went, from thriving to failing. */
export const CultivationOutcome = Schema.Literals(["THRIVED", "WENT_WELL", "STRUGGLED", "FAILED"])

export type CultivationOutcome = typeof CultivationOutcome.Type

/**
 * Someone growing a plant or raising an animal somewhere, and how it went: "o mamão até que
 * cresce bem no Cerrado". Replaces `growsIn`, which read as a botanical fact. A place's page lists
 * what people grew and raised there through `references`.
 *
 * The place is part of the value, not only the claim's context: Joana may write from Urubici
 * about her parents' farm in the Cerrado. The scale and its questions will need iterating.
 */
export const CultivationExperienceProperty = defineSituatedProperty({
  id: "cultivationExperience",
  valueSchema: Schema.Struct({
    place: WikiArticleId,
    outcome: CultivationOutcome,
    /** Null when they didn't say. */
    wouldDoAgain: Schema.NullOr(Schema.Boolean),
  }),
  kinds: ["PLANT", "PLANT_CULTIVAR", "ANIMAL"],
  scope: "UNIVERSAL",
  sources: (source) => ({ person: source.person({ inferable: true }) }),
  summary: (summarize) => summarize.wholeValues(),
  inheritance: { through: ["cultivarOf"], mode: "ALONGSIDE" },
  references: { targetKinds: ["PLACE"], target: ({ place }) => Option.some(place) },
})
