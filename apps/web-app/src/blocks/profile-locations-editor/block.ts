import { layer as ComboboxLayer } from "@foldkit/ui/combobox"
import { Effect, Layer } from "effect"

import { CommandsLayer } from "./command"
import { PlaceComboboxBinding } from "./composition"
import { ProfileLocationsEditorBlock } from "./definition"
import { init } from "./init"
import { subscriptions } from "./subscription"
import { inMessageUpdate, update } from "./update"
import { view } from "./view"

export const layer = ProfileLocationsEditorBlock.makeLayer(
  Effect.gen(function* () {
    const placeCombobox = yield* PlaceComboboxBinding

    return {
      children: [placeCombobox],
      init,
      update,
      inMessageUpdate,
      view,
      subscriptions,
      EffectsLayer: Layer.mergeAll(CommandsLayer, subscriptions.layer),
    }
  }),
).pipe(Layer.provide(ComboboxLayer))

export { ProfileLocationsEditorBlock } from "./definition"
