import { Array as EffectArray, Option, Result } from "effect"

import { makeRange } from "../../common/range.js"
import { PartialDate, isPartialDateNotAfter, partialDateToIso } from "../../common/utils/dates.js"
import { defineCanonicalProperty } from "../property.js"
import { Wikidata, WikidataProperty, type WikidataPropertyId } from "../providers/wikidata.js"

export const LifespanProperty = defineCanonicalProperty({
  id: "lifespan",
  valueSchema: makeRange({
    bound: PartialDate,
    keys: { min: "born", max: "died" },
    isLessThanOrEqual: isPartialDateNotAfter,
    identifier: "Lifespan",
    title: "Lifespan",
  }),
  kinds: ["NOTEWORTHY_PERSON"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  presence: "OPTIONAL",
  sources: (source) => [
    source.person(),
    source.wikidata({
      // Two statements make one value: the first truthy birth (P569) and death (P570) dates.
      extract: (entity) => {
        const firstDate = (property: WikidataPropertyId) =>
          EffectArray.findFirst(
            Wikidata.statements(entity, property).map(Wikidata.time),
            Result.isSuccess,
          ).pipe(Option.map((date) => date.success))

        const born = firstDate(WikidataProperty.DATE_OF_BIRTH)
        const died = firstDate(WikidataProperty.DATE_OF_DEATH)

        return Option.isNone(born) && Option.isNone(died)
          ? []
          : [
              source.found({
                ...Option.match(born, { onNone: () => ({}), onSome: (date) => ({ born: date }) }),
                ...Option.match(died, { onNone: () => ({}), onSome: (date) => ({ died: date }) }),
              }),
            ]
      },
    }),
  ],
  schemaOrg: {
    match: "EXACT",
    encode: ({ born, died }) => ({
      ...(born === undefined ? {} : { birthDate: partialDateToIso(born) }),
      ...(died === undefined ? {} : { deathDate: partialDateToIso(died) }),
    }),
  },
})
