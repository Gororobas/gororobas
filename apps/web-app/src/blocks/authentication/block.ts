import { Layer } from "effect"
import { Block } from "foldkit"

import { CommandsLayer } from "./command"
import { AuthenticationComposition } from "./composition"
import { init } from "./init"
import { Message } from "./message"
import type { Model } from "./model"
import { subscriptions } from "./subscription"
import { update } from "./update"
import { view } from "./view"

const prepare = () =>
  AuthenticationComposition.prepareBlock({
    init,
    update,
    view,
    operations: { requestRestoreSession: Message.RequestedRestoreSession },
    subscriptions,
    EffectsLayer: Layer.mergeAll(CommandsLayer, subscriptions.layer),
  })

export const AuthenticationBlock: Block.FromAssemblyWithView<typeof Model, typeof prepare> =
  Block.assemble(prepare)
