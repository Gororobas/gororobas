import { Block } from 'foldkit'

import { RoomComposition } from './composition'
import { init } from './init'
import { EffectsLayer } from './layer'
import { Message } from './message'
import type { Model } from './model'
import { subscriptions } from './subscription'
import { update } from './update'
import { view } from './view'

const prepare = () =>
  RoomComposition.prepareBlock({
    init,
    update,
    view,
    operations: { informJoined: Message.InformedOfJoin },
    subscriptions,
    EffectsLayer,
  })
export const RoomBlock: Block.FromAssemblyWithView<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
