import { Effect, Layer } from "effect"

import { CommandsLayer } from "./command"
import { AuthenticationBlock } from "./definition"
import { init } from "./init"
import { subscriptions } from "./subscription"
import { inMessageUpdate, update } from "./update"
import { view } from "./view"

export const layer = AuthenticationBlock.makeLayer(
  Effect.gen(function* () {
    return {
      children: [],
      init,
      update,
      inMessageUpdate,
      view,
      subscriptions,
      EffectsLayer: Layer.mergeAll(CommandsLayer, subscriptions.layer),
    }
  }),
)

export { AuthenticationBlock } from "./definition"
