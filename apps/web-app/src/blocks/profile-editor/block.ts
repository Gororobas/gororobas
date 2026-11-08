import { Layer } from "effect"

import { ProfileAboutEditor, ProfileLocationsEditor, ProfileSettingsEditor } from "./blocks"
import { LocateDevice } from "./command"
import { ProfileEditorBlock } from "./definition"
import { init } from "./init"
import { update } from "./update"
import { view } from "./view"

export const layer = ProfileEditorBlock.makeLayer({
  init,
  update,
  view,
  EffectsLayer: LocateDevice.layer,
}).pipe(
  Layer.provide(
    Layer.mergeAll(
      ProfileAboutEditor.layer,
      ProfileLocationsEditor.layer,
      ProfileSettingsEditor.layer,
    ),
  ),
)

export { ProfileEditorBlock } from "./definition"
