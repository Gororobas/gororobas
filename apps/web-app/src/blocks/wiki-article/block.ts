import { Layer } from "effect"
import { Block } from "foldkit"

import { CommandsLayer } from "./command"
import { WikiArticleComposition } from "./composition"
import { init } from "./init"
import type { Model } from "./model"
import { subscriptions } from "./subscription"
import { update } from "./update"
import { view } from "./view/view"

const prepare = () =>
  WikiArticleComposition.prepareBlock({
    init,
    update,
    view,
    subscriptions,
    EffectsLayer: Layer.mergeAll(CommandsLayer, subscriptions.layer),
  })

export const WikiArticleBlock: Block.FromAssemblyWithView<typeof Model, typeof prepare> =
  Block.assemble(prepare)
