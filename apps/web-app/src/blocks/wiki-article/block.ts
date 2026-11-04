import { layer as PopoverLayer } from "@foldkit/ui/popover"
import { Effect, Layer } from "effect"

import { layer as DrawerLayer } from "../../ui/drawer"
import { CommandsLayer } from "./command"
import {
  AttributionPopoversBinding,
  BookmarkDrawerBinding,
  BookmarkPopoverBinding,
} from "./composition"
import { WikiArticleBlock } from "./definition"
import { init } from "./init"
import { subscriptions } from "./subscription"
import { update } from "./update"
import { view } from "./view/view"

export const layer = WikiArticleBlock.makeLayer(
  Effect.gen(function* () {
    const bookmarkPopover = yield* BookmarkPopoverBinding
    const bookmarkDrawer = yield* BookmarkDrawerBinding
    const attributionPopovers = yield* AttributionPopoversBinding

    return {
      children: [bookmarkPopover, bookmarkDrawer, attributionPopovers],
      init,
      update,
      view,
      subscriptions,
      EffectsLayer: Layer.mergeAll(CommandsLayer, subscriptions.layer),
    }
  }),
).pipe(Layer.provide(Layer.mergeAll(DrawerLayer, PopoverLayer)))

export { WikiArticleBlock } from "./definition"
