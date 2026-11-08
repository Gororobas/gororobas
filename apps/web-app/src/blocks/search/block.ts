import { layer as PopoverLayer } from "@foldkit/ui/popover"
import { Layer } from "effect"

import { layer as DrawerLayer } from "../../ui/drawer"
import { CommandsLayer } from "./command"
import { SearchBlock } from "./definition"
import { init } from "./init"
import { subscriptions } from "./subscription"
import { inMessageUpdate, update } from "./update"
import { view } from "./view"

export const layer = SearchBlock.makeLayer({
  init,
  update,
  inMessageUpdate,
  view,
  subscriptions,
  EffectsLayer: Layer.mergeAll(CommandsLayer, subscriptions.layer),
}).pipe(Layer.provide(Layer.mergeAll(DrawerLayer, PopoverLayer)))

export { SearchBlock } from "./definition"
