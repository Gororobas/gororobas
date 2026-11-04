import { Array as EffectArray, Option } from "effect"

import { LoadPlace } from "./command"
import { makeStep } from "./definition"

/** Picks a place from the search results and loads its outline. */
export const selectPlaceStep = (id: string) =>
  makeStep((model) =>
    Option.match(
      EffectArray.findFirst(model.searchResults, (place) => place.id === id),
      {
        onNone: () => ({ model }),
        onSome: (place) =>
          Option.match(model.maybeForm, {
            onNone: () => ({ model }),
            onSome: (form) =>
              // Already chosen, such as from the device's position: its outline is loaded.
              Option.exists(form.maybePlace, (current) => current.id === place.id)
                ? { model }
                : {
                    model: {
                      ...model,
                      maybeForm: Option.some({
                        ...form,
                        // Another municipality than the device's: its elevation doesn't apply.
                        maybeElevation: Option.none(),
                        maybeError: Option.none(),
                      }),
                    },
                    commands: [LoadPlace({ id: place.id })],
                  },
          }),
      },
    ),
  )

export const clearPlaceStep = makeStep((model) => ({
  model: {
    ...model,
    maybeForm: Option.map(model.maybeForm, (form) => ({
      ...form,
      maybePlace: Option.none(),
      maybeElevation: Option.none(),
    })),
  },
}))
