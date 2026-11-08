import { layer as ComboboxLayer } from "@foldkit/ui/combobox"
import { Layer } from "effect"

import { CommandsLayer } from "./command"
import { ProfileLocationsEditorBlock } from "./definition"
import { init } from "./init"
import { subscriptions } from "./subscription"
import { inMessageUpdate, update } from "./update"
import { view } from "./view"

export const layer = ProfileLocationsEditorBlock.makeLayer({
  init,
  update,
  inMessageUpdate,
  view,
  subscriptions,
  EffectsLayer: Layer.mergeAll(CommandsLayer, subscriptions.layer),
}).pipe(Layer.provide(ComboboxLayer))

export { ProfileLocationsEditorBlock } from "./definition"
