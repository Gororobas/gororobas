import { Layer } from "effect"
import { Block } from "foldkit"

import { CommandsLayer } from "./command"
import { SearchComposition } from "./composition"
import { init } from "./init"
import { Message } from "./message"
import type { Model } from "./model"
import { subscriptions } from "./subscription"
import { update } from "./update"
import { view } from "./view"

const prepare = () =>
  SearchComposition.prepareBlock({
    init,
    update,
    view,
    operations: {
      informQueryChanged: Message.InformedOfQueryChange,
      informOpenedResult: Message.InformedOfOpenedResult,
    },
    subscriptions,
    EffectsLayer: Layer.mergeAll(CommandsLayer, subscriptions.layer),
  })

export const SearchBlock: Block.FromAssemblyWithView<typeof Model, typeof prepare> =
  Block.assemble(prepare)
