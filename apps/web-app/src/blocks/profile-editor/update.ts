import { Update } from "foldkit"

import { LocationsBinding, ProfileEditorComposition } from "./composition"
import { makeFieldsStep } from "./definition"

export const update = ProfileEditorComposition.makeUpdate({
  CompletedLocateDevice: (model, { deviceLocation }) =>
    Update.combineSteps([
      makeFieldsStep(() => ({ deviceLocation: () => deviceLocation })),
      LocationsBinding.informDeviceLocation(deviceLocation),
    ])(model),
})
