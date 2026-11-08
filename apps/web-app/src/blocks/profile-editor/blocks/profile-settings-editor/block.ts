import { Layer } from "effect"

import { CommandsLayer } from "./command"
import { ProfileSettingsEditorBlock } from "./definition"
import { init } from "./init"
import { subscriptions } from "./subscription"
import { update } from "./update"
import { view } from "./view"

export const layer = ProfileSettingsEditorBlock.makeLayer({
  init,
  update,
  view,
  subscriptions,
  EffectsLayer: Layer.mergeAll(CommandsLayer, subscriptions.layer),
})

export { ProfileSettingsEditorBlock } from "./definition"
