import { Effect, Layer } from "effect"

import { CommandsLayer } from "./command"
import { ProfileAboutEditorBlock } from "./definition"
import { init } from "./init"
import { subscriptions } from "./subscription"
import { update } from "./update"
import { view } from "./view"

export const layer = ProfileAboutEditorBlock.makeLayer(
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

export { ProfileAboutEditorBlock } from "./definition"
