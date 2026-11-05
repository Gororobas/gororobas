import { Effect, Layer } from "effect"

import { layer as PopoverDrawerLayer } from "../../ui/popover-drawer"
import { CommandsLayer } from "./command"
import { AttributionsBinding, BookmarkPickerBinding, ClassificationBinding } from "./composition"
import { WikiArticleBlock } from "./definition"
import { init } from "./init"
import { subscriptions } from "./subscription"
import { update } from "./update"
import { view } from "./view/view"

export const layer = WikiArticleBlock.makeLayer(
  Effect.gen(function* () {
    const bookmarkPicker = yield* BookmarkPickerBinding
    const classification = yield* ClassificationBinding
    const attributions = yield* AttributionsBinding

    return {
      children: [bookmarkPicker, classification, attributions],
      init,
      update,
      view,
      subscriptions,
      EffectsLayer: Layer.mergeAll(CommandsLayer, subscriptions.layer),
    }
  }),
).pipe(Layer.provide(PopoverDrawerLayer))

export { WikiArticleBlock } from "./definition"
