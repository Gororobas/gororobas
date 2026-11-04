import { Option } from "effect"

import { ProfileLocationsEditorComposition } from "./composition"
import { Locations } from "./model"

export const init = ProfileLocationsEditorComposition.makeInit(() => ({
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
