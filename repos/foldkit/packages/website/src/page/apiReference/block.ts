import { Block } from 'foldkit'

import { ApiReferenceComposition } from './composition'
import { init } from './init'
import { Message } from './message'
import type { Model } from './model'
import { EffectsLayer, update } from './update'
import { view } from './view'

const prepare = () =>
  ApiReferenceComposition.prepareBlock({
    init,
    update,
    view,
    operations: {
      informRouteChanged: Message.InformedOfRouteChange,
    },
    EffectsLayer,
  })
export const ApiReferenceBlock: Block.FromAssemblyWithView<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
