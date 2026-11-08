import { defineInMessageUnion } from "foldkit/message"

import { AnsweredSearch, SearchQuery } from "../../app/search-query"

/** What the app tells search, through its Binding's `informOfQueryChange` and `informOfOpenedResult`. */
export const InMessage = defineInMessageUnion({
  InformedOfQueryChange: { search: AnsweredSearch },
  /** The app reports leaving search through one of its results. */
  InformedOfOpenedResult: { query: SearchQuery },
})

export type InMessage = typeof InMessage.Type
