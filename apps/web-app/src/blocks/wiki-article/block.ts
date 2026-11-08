import { Layer } from "effect"

import { layer as PopoverDrawerLayer } from "../../ui/popover-drawer"
import { CommandsLayer } from "./command"
import { WikiArticleBlock } from "./definition"
import { init } from "./init"
import { subscriptions } from "./subscription"
import { update } from "./update"
import { view } from "./view/view"

export const layer = WikiArticleBlock.makeLayer({
  init,
  update,
  view,
  subscriptions,
  EffectsLayer: Layer.mergeAll(CommandsLayer, subscriptions.layer),
}).pipe(Layer.provide(PopoverDrawerLayer))

export { WikiArticleBlock } from "./definition"
