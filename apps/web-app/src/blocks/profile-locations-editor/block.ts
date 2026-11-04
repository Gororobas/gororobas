import { Layer } from "effect"
import { Block } from "foldkit"

import { CommandsLayer } from "./command"
import { ProfileLocationsEditorComposition } from "./composition"
import { init } from "./init"
import { Message } from "./message"
import type { Model } from "./model"
import { subscriptions } from "./subscription"
import { update } from "./update"
import { view } from "./view"

const prepare = () =>
  ProfileLocationsEditorComposition.prepareBlock({
    init,
    update,
    view,
    operations: { informOfDeviceLocation: Message.InformedOfDeviceLocation },
    subscriptions,
    EffectsLayer: Layer.mergeAll(CommandsLayer, subscriptions.layer),
  })

/** The signed-in person's location timeline: add, edit and remove where they are and have been. */
export const ProfileLocationsEditorBlock: Block.FromAssemblyWithViewAndOutMessage<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
