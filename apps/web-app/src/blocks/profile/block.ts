import { Layer } from "effect"

import { layer as PopoverDrawerLayer } from "../../ui/popover-drawer"
import { CommandsLayer } from "./command"
import { ProfileBlock } from "./definition"
import { init } from "./init"
import { ObserveCollectionEnd } from "./mount"
import { subscriptions } from "./subscription"
import { update } from "./update"
import { view } from "./view/view"

export const layer = ProfileBlock.makeLayer({
  init,
  update,
  view,
  subscriptions,
  EffectsLayer: Layer.mergeAll(CommandsLayer, subscriptions.layer, ObserveCollectionEnd.layer),
}).pipe(Layer.provide(PopoverDrawerLayer))

export { ProfileBlock } from "./definition"
