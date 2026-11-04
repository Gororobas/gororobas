import { defineMessageUnion } from "foldkit/message"

import { SearchQuery } from "../../app/route"

/** What the app tells search, through its Binding's `informQueryChange` and `informOpenedResult`. */
export const InMessage = defineMessageUnion({
  InformedOfQueryChange: { query: SearchQuery },
  /** The app reports leaving search through one of its results. */
  InformedOfOpenedResult: { query: SearchQuery },
})

export type InMessage = typeof InMessage.Type
