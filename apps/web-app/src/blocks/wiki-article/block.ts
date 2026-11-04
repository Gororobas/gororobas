import { Effect, Layer } from "effect"

import { CommandsLayer } from "./command"
import { WikiArticleBlock } from "./definition"
import { init } from "./init"
import { subscriptions } from "./subscription"
import { update } from "./update"
import { view } from "./view/view"

export const layer = WikiArticleBlock.makeLayer(
  Effect.gen(function* () {
    return {
      children: [],
      init,
      update,
      view,
      subscriptions,
      EffectsLayer: Layer.mergeAll(CommandsLayer, subscriptions.layer),
    }
  }),
)

export { WikiArticleBlock } from "./definition"
