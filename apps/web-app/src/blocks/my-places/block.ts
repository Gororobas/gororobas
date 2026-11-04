import { Layer } from "effect"
import { Block } from "foldkit"

import { CommandsLayer } from "./command"
import { MyPlacesComposition } from "./composition"
import { init } from "./init"
import type { Model } from "./model"
import { subscriptions } from "./subscription"
import { update } from "./update"
import { view } from "./view"

const prepare = () =>
  MyPlacesComposition.prepareBlock({
    init,
    update,
    view,
    subscriptions,
    EffectsLayer: Layer.mergeAll(CommandsLayer, subscriptions.layer),
  })

/** The signed-in person's location timeline: add, edit and remove where they are and have been. */
export const MyPlacesBlock: Block.FromAssemblyWithView<typeof Model, typeof prepare> =
  Block.assemble(prepare)
