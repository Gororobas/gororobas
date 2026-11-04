import { Option } from "effect"

import { MyPlacesComposition } from "./composition"
import { Locations } from "./model"

export const init = MyPlacesComposition.makeInit(() => ({
  model: {
    locations: Locations.Loading(),
    reloadCount: 0,
    maybeForm: Option.none(),
    searchResults: [],
    maybeConfirmingDeleteId: Option.none(),
    maybeDeletingId: Option.none(),
    maybeListError: Option.none(),
  },
}))
